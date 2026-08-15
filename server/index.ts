import express, { type NextFunction, type Request, type Response } from 'express';
import compression from 'compression';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_OPTIONS, LEAD_STATUSES, type LeadStatus, type SearchOptions } from '../shared/types.ts';
import * as db from './db.ts';
import { safeFileName, toCsv, toRows, toTsv, toXlsx } from './export.ts';
import { activeRunIds, cancelRun, getRun, startSearch } from './search-runner.ts';
import { closeBrowser, warmUp } from './scraper/maps.ts';
import { geocodeCity } from './scraper/geo.ts';

const PORT = Number(process.env.PORT ?? 4319);
const PASSWORD = process.env.WEGEO_PASSWORD;

/**
 * Mot de passe unique, comparé en temps constant. Utile dès que l'application
 * est exposée à Internet : sans lui, n'importe qui lirait votre prospection.
 * Laissé vide en local, l'accès reste direct.
 */
function requirePassword(expected: string) {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const reference = digest(expected);

  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = String(req.headers.authorization ?? '').split(' ');

    if (scheme === 'Basic' && encoded) {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      if (timingSafeEqual(digest(decoded.slice(decoded.indexOf(':') + 1)), reference)) return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="WeGeo", charset="UTF-8"');
    res.status(401).send('WeGeo — accès protégé.');
  };
}

const app = express();
app.disable('x-powered-by');

app.use(
  compression({
    // Le flux d'évènements doit partir sans mise en tampon, sinon la recherche
    // en direct n'affiche plus rien derrière un proxy.
    filter: (req, res) =>
      !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') &&
      compression.filter(req, res),
  }),
);

// Sonde d'état de l'hébergeur : doit rester accessible sans mot de passe.
app.get('/healthz', (_req: Request, res: Response) => res.json({ ok: true }));

if (PASSWORD) app.use(requirePassword(PASSWORD));

app.use(express.json({ limit: '2mb' }));

db.markStaleSearchesCancelled();

const api = express.Router();

/* ------------------------------------------------------------- recherches */

function parseOptions(raw: unknown): SearchOptions {
  const input = (raw ?? {}) as Partial<SearchOptions>;
  return {
    onlyWithoutWebsite: input.onlyWithoutWebsite ?? DEFAULT_OPTIONS.onlyWithoutWebsite,
    socialCountsAsNoWebsite: input.socialCountsAsNoWebsite ?? DEFAULT_OPTIONS.socialCountsAsNoWebsite,
    deepCheck: input.deepCheck ?? DEFAULT_OPTIONS.deepCheck,
    excludeHandled: input.excludeHandled ?? DEFAULT_OPTIONS.excludeHandled,
    requirePhone: input.requirePhone ?? DEFAULT_OPTIONS.requirePhone,
    maxPerDomain: Math.max(0, Math.min(500, Number(input.maxPerDomain ?? DEFAULT_OPTIONS.maxPerDomain) || 0)),
    gridMode: input.gridMode ?? DEFAULT_OPTIONS.gridMode,
    gridSize: Math.max(1, Math.min(6, Number(input.gridSize ?? DEFAULT_OPTIONS.gridSize) || 2)),
  };
}

api.post('/searches', (req: Request, res: Response) => {
  const city = String(req.body?.city ?? '').trim();
  const domains = Array.isArray(req.body?.domains)
    ? (req.body.domains as unknown[]).map((d) => String(d).trim()).filter(Boolean)
    : [];

  if (!city) return res.status(400).json({ error: 'La ville est obligatoire.' });
  if (!domains.length) return res.status(400).json({ error: 'Indiquez au moins un métier à rechercher.' });
  if (activeRunIds().length >= 1) {
    return res.status(409).json({ error: 'Une recherche est déjà en cours. Attendez la fin ou arrêtez-la.' });
  }

  const searchId = startSearch({ city, domains, options: parseOptions(req.body?.options) });
  res.status(201).json({ searchId });
});

/** Flux d'évènements en direct pendant le scraping. */
api.get('/searches/:id/stream', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const run = getRun(id);
  if (!run) return res.status(404).json({ error: 'Recherche inconnue ou expirée.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const unsubscribe = run.subscribe((event) => {
    send(event);
    if (event.type === 'done' || event.type === 'error') res.end();
  });

  const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
});

