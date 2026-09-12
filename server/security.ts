/**
 * En-têtes, limitation de débit et contrôles d’origine.
 * Ce n’est pas un audit de sécurité : ce sont des garde-fous de base.
 */

import type { NextFunction, Request, Response } from 'express';

const buckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim().slice(0, 64);
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Limite simple en mémoire, par IP + route. Suffisant pour une instance unique. */
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${clientIp(req)}:${req.method}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans un instant.' });
    }
    next();
  };
}

/*
 * `script-src` garde `unsafe-inline` parce que index.html porte un script en
 * ligne qui pose le thème et la langue avant le premier rendu. Le retirer
 * demande de servir index.html avec un nonce généré par requête. Le reste de
 * la politique reste utile : plus aucun script d'une autre origine, pas
 * d'objet embarqué, pas de mise en cadre, pas de détournement de formulaire.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src \'self\' https://fonts.gstatic.com data:',
  // Les tuiles arrivent de `tile.openstreetmap.org`, sans sous-domaine : le
  // joker seul ne couvrirait pas cet hôte, il faut le nommer.
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.googleusercontent.com",
  "connect-src 'self' https://api.stripe.com https://nominatim.openstreetmap.org",
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  "worker-src 'self' blob:",
].join('; ');

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  if (isHttpsRequest(req)) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
}

/**
 * Les exports partent en navigation GET, donc le cookie de session suit même
 * depuis un autre site (SameSite=Lax). Sans ce contrôle, une page tierce peut
 * déclencher le téléchargement du fichier de prospects de l'utilisateur.
 *
 * `Sec-Fetch-Site` est posé par le navigateur et n'est pas falsifiable depuis
 * une page. On retombe sur le Referer pour les navigateurs qui ne l'envoient pas.
 */
export function sameOriginNavigation(req: Request, res: Response, next: NextFunction): void {
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string') {
    // `none` correspond à une saisie directe ou un favori, jamais à un site tiers.
    if (site === 'same-origin' || site === 'none') return next();
    res.status(403).json({ error: 'Téléchargement refusé depuis un autre site.' });
    return;
  }

  const sourceHost = mutationSourceHost(req);
  if (!sourceHost) return next();
  const forwarded = req.headers['x-forwarded-host'];
  const requestHost = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.headers.host)?.trim();
  if (requestHost && sourceHost === requestHost) return next();
  if (allowedOrigins().has(sourceHost)) return next();
  res.status(403).json({ error: 'Téléchargement refusé depuis un autre site.' });
}

/**
 * Les mutations JSON doivent venir du même site. En développement, le proxy
 * Vite conserve l’origine du front (`localhost:5173`).
 * Origin ou Referer est exigé : sans les deux, la requête est refusée
 * (un POST de formulaire cross-site n’envoie souvent pas Origin).
 */
export function sameOriginMutations(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (req.path === '/api/billing/webhook') return next();

  const sourceHost = mutationSourceHost(req);
  if (!sourceHost) {
    res.status(403).json({ error: 'Origine manquante.' });
    return;
  }

  try {
    const forwarded = req.headers['x-forwarded-host'];
    const requestHost = (typeof forwarded === 'string' ? forwarded.split(',')[0] : req.headers.host)?.trim();
    if (requestHost && sourceHost === requestHost) return next();
    if (allowedOrigins().has(sourceHost)) return next();
  } catch {
    /* origine illisible */
  }
  res.status(403).json({ error: 'Origine non autorisée.' });
}

function mutationSourceHost(req: Request): string | null {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) {
    try {
      return new URL(origin).host;
    } catch {
      return null;
    }
  }
  const referer = req.headers.referer;
  if (typeof referer === 'string' && referer.trim()) {
    try {
      return new URL(referer).host;
    } catch {
      return null;
    }
  }
  return null;
}

function allowedOrigins(): Set<string> {
  const hosts = new Set<string>();
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).host);
    } catch {
      /* ignore */
    }
  }
  // Le proxy Vite n'existe qu'en développement : ne pas l'autoriser en production.
  if (process.env.NODE_ENV !== 'production') {
    hosts.add('localhost:5173');
    hosts.add('localhost:4319');
    hosts.add('127.0.0.1:5173');
    hosts.add('127.0.0.1:4319');
  }
  return hosts;
}

export function publicBaseUrl(req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'https' : 'http';
  const host = req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost:4319';
  return `${proto}://${host}`;
}

export function isHttpsRequest(req: Request): boolean {
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function assertRuntimeSecrets(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const secret = process.env.SESSION_SECRET?.trim() ?? '';
  if (!secret) {
    console.error('SESSION_SECRET manquant : refus de démarrer en production.');
    process.exit(1);
  }
  // Le secret sert de poivre aux jetons de session et aux codes e-mail. Une
  // valeur courte ou recopiée depuis .env.example ne protège rien.
  if (secret.length < 32 || secret === 'changez-moi-en-production') {
    console.error('SESSION_SECRET trop faible : au moins 32 caractères aléatoires sont requis.');
    process.exit(1);
  }
  if (process.env.DEV_ACCOUNT_EMAILS?.trim()) {
    console.warn('DEV_ACCOUNT_EMAILS est ignoré en production : les accès de développement y sont désactivés.');
  }
}
