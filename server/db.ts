import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Lead, LeadStatus, SearchOptions, SearchRecord, Stats, WebsiteKind } from '../shared/types.ts';

const DB_PATH = process.env.WEGEO_DB ?? resolve(process.cwd(), 'data', 'wegeo.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    place_key    TEXT    NOT NULL UNIQUE,
    name         TEXT    NOT NULL,
    category     TEXT,
    address      TEXT,
    phone        TEXT,
    website      TEXT,
    website_kind TEXT    NOT NULL DEFAULT 'aucun',
    rating       REAL,
    review_count INTEGER,
    maps_url     TEXT    NOT NULL,
    lat          REAL,
    lng          REAL,
    city         TEXT    NOT NULL,
    domain       TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'nouveau',
    notes        TEXT,
    seen_count   INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_city   ON leads(city);

  CREATE TABLE IF NOT EXISTS searches (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    city        TEXT    NOT NULL,
    domains     TEXT    NOT NULL,
    options     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'en_cours',
    scanned     INTEGER NOT NULL DEFAULT 0,
    found       INTEGER NOT NULL DEFAULT 0,
    error       TEXT,
    created_at  TEXT    NOT NULL,
    finished_at TEXT,
    duration_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS search_leads (
    search_id INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
    lead_id   INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    PRIMARY KEY (search_id, lead_id)
  );
`);

/**
 * Ajouts de colonnes sur une base déjà créée. SQLite n'a pas d'`ADD COLUMN IF
 * NOT EXISTS`, d'où la lecture du schéma avant de modifier.
 */
function addColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Row[];
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// Suivi des tâches (métier × secteur) accomplies, pour reprendre une recherche
// interrompue là où elle s'est arrêtée.
addColumn('searches', 'total_tasks', 'INTEGER');
addColumn('searches', 'done_tasks', 'TEXT');

const now = () => new Date().toISOString();

type Row = Record<string, unknown>;

migrateTenancy();

function migrateTenancy(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      stripe_customer_id     TEXT,
      stripe_subscription_id TEXT,
      plan                   TEXT,
      status                 TEXT    NOT NULL DEFAULT 'none',
      created_at             TEXT    NOT NULL,
      updated_at             TEXT    NOT NULL
    );
  `);

  addColumn('leads', 'user_id', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('searches', 'user_id', 'INTEGER NOT NULL DEFAULT 0');

  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'`).get() as
    | { sql: string }
    | undefined;
  if (schema?.sql.includes('place_key    TEXT    NOT NULL UNIQUE') || /place_key\s+TEXT\s+NOT NULL UNIQUE/.test(schema?.sql ?? '')) {
    rebuildLeadsForTenancy();
  } else {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_user_place ON leads(user_id, place_key)');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_leads_user ON leads(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_searches_user ON searches(user_id)');
  migrateAuthExtras();
  migrateUsernames();
  addColumn('users', 'needs_username', 'INTEGER NOT NULL DEFAULT 0');
  migrateWorkspaces();
}

addColumn('leads', 'dirigeant', 'TEXT');
addColumn('leads', 'dirigeant_source', 'TEXT');
addColumn('leads', 'dirigeant_status', 'TEXT');

function migrateAuthExtras(): void {
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Row[];
  const hadVerified = userCols.some((c) => c.name === 'email_verified');
  addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('users', 'google_id', 'TEXT');
  addColumn('users', 'google_refresh_token', 'TEXT');
  addColumn('users', 'google_access_token', 'TEXT');
  addColumn('users', 'google_token_expiry', 'TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_id) WHERE google_id IS NOT NULL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL,
      purpose    TEXT    NOT NULL,
      code_hash  TEXT    NOT NULL,
      payload    TEXT,
      attempts   INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT    NOT NULL,
      created_at TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, purpose);
  `);
  if (!hadVerified) {
    db.prepare("UPDATE users SET email_verified = 1 WHERE password_hash != ''").run();
  }
}

function usernameSeed(email: string): string {
  const local = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '') ?? '';
  let base = local.replace(/^[^a-z]+/, '') || 'user';
  if (base.length < 3) base = `${base}user`;
  return base.slice(0, 24);
}

function migrateUsernames(): void {
  addColumn('users', 'username', 'TEXT');
  const taken = new Set(
    (db.prepare(`SELECT username FROM users WHERE username IS NOT NULL AND username != ''`).all() as Row[])
      .map((row) => String(row.username).toLowerCase()),
  );
  const rows = db.prepare('SELECT id, email, username FROM users').all() as Row[];
  const update = db.prepare('UPDATE users SET username = ? WHERE id = ?');
  for (const row of rows) {
    const current = String(row.username ?? '').trim().toLowerCase();
    if (current) {
      taken.add(current);
      continue;
    }
    const base = usernameSeed(String(row.email));
    let candidate = base;
    let n = 0;
    while (taken.has(candidate)) {
      n += 1;
      const suffix = String(n);
      candidate = `${base.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
    }
    taken.add(candidate);
    update.run(candidate, Number(row.id));
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL AND username != ''`);
}

export function ensurePersonalWorkspace(userId: number): number {
  const existing = db
    .prepare('SELECT id FROM workspaces WHERE owner_id = ? AND personal = 1')
    .get(userId) as Row | undefined;
  if (existing) return Number(existing.id);
  const info = db
    .prepare('INSERT INTO workspaces (name, owner_id, personal, created_at) VALUES (?,?,1,?)')
    .run('Personnel', userId, now());
  const id = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?,?,?,?)').run(
    id,
    userId,
    'owner',
    now(),
  );
  return id;
}

function migrateWorkspaces(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      personal   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL
    );
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role         TEXT    NOT NULL DEFAULT 'member',
      joined_at    TEXT    NOT NULL,
      PRIMARY KEY (workspace_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS workspace_invites (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      email         TEXT    NOT NULL,
      from_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status        TEXT    NOT NULL DEFAULT 'pending',
      created_at    TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_invites_email ON workspace_invites(email, status);
  `);
  addColumn('workspaces', 'auto_named', 'INTEGER NOT NULL DEFAULT 0');

  const users = db.prepare('SELECT id FROM users').all() as Row[];
  for (const user of users) ensurePersonalWorkspace(Number(user.id));

  addColumn('leads', 'workspace_id', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('searches', 'workspace_id', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    UPDATE leads SET workspace_id = (
      SELECT w.id FROM workspaces w WHERE w.owner_id = leads.user_id AND w.personal = 1 LIMIT 1
    ) WHERE workspace_id = 0 AND user_id != 0
  `);
  db.exec(`
    UPDATE searches SET workspace_id = (
      SELECT w.id FROM workspaces w WHERE w.owner_id = searches.user_id AND w.personal = 1 LIMIT 1
    ) WHERE workspace_id = 0 AND user_id != 0
  `);

  const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'leads'`).get() as
    | { sql: string }
    | undefined;
  if (/UNIQUE\s*\(\s*user_id\s*,\s*place_key\s*\)/i.test(schema?.sql ?? '')) {
    rebuildLeadsForWorkspaces();
  } else {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_workspace_place ON leads(workspace_id, place_key)');
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_leads_workspace ON leads(workspace_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_searches_workspace ON searches(workspace_id)');
}

function rebuildLeadsForWorkspaces(): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE leads_v3 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL DEFAULT 0,
      workspace_id INTEGER NOT NULL DEFAULT 0,
      place_key    TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      category     TEXT,
      address      TEXT,
      phone        TEXT,
      website      TEXT,
      website_kind TEXT    NOT NULL DEFAULT 'aucun',
      rating       REAL,
      review_count INTEGER,
      maps_url     TEXT    NOT NULL,
      lat          REAL,
      lng          REAL,
      city         TEXT    NOT NULL,
      domain       TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'nouveau',
      notes        TEXT,
      seen_count   INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL,
      UNIQUE (workspace_id, place_key)
    );

    INSERT INTO leads_v3 (
      id, user_id, workspace_id, place_key, name, category, address, phone, website, website_kind,
      rating, review_count, maps_url, lat, lng, city, domain, status, notes, seen_count,
      created_at, updated_at
    )
    SELECT
      id, COALESCE(user_id, 0), COALESCE(workspace_id, 0), place_key, name, category, address, phone, website, website_kind,
      rating, review_count, maps_url, lat, lng, city, domain, status, notes, seen_count,
      created_at, updated_at
    FROM leads;

    DROP TABLE leads;
    ALTER TABLE leads_v3 RENAME TO leads;

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_city   ON leads(city);
    CREATE INDEX IF NOT EXISTS idx_leads_user   ON leads(user_id);
    CREATE INDEX IF NOT EXISTS idx_leads_workspace ON leads(workspace_id);
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

/** La clé Google n’est unique que par compte, pas sur toute l’instance. */
function rebuildLeadsForTenancy(): void {
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`
    CREATE TABLE leads_v2 (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL DEFAULT 0,
      place_key    TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      category     TEXT,
      address      TEXT,
      phone        TEXT,
      website      TEXT,
      website_kind TEXT    NOT NULL DEFAULT 'aucun',
      rating       REAL,
      review_count INTEGER,
      maps_url     TEXT    NOT NULL,
      lat          REAL,
      lng          REAL,
      city         TEXT    NOT NULL,
      domain       TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'nouveau',
      notes        TEXT,
      seen_count   INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL,
      UNIQUE (user_id, place_key)
    );

    INSERT INTO leads_v2 (
      id, user_id, place_key, name, category, address, phone, website, website_kind,
      rating, review_count, maps_url, lat, lng, city, domain, status, notes, seen_count,
      created_at, updated_at
    )
    SELECT
      id, COALESCE(user_id, 0), place_key, name, category, address, phone, website, website_kind,
      rating, review_count, maps_url, lat, lng, city, domain, status, notes, seen_count,
      created_at, updated_at
    FROM leads;

    DROP TABLE leads;
    ALTER TABLE leads_v2 RENAME TO leads;

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_city   ON leads(city);
    CREATE INDEX IF NOT EXISTS idx_leads_user   ON leads(user_id);
  `);
  db.exec('PRAGMA foreign_keys = ON');
}

function toLead(r: Row): Lead {
  return {
    id: r.id as number,
    placeKey: r.place_key as string,
    name: r.name as string,
    category: (r.category as string) ?? null,
    address: (r.address as string) ?? null,
    phone: (r.phone as string) ?? null,
    website: (r.website as string) ?? null,
    websiteKind: (r.website_kind as WebsiteKind) ?? 'aucun',
    rating: (r.rating as number) ?? null,
    reviewCount: (r.review_count as number) ?? null,
    mapsUrl: r.maps_url as string,
    lat: (r.lat as number) ?? null,
    lng: (r.lng as number) ?? null,
    city: r.city as string,
    domain: r.domain as string,
    status: r.status as LeadStatus,
    dirigeant: (r.dirigeant as string) || null,
    dirigeantSource: (r.dirigeant_source as string) || null,
    dirigeantStatus: (r.dirigeant_status as Lead['dirigeantStatus']) || ((r.dirigeant as string) ? 'found' : null),
    notes: (r.notes as string) ?? null,
    seenCount: r.seen_count as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function parseTasks(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function toSearch(r: Row): SearchRecord {
  return {
    id: r.id as number,
    userId: (r.user_id as number) ?? 0,
    workspaceId: (r.workspace_id as number) ?? 0,
    city: r.city as string,
    domains: JSON.parse(r.domains as string) as string[],
    options: JSON.parse(r.options as string) as SearchOptions,
    status: r.status as SearchRecord['status'],
    scanned: r.scanned as number,
    found: r.found as number,
    error: (r.error as string) ?? null,
    createdAt: r.created_at as string,
    finishedAt: (r.finished_at as string) ?? null,
    durationMs: (r.duration_ms as number) ?? null,
    totalTasks: (r.total_tasks as number) ?? null,
    doneTasks: parseTasks(r.done_tasks).length,
  };
}

/* ------------------------------------------------------------------ leads */

export interface LeadInput {
  workspaceId: number;
  userId: number;
  placeKey: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  websiteKind: WebsiteKind;
  rating: number | null;
  reviewCount: number | null;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  city: string;
  domain: string;
}

/**
 * Insère l'entreprise, ou complète la fiche existante sans écraser
 * le statut ni les notes déjà saisies par l'utilisateur.
 */
export function upsertLead(input: LeadInput): { lead: Lead; isNew: boolean } {
  const existing = db
    .prepare('SELECT * FROM leads WHERE place_key = ? AND workspace_id = ?')
    .get(input.placeKey, input.workspaceId) as Row | undefined;

  if (existing) {
    db.prepare(
      `UPDATE leads SET
         name         = ?,
         category     = COALESCE(?, category),
         address      = COALESCE(?, address),
         phone        = COALESCE(?, phone),
         website      = ?,
         website_kind = ?,
         rating       = COALESCE(?, rating),
         review_count = COALESCE(?, review_count),
         lat          = COALESCE(?, lat),
         lng          = COALESCE(?, lng),
         seen_count   = seen_count + 1,
         updated_at   = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.category,
      input.address,
      input.phone,
      input.website,
      input.websiteKind,
      input.rating,
      input.reviewCount,
      input.lat,
      input.lng,
      now(),
      existing.id as number,
    );
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(existing.id as number) as Row;
    return { lead: toLead(lead), isNew: false };
  }

  const ts = now();
  const info = db
    .prepare(
      `INSERT INTO leads
        (user_id, workspace_id, place_key, name, category, address, phone, website, website_kind, rating, review_count,
         maps_url, lat, lng, city, domain, status, seen_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nouveau',1,?,?)`,
    )
    .run(
      input.userId,
      input.workspaceId,
      input.placeKey,
      input.name,
      input.category,
      input.address,
      input.phone,
      input.website,
      input.websiteKind,
      input.rating,
      input.reviewCount,
      input.mapsUrl,
      input.lat,
      input.lng,
      input.city,
      input.domain,
      ts,
      ts,
    );

  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(info.lastInsertRowid)) as Row;
  return { lead: toLead(lead), isNew: true };
}

export function setLeadDirigeant(
  id: number,
  hit: { name: string | null; source: string | null; status: 'found' | 'missing' },
): Lead | null {
  const existing = db.prepare('SELECT id FROM leads WHERE id = ?').get(id) as Row | undefined;
  if (!existing) return null;
  db.prepare('UPDATE leads SET dirigeant = ?, dirigeant_source = ?, dirigeant_status = ?, updated_at = ? WHERE id = ?').run(
    hit.name,
    hit.source,
    hit.status,
    now(),
    id,
  );
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Row;
  return toLead(lead);
}

export interface LeadFilters {
  workspaceId: number;
  status?: LeadStatus;
  city?: string;
  domain?: string;
  query?: string;
  searchId?: number;
  /** 'sans' = uniquement sans site web, 'avec' = uniquement avec site. */
  website?: 'sans' | 'avec';
}

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export function listLeads(f: LeadFilters): Lead[] {
  const where: string[] = ['l.workspace_id = ?'];
  const params: unknown[] = [f.workspaceId];

  if (f.status) {
    where.push('l.status = ?');
    params.push(f.status);
  }
  if (f.city) {
    where.push('l.city = ?');
    params.push(f.city);
  }
  if (f.domain) {
    where.push('l.domain = ?');
    params.push(f.domain);
  }
  if (f.website === 'sans') where.push("l.website_kind != 'site'");
  if (f.website === 'avec') where.push("l.website_kind = 'site'");
  if (f.query) {
    where.push(
      "(l.name LIKE ? ESCAPE '\\' OR l.address LIKE ? ESCAPE '\\' OR l.phone LIKE ? ESCAPE '\\' OR l.category LIKE ? ESCAPE '\\' OR l.dirigeant LIKE ? ESCAPE '\\')",
    );
    const q = likeContains(f.query);
    params.push(q, q, q, q, q);
  }
  if (f.searchId) {
    where.push(
      'l.id IN (SELECT sl.lead_id FROM search_leads sl JOIN searches s ON s.id = sl.search_id WHERE sl.search_id = ? AND s.workspace_id = ?)',
    );
    params.push(f.searchId, f.workspaceId);
  }

  const sql = `SELECT l.* FROM leads l
    WHERE ${where.join(' AND ')}
    ORDER BY l.updated_at DESC, l.id DESC`;

  return (db.prepare(sql).all(...(params as never[])) as Row[]).map(toLead);
}

export function getLead(id: number, workspaceId: number): Lead | null {
  const r = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as Row | undefined;
  return r ? toLead(r) : null;
}

export function setLeadStatus(id: number, status: LeadStatus, workspaceId: number): Lead | null {
  db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(status, now(), id, workspaceId);
  return getLead(id, workspaceId);
}

export function setLeadStatusBulk(ids: number[], status: LeadStatus, workspaceId: number): number {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`UPDATE leads SET status = ?, updated_at = ? WHERE workspace_id = ? AND id IN (${placeholders})`)
    .run(status, now(), workspaceId, ...(ids as never[]));
  return Number(info.changes);
}

export function setLeadNotes(id: number, notes: string, workspaceId: number): Lead | null {
  db.prepare('UPDATE leads SET notes = ?, updated_at = ? WHERE id = ? AND workspace_id = ?').run(notes, now(), id, workspaceId);
  return getLead(id, workspaceId);
}

export function deleteLead(id: number, workspaceId: number): boolean {
  const info = db.prepare('DELETE FROM leads WHERE id = ? AND workspace_id = ?').run(id, workspaceId);
  return Number(info.changes) > 0;
}

export function deleteLeadsBulk(ids: number[], workspaceId: number): number {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`DELETE FROM leads WHERE workspace_id = ? AND id IN (${placeholders})`)
    .run(workspaceId, ...(ids as never[]));
  return Number(info.changes);
}

/** Fiches déjà traitées : on ne veut plus les revoir dans les résultats de recherche. */
export function handledPlaceKeys(workspaceId: number): Set<string> {
  const rows = db
    .prepare(`SELECT place_key FROM leads WHERE workspace_id = ? AND status IN ('termine','perdu')`)
    .all(workspaceId) as Row[];
  return new Set(rows.map((r) => r.place_key as string));
}

export function knownCities(workspaceId: number): string[] {
  const rows = db.prepare('SELECT DISTINCT city FROM leads WHERE workspace_id = ? ORDER BY city').all(workspaceId) as Row[];
  return rows.map((r) => r.city as string);
}

export function knownDomains(workspaceId: number): string[] {
  const rows = db.prepare('SELECT DISTINCT domain FROM leads WHERE workspace_id = ? ORDER BY domain').all(workspaceId) as Row[];
  return rows.map((r) => r.domain as string);
}

/* --------------------------------------------------------------- searches */

export function createSearch(
  workspaceId: number,
  userId: number,
  city: string,
  domains: string[],
  options: SearchOptions,
): SearchRecord {
  const info = db
    .prepare(
      'INSERT INTO searches (user_id, workspace_id, city, domains, options, status, created_at) VALUES (?,?,?,?,?,?,?)',
    )
    .run(userId, workspaceId, city, JSON.stringify(domains), JSON.stringify(options), 'en_cours', now());
  return getSearch(Number(info.lastInsertRowid))!;
}

export function getSearch(id: number, workspaceId?: number): SearchRecord | null {
  const r = (
    workspaceId == null
      ? db.prepare('SELECT * FROM searches WHERE id = ?').get(id)
      : db.prepare('SELECT * FROM searches WHERE id = ? AND workspace_id = ?').get(id, workspaceId)
  ) as Row | undefined;
  return r ? toSearch(r) : null;
}

export function updateSearchProgress(id: number, scanned: number, found: number): void {
  db.prepare('UPDATE searches SET scanned = ?, found = ? WHERE id = ?').run(scanned, found, id);
}

export function setSearchTotalTasks(id: number, total: number): void {
  db.prepare('UPDATE searches SET total_tasks = ? WHERE id = ?').run(total, id);
}

/** Clés des tâches (métier × secteur) déjà menées à bien pour cette recherche. */
export function searchDoneTasks(id: number): string[] {
  const r = db.prepare('SELECT done_tasks FROM searches WHERE id = ?').get(id) as Row | undefined;
  return r ? parseTasks(r.done_tasks) : [];
}

export function recordSearchTask(id: number, key: string): void {
  const done = searchDoneTasks(id);
  if (done.includes(key)) return;
  done.push(key);
  db.prepare('UPDATE searches SET done_tasks = ? WHERE id = ?').run(JSON.stringify(done), id);
}

/** Remet une recherche arrêtée en marche, sans perdre ses compteurs. */
export function reopenSearch(id: number): SearchRecord | null {
  db.prepare(`UPDATE searches SET status = 'en_cours', error = NULL, finished_at = NULL WHERE id = ?`).run(id);
  return getSearch(id);
}

export function finishSearch(
  id: number,
  status: SearchRecord['status'],
  error?: string | null,
): SearchRecord | null {
  const search = getSearch(id);
  const duration = search ? Date.now() - new Date(search.createdAt).getTime() : null;
  db.prepare('UPDATE searches SET status = ?, error = ?, finished_at = ?, duration_ms = ? WHERE id = ?').run(
    status,
    error ?? null,
    now(),
    duration,
    id,
  );
  return getSearch(id);
}

export function linkSearchLead(searchId: number, leadId: number): void {
  db.prepare('INSERT OR IGNORE INTO search_leads (search_id, lead_id) VALUES (?,?)').run(searchId, leadId);
}

export function listSearches(workspaceId: number, limit = 100): SearchRecord[] {
  return (
    db.prepare('SELECT * FROM searches WHERE workspace_id = ? ORDER BY id DESC LIMIT ?').all(workspaceId, limit) as Row[]
  ).map(toSearch);
}

export function deleteSearch(id: number, workspaceId: number): boolean {
  const info = db.prepare('DELETE FROM searches WHERE id = ? AND workspace_id = ?').run(id, workspaceId);
  return Number(info.changes) > 0;
}

/** Une recherche restée « en_cours » après un redémarrage du serveur est orpheline. */
export function markStaleSearchesCancelled(): void {
  db.prepare(`UPDATE searches SET status = 'annule', finished_at = ? WHERE status = 'en_cours'`).run(now());
}

export function stats(workspaceId: number): Stats {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM leads WHERE workspace_id = ? GROUP BY status').all(workspaceId) as Row[];
  const base: Stats = { nouveau: 0, favori: 0, termine: 0, perdu: 0, total: 0, searches: 0 };
  for (const r of rows) {
    const key = r.status as LeadStatus;
    base[key] = r.n as number;
    base.total += r.n as number;
  }
  const s = db.prepare('SELECT COUNT(*) AS n FROM searches WHERE workspace_id = ?').get(workspaceId) as Row;
  base.searches = s.n as number;
  return base;
}

export default db;
