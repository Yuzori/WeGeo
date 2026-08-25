import './env.ts';
import express, { type Request, type Response } from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_OPTIONS, LEAD_STATUSES, type LeadStatus, type SearchOptions } from '../shared/types.ts';
import * as db from './db.ts';
import * as auth from './auth.ts';
import * as billing from './billing.ts';
import { safeFileName, toCsv, toRows, toTsv, toXlsx } from './export.ts';
import { createGoogleSheet, googleAccessToken } from './google.ts';
import { activeRunIds, cancelRun, getRun, resumeSearch, startSearch } from './search-runner.ts';
import { closeBrowser, warmUp } from './scraper/maps.ts';
import { geocodeCity } from './scraper/geo.ts';
import { rateLimit, sameOriginMutations, securityHeaders } from './security.ts';

const PORT = Number(process.env.PORT ?? 4319);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(
  compression({
    // Le flux d'évènements doit partir sans mise en tampon, sinon la recherche
    // en direct n'affiche plus rien derrière un proxy.
    filter: (req, res) =>
      !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') &&
      compression.filter(req, res),
  }),
);

app.get('/healthz', (_req: Request, res: Response) => res.json({ ok: true }));

// Le webhook Stripe exige le corps brut pour vérifier la signature.
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  const result = await billing.handleWebhook(raw, typeof signature === 'string' ? signature : undefined);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ received: true });
});

app.use(express.json({ limit: '64kb' }));
app.use(sameOriginMutations);

db.markStaleSearchesCancelled();

const api = express.Router();

function parseId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptions(raw: unknown): SearchOptions {
  const input = (raw ?? {}) as Partial<SearchOptions>;
  return {
    onlyWithoutWebsite: Boolean(input.onlyWithoutWebsite ?? DEFAULT_OPTIONS.onlyWithoutWebsite),
    socialCountsAsNoWebsite: Boolean(input.socialCountsAsNoWebsite ?? DEFAULT_OPTIONS.socialCountsAsNoWebsite),
    deepCheck: Boolean(input.deepCheck ?? DEFAULT_OPTIONS.deepCheck),
    excludeHandled: Boolean(input.excludeHandled ?? DEFAULT_OPTIONS.excludeHandled),
    requirePhone: Boolean(input.requirePhone ?? DEFAULT_OPTIONS.requirePhone),
    maxPerDomain: Math.max(0, Math.min(500, Number(input.maxPerDomain ?? DEFAULT_OPTIONS.maxPerDomain) || 0)),
    gridMode: Boolean(input.gridMode ?? DEFAULT_OPTIONS.gridMode),
    gridSize: Math.max(1, Math.min(6, Number(input.gridSize ?? DEFAULT_OPTIONS.gridSize) || 2)),
  };
}

/* ---------------------------------------------------------------- authentification */

api.get('/auth/methods', (_req, res) => {
  res.json(auth.authMethods());
});

api.post('/auth/register', rateLimit(8, 60 * 60 * 1000), async (req, res) => {
  const result = await auth.register(
    String(req.body?.email ?? ''),
    String(req.body?.password ?? ''),
    String(req.body?.locale ?? 'fr'),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result);
});

