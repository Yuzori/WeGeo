import './env.ts';
import express, { type Request, type Response } from 'express';
import compression from 'compression';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_OPTIONS, LEAD_STATUSES, type LeadStatus, type SearchOptions } from '../shared/types.ts';
import type { PlanLimits } from '../shared/plans.ts';
import * as db from './db.ts';
import * as auth from './auth.ts';
import * as billing from './billing.ts';
import * as workspaces from './workspaces.ts';
import { readAvatar } from './avatars.ts';
import { safeFileName, toCsv, toRows, toTsv, toXlsx } from './export.ts';
import { createGoogleSheet, googleAccessToken } from './google.ts';
import { activeRunIds, cancelRun, getRun, resumeSearch, startSearch } from './search-runner.ts';
import { closeBrowser, warmUp } from './scraper/maps.ts';
import { geocodeCity } from './scraper/geo.ts';
import { locateRequest } from './locate.ts';
import { assertRuntimeSecrets, rateLimit, sameOriginMutations, securityHeaders } from './security.ts';

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

app.use(express.json({ limit: '512kb' }));
app.use(sameOriginMutations);

db.markStaleSearchesCancelled();

const api = express.Router();

function parseId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptions(raw: unknown, limits: PlanLimits): SearchOptions {
  const input = (raw ?? {}) as Partial<SearchOptions>;
  const gridAllowed = limits.maxGridSize > 0;
  const requestedMax = Number(input.maxPerDomain ?? DEFAULT_OPTIONS.maxPerDomain);
  const maxPerDomain =
    Number.isFinite(requestedMax) && requestedMax > 0
      ? Math.min(limits.maxPerDomain, requestedMax)
      : limits.maxPerDomain;
  return {
    onlyWithoutWebsite: Boolean(input.onlyWithoutWebsite ?? DEFAULT_OPTIONS.onlyWithoutWebsite),
    socialCountsAsNoWebsite: Boolean(input.socialCountsAsNoWebsite ?? DEFAULT_OPTIONS.socialCountsAsNoWebsite),
    deepCheck: Boolean(input.deepCheck ?? DEFAULT_OPTIONS.deepCheck),
    excludeHandled: Boolean(input.excludeHandled ?? DEFAULT_OPTIONS.excludeHandled),
    requirePhone: Boolean(input.requirePhone ?? DEFAULT_OPTIONS.requirePhone),
    maxPerDomain,
    gridMode: gridAllowed && Boolean(input.gridMode ?? DEFAULT_OPTIONS.gridMode),
    gridSize: gridAllowed
      ? Math.max(1, Math.min(limits.maxGridSize, Number(input.gridSize ?? DEFAULT_OPTIONS.gridSize) || 2))
      : 2,
    lookupDirigeant: limits.lookupDirigeant,
  };
}

/* -------------------------------------------------------------- géolocalisation IP */

api.get('/locate', rateLimit(40, 60 * 1000), async (req, res) => {
  try {
    res.json(await locateRequest(req));
  } catch {
    res.json(null);
  }
});

/* ---------------------------------------------------------------- authentification */

api.get('/auth/methods', (_req, res) => {
  res.json(auth.authMethods());
});

api.post('/auth/register', rateLimit(8, 60 * 60 * 1000), async (req, res) => {
  const result = await auth.register(
    String(req.body?.email ?? ''),
    String(req.body?.password ?? ''),
    String(req.body?.locale ?? 'fr'),
    String(req.body?.username ?? ''),
    typeof req.body?.avatar === 'string' ? req.body.avatar : undefined,
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result);
});

api.post('/auth/login', rateLimit(12, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.login(
    String(req.body?.identifier ?? req.body?.email ?? ''),
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

api.patch('/auth/profile', auth.requireUser, rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  const result = await auth.updateProfile(auth.currentUser(res), {
    username: typeof req.body?.username === 'string' ? req.body.username : undefined,
    password: typeof req.body?.password === 'string' ? req.body.password : undefined,
    currentPassword: typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : undefined,
    avatar: req.body?.avatar === null ? null : typeof req.body?.avatar === 'string' ? req.body.avatar : undefined,
  });
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ user: auth.toPublicUser(result.user) });
});