api.post('/searches/:id/cancel', (req: Request, res: Response) => {
  const ok = cancelRun(Number(req.params.id));
  res.json({ cancelled: ok });
});

api.get('/searches', (_req: Request, res: Response) => {
  res.json(db.listSearches(200));
});

api.get('/searches/active', (_req: Request, res: Response) => {
  res.json({ ids: activeRunIds() });
});

api.get('/searches/:id/leads', (req: Request, res: Response) => {
  res.json(db.listLeads({ searchId: Number(req.params.id) }));
});

api.delete('/searches/:id', (req: Request, res: Response) => {
  db.deleteSearch(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- prospects */

function parseFilters(req: Request): db.LeadFilters {
  const status = req.query.status as string | undefined;
  const website = req.query.website as string | undefined;
  return {
    status: status && LEAD_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    city: (req.query.city as string) || undefined,
    domain: (req.query.domain as string) || undefined,
    query: (req.query.q as string) || undefined,
    searchId: req.query.searchId ? Number(req.query.searchId) : undefined,
    website: website === 'sans' || website === 'avec' ? website : undefined,
  };
}

api.get('/leads', (req: Request, res: Response) => {
  res.json(db.listLeads(parseFilters(req)));
});

api.patch('/leads/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status, notes } = req.body ?? {};

  if (typeof notes === 'string') db.setLeadNotes(id, notes);
  if (typeof status === 'string') {
    if (!LEAD_STATUSES.includes(status as LeadStatus)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    db.setLeadStatus(id, status as LeadStatus);
  }

  const lead = db.getLead(id);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
  res.json(lead);
});

api.post('/leads/bulk', (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(Number).filter(Number.isFinite) : [];
  const action = String(req.body?.action ?? '');

  if (action === 'delete') return res.json({ changed: db.deleteLeadsBulk(ids) });
  if (LEAD_STATUSES.includes(action as LeadStatus)) {
    return res.json({ changed: db.setLeadStatusBulk(ids, action as LeadStatus) });
  }
  res.status(400).json({ error: 'Action inconnue.' });
});

api.delete('/leads/:id', (req: Request, res: Response) => {
  db.deleteLead(Number(req.params.id));
  res.json({ ok: true });
});

/* -------------------------------------------------------------- métadonnées */

api.get('/meta', (_req: Request, res: Response) => {
  res.json({
    stats: db.stats(),
    cities: db.knownCities(),
    domains: db.knownDomains(),
    activeSearches: activeRunIds(),
  });
});

api.get('/geocode', async (req: Request, res: Response) => {
  const city = String(req.query.city ?? '').trim();
  if (!city) return res.status(400).json({ error: 'Ville manquante.' });
  res.json(await geocodeCity(city));
});

/* ------------------------------------------------------------------ exports */

api.get('/export/:format', async (req: Request, res: Response) => {
  const format = req.params.format;
  const leads = db.listLeads(parseFilters(req));
  const label = (req.query.status as string) || 'prospects';
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'preview') return res.json(toRows(leads));

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(['wegeo', label, stamp], 'csv')}"`);
    return res.send(toCsv(leads));
  }

  if (format === 'tsv') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(toTsv(leads));
  }

  if (format === 'xlsx') {
    const buffer = await toXlsx(leads, `WeGeo ${label}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(['wegeo', label, stamp], 'xlsx')}"`);
    return res.send(buffer);
  }

  res.status(400).json({ error: 'Format non pris en charge.' });
});

app.use('/api', api);

// En production, on sert l'interface compilée depuis le même serveur.
const webDist = resolve(process.cwd(), 'dist', 'web');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*splat', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
}

const server = app.listen(PORT, () => {
  console.log(`WeGeo API prête sur http://localhost:${PORT}`);
  if (!existsSync(webDist)) console.log("Interface : lancez « npm run dev » puis ouvrez http://localhost:5173");
  // Le navigateur met quelques secondes à démarrer : on s'en occupe tout de
  // suite pour que la première recherche parte immédiatement.
  setTimeout(warmUp, 1500).unref();
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