api.post('/auth/login', rateLimit(12, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.login(
    String(req.body?.email ?? ''),
    String(req.body?.password ?? ''),
    String(req.body?.locale ?? 'fr'),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  if ('user' in result) {
    auth.attachSession(req, res, result.token);
    return res.json({ user: auth.toPublicUser(result.user) });
  }
  res.json(result);
});

api.post('/auth/verify', rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.verifyEmailCode(
    String(req.body?.email ?? ''),
    String(req.body?.code ?? ''),
    String(req.body?.purpose ?? ''),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  auth.attachSession(req, res, result.token);
  res.json({ user: auth.toPublicUser(result.user) });
});

api.post('/auth/resend', rateLimit(6, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.resendCode(
    String(req.body?.email ?? ''),
    String(req.body?.purpose ?? ''),
    String(req.body?.locale ?? 'fr'),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/auth/forgot', rateLimit(6, 60 * 60 * 1000), async (req, res) => {
  const result = await auth.forgot(String(req.body?.email ?? ''), String(req.body?.locale ?? 'fr'));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/auth/reset', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.resetPassword(
    String(req.body?.email ?? ''),
    String(req.body?.code ?? ''),
    String(req.body?.password ?? ''),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  auth.attachSession(req, res, result.token);
  res.json({ user: auth.toPublicUser(result.user) });
});

api.get('/auth/google', (req, res) => {
  auth.startGoogle(req, res);
});

api.get('/auth/google/callback', async (req, res) => {
  await auth.finishGoogle(req, res);
});

api.post('/auth/logout', (req, res) => {
  auth.dropSession(req, res);
  res.json({ ok: true });
});

api.get('/auth/me', (req, res) => {
  const user = auth.userFromRequest(req);
  res.json({ user: user ? auth.toPublicUser(user) : null });
});

/* -------------------------------------------------------------------- billing */

api.get('/billing/config', (_req, res) => {
  res.json(billing.publicBillingConfig());
});

api.post('/billing/checkout', auth.requireUser, rateLimit(10, 60 * 1000), async (req, res) => {
  const user = auth.currentUser(res);
  const result = await billing.createEmbeddedCheckout(user, String(req.body?.plan ?? ''), req);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/billing/portal', auth.requireUser, rateLimit(10, 60 * 1000), async (req, res) => {
  const result = await billing.createPortal(auth.currentUser(res), req);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/billing/confirm', auth.requireUser, rateLimit(20, 60 * 1000), async (req, res) => {
  const sessionId = String(req.body?.sessionId ?? '');
  await billing.confirmCheckoutSession(auth.currentUser(res), sessionId);
  res.json({ user: auth.toPublicUser(auth.currentUser(res)) });
});

/* ------------------------------------------------------------- recherches */

api.post('/searches', auth.requireUser, rateLimit(8, 60 * 1000), (req: Request, res: Response) => {
  const user = auth.currentUser(res);
  if (!auth.userHasAccess(user)) {
    return res.status(402).json({ error: 'Un abonnement actif est requis pour lancer une recherche.' });
  }

  const city = String(req.body?.city ?? '').trim().slice(0, 120);
  const domains = Array.isArray(req.body?.domains)
    ? (req.body.domains as unknown[])
        .map((d) => String(d).trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  if (!city) return res.status(400).json({ error: 'La ville est obligatoire.' });
  if (!domains.length) return res.status(400).json({ error: 'Indiquez au moins un métier à rechercher.' });
  if (activeRunIds().length >= 1) {
    return res.status(409).json({ error: 'Une recherche est déjà en cours. Attendez la fin ou arrêtez-la.' });
  }

  const searchId = startSearch({ city, domains, options: parseOptions(req.body?.options) }, user.id);
  res.status(201).json({ searchId });
});

/** Flux d'évènements en direct pendant le scraping. */
api.get('/searches/:id/stream', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const search = db.getSearch(id, auth.currentUser(res).id);
  if (!search) return res.status(404).json({ error: 'Recherche inconnue ou expirée.' });

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

api.post('/searches/:id/cancel', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.getSearch(id, auth.currentUser(res).id)) return res.status(404).json({ error: 'Recherche inconnue.' });
  const ok = cancelRun(id);
  res.json({ cancelled: ok });
});

/** Repart d'une recherche arrêtée, en sautant les métiers déjà parcourus. */
api.post('/searches/:id/resume', auth.requireUser, (req: Request, res: Response) => {
  const user = auth.currentUser(res);
  if (!auth.userHasAccess(user)) {
    return res.status(402).json({ error: 'Un abonnement actif est requis pour lancer une recherche.' });
  }
  if (activeRunIds().length >= 1) {
    return res.status(409).json({ error: 'Une recherche est déjà en cours. Attendez la fin ou arrêtez-la.' });
  }

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!resumeSearch(id, user.id)) {
    return res.status(409).json({ error: 'Cette recherche ne peut pas être reprise : elle est déjà complète.' });
  }
  res.json({ searchId: id });
});

api.get('/searches', auth.requireUser, (_req: Request, res: Response) => {
  res.json(db.listSearches(auth.currentUser(res).id, 200));
});

api.get('/searches/active', auth.requireUser, (_req: Request, res: Response) => {
  res.json({ ids: activeRunIds() });
});

api.get('/searches/:id/leads', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const userId = auth.currentUser(res).id;
  if (!db.getSearch(id, userId)) return res.status(404).json({ error: 'Recherche inconnue.' });
  res.json(db.listLeads({ userId, searchId: id }));
});

api.get('/searches/:id', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const search = db.getSearch(id, auth.currentUser(res).id);
  if (!search) return res.status(404).json({ error: 'Recherche inconnue.' });
  res.json(search);
});

api.delete('/searches/:id', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.deleteSearch(id, auth.currentUser(res).id)) {
    return res.status(404).json({ error: 'Recherche inconnue.' });
  }
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- prospects */

function parseFilters(req: Request, userId: number): db.LeadFilters {
  const status = req.query.status as string | undefined;
  const website = req.query.website as string | undefined;
  const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : undefined;
  return {
    userId,
    status: status && LEAD_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    city: typeof req.query.city === 'string' ? req.query.city.slice(0, 120) : undefined,
    domain: typeof req.query.domain === 'string' ? req.query.domain.slice(0, 80) : undefined,
    query,
    searchId: req.query.searchId ? parseId(String(req.query.searchId)) ?? undefined : undefined,
    website: website === 'sans' || website === 'avec' ? website : undefined,
  };
}

