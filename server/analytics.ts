/**
 * Statistiques site : évènements anonymes + tableau de bord protégé par mot de passe.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import db, { updateUserGeo } from './db.ts';
import { avatarUrl } from './avatars.ts';
import { geoLabel, locateRequest, type VisitorPlace } from './locate.ts';
import { userFromRequest } from './auth.ts';

type Row = Record<string, unknown>;

const STATS_COOKIE = 'prospy_stats';
const FUNNEL_STEPS = ['landing', 'pricing', 'signup', 'login', 'checkout', 'paid', 'app'] as const;
const LIVE_WINDOW_MS = 30 * 60 * 1000;

db.exec(`
  CREATE TABLE IF NOT EXISTS analytics_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id  TEXT    NOT NULL,
    event       TEXT    NOT NULL,
    path        TEXT,
    meta        TEXT,
    city        TEXT,
    region      TEXT,
    country     TEXT,
    lat         REAL,
    lng         REAL,
    created_at  TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics_events(event);
  CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_analytics_visitor ON analytics_events(visitor_id);
`);

function addAnalyticsColumn(column: string, definition: string): void {
  const columns = db.prepare('PRAGMA table_info(analytics_events)').all() as Row[];
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE analytics_events ADD COLUMN ${column} ${definition}`);
}

addAnalyticsColumn('city', 'TEXT');
addAnalyticsColumn('region', 'TEXT');
addAnalyticsColumn('country', 'TEXT');
addAnalyticsColumn('lat', 'REAL');
addAnalyticsColumn('lng', 'REAL');

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function statsPassword(): string {
  return process.env.STATS_PASSWORD?.trim() || 'mdp';
}

function statsToken(): string {
  const secret = process.env.SESSION_SECRET?.trim() || 'dev-stats';
  return createHmac('sha256', secret).update(`stats:${statsPassword()}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function setStatsCookie(res: Response): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${STATS_COOKIE}=${statsToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`,
  );
}

export function clearStatsCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${STATS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function requireStats(req: Request, res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[STATS_COOKIE];
  if (token && safeEqual(token, statsToken())) {
    next();
    return;
  }
  res.status(401).json({ error: 'Mot de passe incorrect.' });
}

export function verifyStatsPassword(password: string): boolean {
  const expected = statsPassword();
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isBotUserAgent(ua: string): boolean {
  return /bot|crawler|spider|preview|headless|uptime|monitor|curl|wget|python-requests/i.test(ua);
}

function shouldSkipTracking(req: Request, path?: string): boolean {
  if (path === '/prospy/stats') return true;
  const ua = String(req.headers['user-agent'] ?? '');
  if (isBotUserAgent(ua)) return true;
  return false;
}

function geoFromClient(raw: unknown): VisitorPlace | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const city = String(row.city ?? row.region ?? row.country ?? '')
    .trim()
    .slice(0, 48);
  const region = String(row.region ?? '').trim().slice(0, 48);
  const country = String(row.country ?? '').trim().slice(0, 48);
  if (!city && !region && !country) return null;
  return {
    city: city || region || country,
    region,
    country,
    lat,
    lng,
  };
}

async function resolveGeo(req: Request, clientRaw: unknown): Promise<VisitorPlace | null> {
  const serverGeo = await locateRequest(req).catch(() => null);
  if (serverGeo) return serverGeo;
  return geoFromClient(clientRaw);
}

function recordEventRow(params: {
  visitorId: string;
  event: string;
  path?: string;
  meta?: Record<string, string>;
  geo?: VisitorPlace | null;
}): void {
  db.prepare(
    `INSERT INTO analytics_events
      (visitor_id, event, path, meta, city, region, country, lat, lng, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    params.visitorId,
    params.event,
    params.path?.slice(0, 200) ?? null,
    params.meta ? JSON.stringify(params.meta) : null,
    params.geo?.city ?? null,
    params.geo?.region ?? null,
    params.geo?.country ?? null,
    params.geo?.lat ?? null,
    params.geo?.lng ?? null,
    new Date().toISOString(),
  );
}

export function recordEvent(params: {
  visitorId: string;
  event: string;
  path?: string;
  meta?: Record<string, string>;
}): void {
  const visitorId = params.visitorId.trim().slice(0, 80);
  const event = params.event.trim().slice(0, 80);
  if (!visitorId || !event) return;
  recordEventRow({ ...params, visitorId, event });
}

export async function recordEventFromRequest(
  req: Request,
  params: {
    visitorId: string;
    event: string;
    path?: string;
    meta?: Record<string, string>;
  },
): Promise<void> {
  const visitorId = params.visitorId.trim().slice(0, 80);
  const event = params.event.trim().slice(0, 80);
  if (!visitorId || !event) return;
  if (shouldSkipTracking(req, params.path)) return;

  const geo = await resolveGeo(req, (req.body as { geo?: unknown } | undefined)?.geo);
  recordEventRow({ ...params, visitorId, event, geo });

  const user = userFromRequest(req);
  if (user && geo) {
    updateUserGeo(user.id, geo);
  }
}

export interface GlobePoint {
  lat: number;
  lng: number;
  label: string;
  at: string;
  live: boolean;
}

export interface StatsAccount {
  id: number;
  email: string;
  username: string;
  createdAt: string;
  emailVerified: boolean;
  googleLinked: boolean;
  needsUsername: boolean;
  avatarUrl: string | null;
  plan: string | null;
  subscriptionStatus: string;
  geo: {
    city: string | null;
    region: string | null;
    country: string | null;
    label: string | null;
    lat: number | null;
    lng: number | null;
  };
  lastSeenAt: string | null;
}

export interface SiteStats {
  generatedAt: string;
  dbPath: string;
  visits: {
    pageviews: number;
    pageviewsToday: number;
    pageviewsWeek: number;
    uniqueVisitors: number;
    uniqueToday: number;
    liveNow: number;
  };
  topPages: { path: string; views: number }[];
  funnel: { step: string; label: string; visitors: number; dropFromPrevious: number | null }[];
  users: {
    total: number;
    today: number;
    week: number;
    verified: number;
  };
  accounts: StatsAccount[];
  subscriptions: {
    active: number;
    byPlan: { plan: string; count: number }[];
    byStatus: { status: string; count: number }[];
    newWeek: number;
  };
  product: {
    searches: number;
    searchesWeek: number;
    leads: number;
    workspaces: number;
  };
  globe: {
    live: GlobePoint[];
    all: GlobePoint[];
  };
  recent: { at: string; event: string; path: string | null; visitorId: string; geo: string | null }[];
}

const FUNNEL_LABELS: Record<(typeof FUNNEL_STEPS)[number], string> = {
  landing: 'Accueil',
  pricing: 'Tarifs',
  signup: 'Inscription',
  login: 'Connexion',
  checkout: 'Paiement',
  paid: 'Abonnement actif',
  app: 'Application',
};

function dayStart(daysAgo = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function weekStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

function liveSince(): string {
  return new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
}

function globePoints(liveOnly: boolean): GlobePoint[] {
  const since = liveSince();
  const rows = (
    db
      .prepare(
        `SELECT visitor_id AS visitorId, city, region, country, lat, lng, MAX(created_at) AS at
         FROM analytics_events
         WHERE event = 'pageview'
           AND lat IS NOT NULL AND lng IS NOT NULL
           ${liveOnly ? 'AND created_at >= ?' : ''}
         GROUP BY visitor_id
         ORDER BY at DESC
         LIMIT ${liveOnly ? 120 : 400}`,
      )
      .all(...(liveOnly ? [since] : [])) as Row[]
  ).map((row) => ({
    lat: Number(row.lat),
    lng: Number(row.lng),
    label: geoLabel({
      city: String(row.city ?? ''),
      region: String(row.region ?? ''),
      country: String(row.country ?? ''),
    }),
    at: String(row.at),
    live: liveOnly,
  }));

  return rows.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng));
}

function listAccounts(): StatsAccount[] {
  const rows = db
    .prepare(
      `SELECT u.id, u.email, u.username, u.created_at AS createdAt, u.email_verified AS emailVerified,
              u.google_id AS googleId, u.needs_username AS needsUsername,
              u.geo_city AS geoCity, u.geo_region AS geoRegion, u.geo_country AS geoCountry,
              u.geo_lat AS geoLat, u.geo_lng AS geoLng, u.last_seen_at AS lastSeenAt,
              s.plan, s.status AS subscriptionStatus
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 200`,
    )
    .all() as Row[];

  return rows.map((row) => {
    const city = row.geoCity == null ? null : String(row.geoCity);
    const region = row.geoRegion == null ? null : String(row.geoRegion);
    const country = row.geoCountry == null ? null : String(row.geoCountry);
    const lat = row.geoLat == null ? null : Number(row.geoLat);
    const lng = row.geoLng == null ? null : Number(row.geoLng);
    const id = Number(row.id);
    return {
      id,
      email: String(row.email),
      username: String(row.username ?? ''),
      createdAt: String(row.createdAt),
      emailVerified: Boolean(row.emailVerified),
      googleLinked: Boolean(row.googleId),
      needsUsername: Boolean(row.needsUsername),
      avatarUrl: avatarUrl(id),
      plan: row.plan == null ? null : String(row.plan),
      subscriptionStatus: String(row.subscriptionStatus ?? 'none'),
      geo: {
        city,
        region,
        country,
        label: city || region || country ? geoLabel({ city: city ?? '', region: region ?? '', country: country ?? '' }) : null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      },
      lastSeenAt: row.lastSeenAt == null ? null : String(row.lastSeenAt),
    };
  });
}

export function siteStats(): SiteStats {
  const today = dayStart();
  const week = weekStart();
  const live = liveSince();
  const humanFilter = `AND visitor_id NOT LIKE 'user:%'`;

  const pageviews = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM analytics_events WHERE event = 'pageview' ${humanFilter}`).get() as Row).n ?? 0,
  );
  const pageviewsToday = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM analytics_events WHERE event = 'pageview' AND created_at >= ? ${humanFilter}`)
        .get(today) as Row
    ).n ?? 0,
  );
  const pageviewsWeek = Number(
    (
      db
        .prepare(`SELECT COUNT(*) AS n FROM analytics_events WHERE event = 'pageview' AND created_at >= ? ${humanFilter}`)
        .get(week) as Row
    ).n ?? 0,
  );
  const uniqueVisitors = Number(
    (
      db
        .prepare(`SELECT COUNT(DISTINCT visitor_id) AS n FROM analytics_events WHERE event = 'pageview' ${humanFilter}`)
        .get() as Row
    ).n ?? 0,
  );
  const uniqueToday = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT visitor_id) AS n FROM analytics_events WHERE event = 'pageview' AND created_at >= ? ${humanFilter}`,
        )
        .get(today) as Row
    ).n ?? 0,
  );
  const liveNow = Number(
    (
      db
        .prepare(
          `SELECT COUNT(DISTINCT visitor_id) AS n FROM analytics_events WHERE event = 'pageview' AND created_at >= ? ${humanFilter}`,
        )
        .get(live) as Row
    ).n ?? 0,
  );

  const topPages = (
    db
      .prepare(
        `SELECT COALESCE(path, '/') AS path, COUNT(*) AS views
         FROM analytics_events WHERE event = 'pageview' ${humanFilter}
         GROUP BY path ORDER BY views DESC LIMIT 12`,
      )
      .all() as Row[]
  ).map((row) => ({ path: String(row.path), views: Number(row.views) }));

  const funnelCounts = FUNNEL_STEPS.map((step) =>
    Number(
      (
        db
          .prepare(`SELECT COUNT(DISTINCT visitor_id) AS n FROM analytics_events WHERE event = ? ${humanFilter}`)
          .get(`funnel:${step}`) as Row
      ).n ?? 0,
    ),
  );

  const funnel = FUNNEL_STEPS.map((step, index) => {
    const visitors = funnelCounts[index] ?? 0;
    const previous = index > 0 ? (funnelCounts[index - 1] ?? 0) : null;
    const dropFromPrevious =
      previous != null && previous > 0 ? Math.round((1 - visitors / previous) * 1000) / 10 : null;
    return {
      step,
      label: FUNNEL_LABELS[step],
      visitors,
      dropFromPrevious,
    };
  });

  const usersTotal = Number((db.prepare('SELECT COUNT(*) AS n FROM users').get() as Row).n ?? 0);
  const usersToday = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').get(today) as Row).n ?? 0,
  );
  const usersWeek = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?').get(week) as Row).n ?? 0,
  );
  const usersVerified = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM users WHERE email_verified = 1').get() as Row).n ?? 0,
  );

  const subsActive = Number(
    (db.prepare(`SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing')`).get() as Row).n ?? 0,
  );
  const subsByPlan = (
    db
      .prepare(
        `SELECT COALESCE(plan, 'inconnu') AS plan, COUNT(*) AS count
         FROM subscriptions WHERE status IN ('active', 'trialing')
         GROUP BY plan ORDER BY count DESC`,
      )
      .all() as Row[]
  ).map((row) => ({ plan: String(row.plan), count: Number(row.count) }));
  const subsByStatus = (
    db.prepare('SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status ORDER BY count DESC').all() as Row[]
  ).map((row) => ({ status: String(row.status), count: Number(row.count) }));
  const subsNewWeek = Number(
    (
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing') AND updated_at >= ?`,
        )
        .get(week) as Row
    ).n ?? 0,
  );

  const searches = Number((db.prepare('SELECT COUNT(*) AS n FROM searches').get() as Row).n ?? 0);
  const searchesWeek = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM searches WHERE created_at >= ?').get(week) as Row).n ?? 0,
  );
  const leads = Number((db.prepare('SELECT COUNT(*) AS n FROM leads').get() as Row).n ?? 0);
  const workspaces = Number((db.prepare('SELECT COUNT(*) AS n FROM workspaces').get() as Row).n ?? 0);

  const recent = (
    db
      .prepare(
        `SELECT created_at AS at, event, path, visitor_id AS visitorId, city, region, country
         FROM analytics_events
         WHERE visitor_id NOT LIKE 'user:%'
         ORDER BY id DESC LIMIT 40`,
      )
      .all() as Row[]
  ).map((row) => ({
    at: String(row.at),
    event: String(row.event),
    path: row.path == null ? null : String(row.path),
    visitorId: String(row.visitorId).slice(0, 8),
    geo:
      row.city || row.region || row.country
        ? geoLabel({
            city: String(row.city ?? ''),
            region: String(row.region ?? ''),
            country: String(row.country ?? ''),
          })
        : null,
  }));

  return {
    generatedAt: new Date().toISOString(),
    dbPath: process.env.WEGEO_DB ?? 'data/wegeo.db',
    visits: { pageviews, pageviewsToday, pageviewsWeek, uniqueVisitors, uniqueToday, liveNow },
    topPages,
    funnel,
    users: { total: usersTotal, today: usersToday, week: usersWeek, verified: usersVerified },
    accounts: listAccounts(),
    subscriptions: { active: subsActive, byPlan: subsByPlan, byStatus: subsByStatus, newWeek: subsNewWeek },
    product: { searches, searchesWeek, leads, workspaces },
    globe: { live: globePoints(true), all: globePoints(false) },
    recent,
  };
}

export function resetAnalytics(): { deleted: number } {
  const before = Number(
    (db.prepare('SELECT COUNT(*) AS n FROM analytics_events').get() as Row).n ?? 0,
  );
  db.prepare('DELETE FROM analytics_events').run();
  return { deleted: before };
}

export function warnIfEphemeralDatabase(): void {
  if (process.env.NODE_ENV !== 'production') return;
  const dbPath = process.env.WEGEO_DB ?? '';
  if (!dbPath.startsWith('/data')) {
    console.warn(
      '[Prospy] WEGEO_DB n’est pas sur /data — comptes, prospects et stats seront effacés à chaque déploiement.',
    );
  }
}