api.post('/auth/username', auth.requireUser, rateLimit(20, 15 * 60 * 1000), (req, res) => {
  const result = auth.claimUsername(auth.currentUser(res), String(req.body?.username ?? ''));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ user: auth.toPublicUser(result.user) });
});

api.get('/auth/stats', auth.requireUser, (_req, res) => {
  res.json(auth.accountStats(auth.currentUser(res).id));
});

api.get('/avatars/:id', auth.requireUser, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
  const me = auth.currentUser(res);
  if (id !== me.id && !workspaces.shareWorkspace(me.id, id)) return res.status(404).end();
  const file = readAvatar(id);
  if (!file) return res.status(404).end();
  const types = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
  res.setHeader('Content-Type', types[file.kind]);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.end(file.buffer);
});

/* ----------------------------------------------------------------- sessions */

api.get('/workspaces', auth.requireUser, (_req, res) => {
  res.json({
    workspaces: workspaces.listForUser(auth.currentUser(res)),
    invites: workspaces.listInvites(auth.currentUser(res)),
  });
});

api.post('/workspaces', auth.requireUser, rateLimit(20, 60 * 60 * 1000), (req, res) => {
  const result = workspaces.createWorkspace(auth.currentUser(res), String(req.body?.name ?? ''));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.status(201).json({ workspace: result });
});

api.get('/workspaces/invites', auth.requireUser, (_req, res) => {
  res.json({ invites: workspaces.listInvites(auth.currentUser(res)) });
});

api.post('/workspaces/lookup', auth.requireUser, rateLimit(30, 15 * 60 * 1000), (req, res) => {
  const result = workspaces.publicLookup(String(req.body?.query ?? req.body?.email ?? ''));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.get('/workspaces/people', auth.requireUser, auth.requirePaid, rateLimit(20, 60 * 1000), (req, res) => {
  res.json({
    people: workspaces.searchPeople(auth.currentUser(res), String(req.query.q ?? '')),
  });
});

api.post('/workspaces/invites/:id/accept', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.acceptInvite(id, auth.currentUser(res));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ workspace: result });
});

api.post('/workspaces/invites/:id/decline', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.declineInvite(id, auth.currentUser(res));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.get('/workspaces/:id', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const workspace = workspaces.getForUser(id, auth.currentUser(res));
  if (!workspace) return res.status(404).json({ error: 'Session introuvable.' });
  res.json({ workspace });
});

api.patch('/workspaces/:id', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.renameWorkspace(id, auth.currentUser(res), String(req.body?.name ?? ''));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ workspace: result });
});

api.delete('/workspaces/:id', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.deleteWorkspace(id, auth.currentUser(res));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/workspaces/:id/leave', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.leaveWorkspace(id, auth.currentUser(res));
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

api.post('/workspaces/:id/invites', auth.requireUser, auth.requirePaid, rateLimit(30, 60 * 60 * 1000), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = await workspaces.invite(
    id,
    auth.currentUser(res),
    String(req.body?.query ?? req.body?.email ?? ''),
    String(req.body?.locale ?? 'fr'),
  );
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result);
});