api.get('/leads', auth.requireUser, (req: Request, res: Response) => {
  res.json(db.listLeads(parseFilters(req, auth.currentUser(res).id)));
});

api.patch('/leads/:id', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const userId = auth.currentUser(res).id;
  const { status, notes } = req.body ?? {};

  if (typeof notes === 'string') db.setLeadNotes(id, notes.slice(0, 4000), userId);
  if (typeof status === 'string') {
    if (!LEAD_STATUSES.includes(status as LeadStatus)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    db.setLeadStatus(id, status as LeadStatus, userId);
  }

  const lead = db.getLead(id, userId);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
  res.json(lead);
});

api.post('/leads/bulk', auth.requireUser, (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, 200)
    : [];
  const action = String(req.body?.action ?? '');
  const userId = auth.currentUser(res).id;

  if (action === 'delete') return res.json({ changed: db.deleteLeadsBulk(ids, userId) });
  if (LEAD_STATUSES.includes(action as LeadStatus)) {
    return res.json({ changed: db.setLeadStatusBulk(ids, action as LeadStatus, userId) });
  }
  res.status(400).json({ error: 'Action inconnue.' });
});

api.delete('/leads/:id', auth.requireUser, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.deleteLead(id, auth.currentUser(res).id)) {
    return res.status(404).json({ error: 'Prospect introuvable.' });
  }
  res.json({ ok: true });
});

/* -------------------------------------------------------------- métadonnées */

api.get('/meta', auth.requireUser, (_req: Request, res: Response) => {
  const userId = auth.currentUser(res).id;
  res.json({
    stats: db.stats(userId),
    cities: db.knownCities(userId),
    domains: db.knownDomains(userId),
    activeSearches: activeRunIds(),
  });
});

api.get('/geocode', auth.requireUser, rateLimit(30, 60 * 1000), async (req: Request, res: Response) => {
  const city = String(req.query.city ?? '').trim().slice(0, 120);
  if (!city) return res.status(400).json({ error: 'Ville manquante.' });
  res.json(await geocodeCity(city));
});

/* ------------------------------------------------------------------ exports */

api.get('/export/:format', auth.requireUser, async (req: Request, res: Response) => {
  const format = req.params.format;
  const leads = db.listLeads(parseFilters(req, auth.currentUser(res).id));
  const label = typeof req.query.status === 'string' ? req.query.status.slice(0, 40) : 'prospects';
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'preview') return res.json(toRows(leads));

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(['prospy', label, stamp], 'csv')}"`);
    return res.send(toCsv(leads));
  }

  if (format === 'tsv') {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(toTsv(leads));
  }

  if (format === 'xlsx') {
    const buffer = await toXlsx(leads, `Prospy ${label}`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(['prospy', label, stamp], 'xlsx')}"`);
    return res.send(buffer);
  }

  res.status(400).json({ error: 'Format non pris en charge.' });
});

api.post('/export/sheets', auth.requireUser, rateLimit(8, 60 * 60 * 1000), async (req, res) => {
  const user = auth.currentUser(res);
  if (!user.googleRefreshToken) {
    return res.status(409).json({ error: 'Connectez Google pour envoyer le tableur dans Sheets.' });
  }
  const leads = db.listLeads(parseFilters(req, user.id));
  if (!leads.length) return res.status(400).json({ error: 'Aucune ligne à exporter.' });
  const label = typeof req.query.status === 'string' ? req.query.status.slice(0, 40) : 'prospects';
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    const accessToken = await googleAccessToken(user.googleRefreshToken, req);
    const sheet = await createGoogleSheet({
      accessToken,
      title: `Prospy — ${label} — ${stamp}`,
      leads,
    });
    res.json(sheet);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Export Google Sheets impossible.' });
  }
});

app.use('/api', api);

// En production, on sert l'interface compilée depuis le même serveur.
const webDist = resolve(process.cwd(), 'dist', 'web');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*splat', (_req, res) => res.sendFile(resolve(webDist, 'index.html')));
}

const server = app.listen(PORT, () => {
  console.log(`Prospy API prête sur http://localhost:${PORT}`);
  if (!existsSync(webDist)) console.log("Interface : lancez « npm run dev » puis ouvrez http://localhost:5173");
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.warn('SESSION_SECRET manquant : définissez-le en production.');
  }
      if (!process.env.STRIPE_SECRET_KEY) {
    console.log('Stripe non configuré : les recherches restent ouvertes sans abonnement (mode développement).');
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.log('Google OAuth non configuré : le bouton Google reste masqué.');
  }
  if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
    console.log('E-mail non configuré : les codes s’affichent dans ce terminal (hors production).');
  }
  setTimeout(warmUp, 1500).unref();
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
