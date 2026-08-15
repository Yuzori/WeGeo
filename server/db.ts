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

const now = () => new Date().toISOString();

type Row = Record<string, unknown>;

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
    notes: (r.notes as string) ?? null,
    seenCount: r.seen_count as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function toSearch(r: Row): SearchRecord {
  return {
    id: r.id as number,
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
  };
}

/* ------------------------------------------------------------------ leads */

export interface LeadInput {
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
  const existing = db.prepare('SELECT * FROM leads WHERE place_key = ?').get(input.placeKey) as Row | undefined;

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
        (place_key, name, category, address, phone, website, website_kind, rating, review_count,
         maps_url, lat, lng, city, domain, status, seen_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'nouveau',1,?,?)`,
    )
    .run(
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

export interface LeadFilters {
  status?: LeadStatus;
  city?: string;
  domain?: string;
  query?: string;
  searchId?: number;
  /** 'sans' = uniquement sans site web, 'avec' = uniquement avec site. */
  website?: 'sans' | 'avec';
}

export function listLeads(f: LeadFilters = {}): Lead[] {
  const where: string[] = [];
  const params: unknown[] = [];

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
    where.push('(l.name LIKE ? OR l.address LIKE ? OR l.phone LIKE ? OR l.category LIKE ?)');
    const q = `%${f.query}%`;
    params.push(q, q, q, q);
  }
  if (f.searchId) {
    where.push('l.id IN (SELECT lead_id FROM search_leads WHERE search_id = ?)');
    params.push(f.searchId);
  }

  const sql = `SELECT l.* FROM leads l
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY l.updated_at DESC, l.id DESC`;

  return (db.prepare(sql).all(...(params as never[])) as Row[]).map(toLead);
}

export function getLead(id: number): Lead | null {
  const r = db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Row | undefined;
  return r ? toLead(r) : null;
}

export function setLeadStatus(id: number, status: LeadStatus): Lead | null {
  db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), id);
  return getLead(id);
}

export function setLeadStatusBulk(ids: number[], status: LeadStatus): number {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db
    .prepare(`UPDATE leads SET status = ?, updated_at = ? WHERE id IN (${placeholders})`)
    .run(status, now(), ...(ids as never[]));
  return Number(info.changes);
}

export function setLeadNotes(id: number, notes: string): Lead | null {
  db.prepare('UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?').run(notes, now(), id);
  return getLead(id);
}

export function deleteLead(id: number): void {
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
}

export function deleteLeadsBulk(ids: number[]): number {
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(',');
  const info = db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...(ids as never[]));
  return Number(info.changes);
}

/** Fiches déjà traitées : on ne veut plus les revoir dans les résultats de recherche. */
export function handledPlaceKeys(): Set<string> {
  const rows = db.prepare(`SELECT place_key FROM leads WHERE status IN ('termine','perdu')`).all() as Row[];
  return new Set(rows.map((r) => r.place_key as string));
}

export function knownCities(): string[] {
  const rows = db.prepare('SELECT DISTINCT city FROM leads ORDER BY city').all() as Row[];
  return rows.map((r) => r.city as string);
}

export function knownDomains(): string[] {
  const rows = db.prepare('SELECT DISTINCT domain FROM leads ORDER BY domain').all() as Row[];
  return rows.map((r) => r.domain as string);
}

/* --------------------------------------------------------------- searches */

export function createSearch(city: string, domains: string[], options: SearchOptions): SearchRecord {
  const info = db
    .prepare('INSERT INTO searches (city, domains, options, status, created_at) VALUES (?,?,?,?,?)')
    .run(city, JSON.stringify(domains), JSON.stringify(options), 'en_cours', now());
  return getSearch(Number(info.lastInsertRowid))!;
}

export function getSearch(id: number): SearchRecord | null {
  const r = db.prepare('SELECT * FROM searches WHERE id = ?').get(id) as Row | undefined;
  return r ? toSearch(r) : null;
}

export function updateSearchProgress(id: number, scanned: number, found: number): void {
  db.prepare('UPDATE searches SET scanned = ?, found = ? WHERE id = ?').run(scanned, found, id);
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

export function listSearches(limit = 100): SearchRecord[] {
  return (
    db.prepare('SELECT * FROM searches ORDER BY id DESC LIMIT ?').all(limit) as Row[]
  ).map(toSearch);
}

export function deleteSearch(id: number): void {
  db.prepare('DELETE FROM searches WHERE id = ?').run(id);
}

/** Une recherche restée « en_cours » après un redémarrage du serveur est orpheline. */
export function markStaleSearchesCancelled(): void {
  db.prepare(`UPDATE searches SET status = 'annule', finished_at = ? WHERE status = 'en_cours'`).run(now());
}

export function stats(): Stats {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all() as Row[];
  const base: Stats = { nouveau: 0, favori: 0, termine: 0, perdu: 0, total: 0, searches: 0 };
  for (const r of rows) {
    const key = r.status as LeadStatus;
    base[key] = r.n as number;
    base.total += r.n as number;
  }
  const s = db.prepare('SELECT COUNT(*) AS n FROM searches').get() as Row;
  base.searches = s.n as number;
  return base;
}

export default db;