api.delete('/workspaces/:id/members/:userId', auth.requireUser, (req, res) => {
  const id = parseId(req.params.id);
  const memberId = parseId(req.params.userId);
  if (!id || !memberId) return res.status(400).json({ error: 'Identifiant invalide.' });
  const result = workspaces.removeMember(id, auth.currentUser(res), memberId);
  if ('error' in result) return res.status(result.status).json({ error: result.error });
  res.json({ workspace: result });
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

api.post('/searches', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, rateLimit(8, 60 * 1000), (req: Request, res: Response) => {
  const user = auth.currentUser(res);
  const limits = auth.planLimitsForUser(user);

  const city = String(req.body?.city ?? '').trim().slice(0, 120);
  const incoming = Array.isArray(req.body?.domains)
    ? (req.body.domains as unknown[]).map((d) => String(d).trim().slice(0, 80)).filter(Boolean)
    : [];
  if (incoming.length > limits.maxDomains) {
    return res.status(400).json({ error: `Votre offre permet ${limits.maxDomains} métiers par relevé.` });
  }
  const domains = incoming;

  if (!city) return res.status(400).json({ error: 'La ville est obligatoire.' });
  if (!domains.length) return res.status(400).json({ error: 'Indiquez au moins un métier à rechercher.' });
  if (activeRunIds().length >= 1) {
    return res.status(409).json({ error: 'Une recherche est déjà en cours. Attendez la fin ou arrêtez-la.' });
  }

  const searchId = startSearch({ city, domains, options: parseOptions(req.body?.options, limits) }, workspaces.currentWorkspaceId(res), user.id);
  res.status(201).json({ searchId });
});

/** Flux d'évènements en direct pendant le scraping. */
api.get('/searches/:id/stream', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const search = db.getSearch(id, workspaces.currentWorkspaceId(res));
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

api.post('/searches/:id/cancel', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.getSearch(id, workspaces.currentWorkspaceId(res))) return res.status(404).json({ error: 'Recherche inconnue.' });
  const ok = cancelRun(id);
  res.json({ cancelled: ok });
});

/** Repart d'une recherche arrêtée, en sautant les métiers déjà parcourus. */
api.post('/searches/:id/resume', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  if (activeRunIds().length >= 1) {
    return res.status(409).json({ error: 'Une recherche est déjà en cours. Attendez la fin ou arrêtez-la.' });
  }

  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!resumeSearch(id, workspaces.currentWorkspaceId(res))) {
    return res.status(409).json({ error: 'Cette recherche ne peut pas être reprise. Elle est déjà complète.' });
  }
  res.json({ searchId: id });
});

api.get('/searches', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (_req: Request, res: Response) => {
  res.json(db.listSearches(workspaces.currentWorkspaceId(res), 200));
});

api.get('/searches/active', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (_req: Request, res: Response) => {
  const workspaceId = workspaces.currentWorkspaceId(res);
  res.json({ ids: activeRunIds().filter((id) => db.getSearch(id)?.workspaceId === workspaceId) });
});

api.get('/searches/:id/leads', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const workspaceId = workspaces.currentWorkspaceId(res);
  if (!db.getSearch(id, workspaceId)) return res.status(404).json({ error: 'Recherche inconnue.' });
  res.json(db.listLeads({ workspaceId, searchId: id }));
});

api.get('/searches/:id', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const search = db.getSearch(id, workspaces.currentWorkspaceId(res));
  if (!search) return res.status(404).json({ error: 'Recherche inconnue.' });
  res.json(search);
});

api.delete('/searches/:id', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.deleteSearch(id, workspaces.currentWorkspaceId(res))) {
    return res.status(404).json({ error: 'Recherche inconnue.' });
  }
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- prospects */

function parseFilters(req: Request, workspaceId: number): db.LeadFilters {
  const status = req.query.status as string | undefined;
  const website = req.query.website as string | undefined;
  const query = typeof req.query.q === 'string' ? req.query.q.slice(0, 120) : undefined;
  return {
    workspaceId,
    status: status && LEAD_STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    city: typeof req.query.city === 'string' ? req.query.city.slice(0, 120) : undefined,
    domain: typeof req.query.domain === 'string' ? req.query.domain.slice(0, 80) : undefined,
    query,
    searchId: req.query.searchId ? parseId(String(req.query.searchId)) ?? undefined : undefined,
    website: website === 'sans' || website === 'avec' ? website : undefined,
  };
}

api.get('/leads', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  res.json(db.listLeads(parseFilters(req, workspaces.currentWorkspaceId(res))));
});

