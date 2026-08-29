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

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (_req.secure || _req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
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
  hosts.add('localhost:5173');
  hosts.add('localhost:4319');
  hosts.add('127.0.0.1:5173');
  hosts.add('127.0.0.1:4319');
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
  if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET?.trim()) {
    console.error('SESSION_SECRET manquant : refus de démarrer en production.');
    process.exit(1);
  }
}