api.patch('/leads/:id', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, rateLimit(60, 60 * 1000), (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  const workspaceId = workspaces.currentWorkspaceId(res);
  const { status, notes } = req.body ?? {};

  if (typeof notes === 'string') db.setLeadNotes(id, notes.slice(0, 4000), workspaceId);
  if (typeof status === 'string') {
    if (!LEAD_STATUSES.includes(status as LeadStatus)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    db.setLeadStatus(id, status as LeadStatus, workspaceId);
  }

  const lead = db.getLead(id, workspaceId);
  if (!lead) return res.status(404).json({ error: 'Prospect introuvable.' });
  res.json(lead);
});

api.post('/leads/bulk', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, rateLimit(30, 60 * 1000), (req: Request, res: Response) => {
  const ids = Array.isArray(req.body?.ids)
    ? (req.body.ids as unknown[])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, 200)
    : [];
  const action = String(req.body?.action ?? '');
  const workspaceId = workspaces.currentWorkspaceId(res);

  if (action === 'delete') return res.json({ changed: db.deleteLeadsBulk(ids, workspaceId) });
  if (LEAD_STATUSES.includes(action as LeadStatus)) {
    return res.json({ changed: db.setLeadStatusBulk(ids, action as LeadStatus, workspaceId) });
  }
  res.status(400).json({ error: 'Action inconnue.' });
});

api.delete('/leads/:id', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Identifiant invalide.' });
  if (!db.deleteLead(id, workspaces.currentWorkspaceId(res))) {
    return res.status(404).json({ error: 'Prospect introuvable.' });
  }
  res.json({ ok: true });
});

/* -------------------------------------------------------------- métadonnées */

api.get('/meta', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, (_req: Request, res: Response) => {
  const workspaceId = workspaces.currentWorkspaceId(res);
  res.json({
    stats: db.stats(workspaceId),
    cities: db.knownCities(workspaceId),
    domains: db.knownDomains(workspaceId),
    activeSearches: activeRunIds().filter((id) => db.getSearch(id)?.workspaceId === workspaceId),
  });
});

api.get('/geocode', auth.requireUser, auth.requirePaid, rateLimit(30, 60 * 1000), async (req: Request, res: Response) => {
  const city = String(req.query.city ?? '').trim().slice(0, 120);
  if (!city) return res.status(400).json({ error: 'Ville manquante.' });
  res.json(await geocodeCity(city));
});

/* ------------------------------------------------------------------ exports */

api.get('/export/:format', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, async (req: Request, res: Response) => {
  const format = req.params.format;
  const leads = db.listLeads(parseFilters(req, workspaces.currentWorkspaceId(res)));
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

api.post('/export/sheets', auth.requireUser, workspaces.requireWorkspace, auth.requirePaid, rateLimit(8, 60 * 60 * 1000), async (req, res) => {
  const user = auth.currentUser(res);
  if (!auth.planLimitsForUser(user).exportSheets) {
    return res.status(402).json({ error: 'L’export Google Sheets est réservé aux offres Pro et Agence.' });
  }
  if (!user.googleRefreshToken) {
    return res.status(409).json({ error: 'Connectez Google pour envoyer le tableur dans Sheets.' });
  }
  const leads = db.listLeads(parseFilters(req, workspaces.currentWorkspaceId(res)));
  if (!leads.length) return res.status(400).json({ error: 'Aucune ligne à exporter.' });
  const label = typeof req.query.status === 'string' ? req.query.status.slice(0, 40) : 'prospects';
  const stamp = new Date().toISOString().slice(0, 10);
  try {
    const accessToken = await googleAccessToken(user.googleRefreshToken, req);
    const sheet = await createGoogleSheet({
      accessToken,
      title: `Prospy. ${label}. ${stamp}`,
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
  app.use(
    express.static(webDist, {
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-store');
      },
    }),
  );
  app.get('*splat', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(resolve(webDist, 'index.html'));
  });
}

assertRuntimeSecrets();

const server = app.listen(PORT, () => {
  console.log(`Prospy API prête sur http://localhost:${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log('Interface à jour en local : http://localhost:5173  (npm run dev)');
    if (existsSync(webDist)) {
      console.log('http://localhost:4319 sert dist/web (dernier npm run build), pas le live Vite.');
    }
  } else if (!existsSync(webDist)) {
    console.log("Interface : lancez « npm run dev » puis ouvrez http://localhost:5173");
  }
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    if (process.env.NODE_ENV === 'production') {
      console.log('Stripe non configuré : l’outil est fermé, sauf comptes listés dans DEV_ACCOUNT_EMAILS.');
    } else {
      console.log('Stripe non configuré : accès ouvert en local (hors production).');
    }
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
