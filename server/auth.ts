/**
 * Comptes et sessions. Les mots de passe sont dérivés avec scrypt ;
 * le jeton de session est un secret aléatoire, seul son hash est stocké.
 * E-mail : code à 6 chiffres. Google : OAuth + jeton Sheets.
 */

import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { PlanId, PublicUser, SubscriptionStatus } from '../shared/types.ts';
import db from './db.ts';
import { googleAuthUrl, googleConfigured, exchangeGoogleCode } from './google.ts';
import { mailConfigured, sendCodeEmail, type MailPurpose } from './mail.ts';
import { isHttpsRequest, publicBaseUrl } from './security.ts';

const scryptAsync = promisify(scrypt);

const COOKIE = 'prospy_sid';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthUser {
  id: number;
  email: string;
  emailVerified: boolean;
  googleId: string | null;
  googleRefreshToken: string | null;
}

type Row = Record<string, unknown>;

function pepper(): string {
  return process.env.SESSION_SECRET ?? '';
}

function hashToken(token: string): string {
  return createHash('sha256').update(`${pepper()}:${token}`).digest('hex');
}

function hashCode(email: string, purpose: string, code: string): string {
  return createHash('sha256').update(`${pepper()}:${email}:${purpose}:${code}`).digest('hex');
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hex] = stored.split(':');
  if (!salt || !hex) return false;
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function setCookie(req: Request, res: Response, name: string, value: string, maxAge: number): void {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isHttpsRequest(req)) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [String(prev)]) : [];
  list.push(parts.join('; '));
  res.setHeader('Set-Cookie', list);
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  setCookie(req, res, COOKIE, token, SESSION_DAYS * 24 * 60 * 60);
}

function clearSessionCookie(req: Request, res: Response): void {
  setCookie(req, res, COOKIE, '', 0);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  if (!EMAIL_RE.test(email) || email.length > 190) return 'Adresse e-mail invalide.';
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  if (password.length > 200) return 'Mot de passe trop long.';
  return null;
}

export function validateCredentials(email: string, password: string): string | null {
  return validateEmail(email) ?? validatePassword(password);
}

function rowToUser(row: Row): AuthUser {
  return {
    id: row.id as number,
    email: row.email as string,
    emailVerified: Number(row.email_verified) === 1,
    googleId: (row.google_id as string | null) ?? null,
    googleRefreshToken: (row.google_refresh_token as string | null) ?? null,
  };
}

const USER_COLS = 'id, email, email_verified, google_id, google_refresh_token, password_hash';

export function createUser(email: string, passwordHash: string, extras: { verified?: boolean; googleId?: string } = {}): AuthUser {
  const info = db
    .prepare(
      `INSERT INTO users (email, password_hash, created_at, email_verified, google_id)
       VALUES (?,?,?,?,?)`,
    )
    .run(email, passwordHash, new Date().toISOString(), extras.verified ? 1 : 0, extras.googleId ?? null);
  const id = Number(info.lastInsertRowid);
  claimOrphanData(id);
  return findUserById(id)!;
}

function claimOrphanData(userId: number): void {
  const orphans = db.prepare('SELECT COUNT(*) AS n FROM users').get() as Row;
  if (Number(orphans.n) !== 1) return;
  db.prepare('UPDATE leads SET user_id = ? WHERE user_id = 0').run(userId);
  db.prepare('UPDATE searches SET user_id = ? WHERE user_id = 0').run(userId);
}

export function findUserById(id: number): AuthUser | null {
  const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as Row | undefined;
  return row ? rowToUser(row) : null;
}

export function findUserByEmail(email: string): (AuthUser & { passwordHash: string }) | null {
  const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE email = ?`).get(email) as Row | undefined;
  if (!row) return null;
  return { ...rowToUser(row), passwordHash: (row.password_hash as string) ?? '' };
}

function findUserByGoogleId(googleId: string): AuthUser | null {
  const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE google_id = ?`).get(googleId) as Row | undefined;
  return row ? rowToUser(row) : null;
}

function markVerified(userId: number): void {
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);
}

function setPasswordHash(userId: number, hash: string): void {
  db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(hash, userId);
}

function saveGoogle(userId: number, data: { googleId: string; refreshToken: string | null; accessToken: string | null; expiry: string | null }): void {
  const current = db.prepare('SELECT google_refresh_token FROM users WHERE id = ?').get(userId) as Row | undefined;
  const refresh = data.refreshToken || (current?.google_refresh_token as string | null) || null;
  db.prepare(
    `UPDATE users SET google_id = ?, google_refresh_token = ?, google_access_token = ?, google_token_expiry = ?, email_verified = 1
     WHERE id = ?`,
  ).run(data.googleId, refresh, data.accessToken, data.expiry, userId);
}

function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)').run(
    hashToken(token),
    userId,
    expires,
    new Date().toISOString(),
  );
  return token;
}

export function userFromRequest(req: Request): AuthUser | null {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.email_verified, u.google_id, u.google_refresh_token, u.password_hash
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as Row | undefined;
  if (!row) return null;
  return rowToUser(row);
}

export function destroySession(req: Request): void {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function requireUser(req: Request, res: Response, next: NextFunction): void {
  const user = userFromRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Connexion requise.' });
    return;
  }
  res.locals.user = user;
  next();
}

export function currentUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

export function toPublicUser(user: AuthUser): PublicUser {
  const sub = db
    .prepare(
      `SELECT plan, status FROM subscriptions
       WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(user.id) as Row | undefined;

  const status = (sub?.status as SubscriptionStatus | undefined) ?? 'none';
  const plan = (sub?.plan as PlanId | undefined) ?? null;
  const active = status === 'active' || status === 'trialing';

  return {
    id: user.id,
    email: user.email,
    plan: active ? plan : null,
    subscriptionStatus: status,
    googleLinked: Boolean(user.googleId),
    canExportSheets: Boolean(user.googleRefreshToken),
  };
}

export function userHasAccess(user: AuthUser): boolean {
  if (!process.env.STRIPE_SECRET_KEY) return true;
  const pub = toPublicUser(user);
  return pub.subscriptionStatus === 'active' || pub.subscriptionStatus === 'trialing';
}

export function authMethods(): { google: boolean; mail: boolean } {
  return { google: googleConfigured(), mail: mailConfigured() || process.env.NODE_ENV !== 'production' };
}

function issueDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function issueCode(email: string, purpose: MailPurpose, locale?: string, payload?: string): Promise<void> {
  db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
  const code = issueDigits();
  const expires = new Date(Date.now() + CODE_MINUTES * 60 * 1000).toISOString();
  db.prepare(
    'INSERT INTO email_codes (email, purpose, code_hash, payload, attempts, expires_at, created_at) VALUES (?,?,?,?,0,?,?)',
  ).run(email, purpose, hashCode(email, purpose, code), payload ?? null, expires, new Date().toISOString());
  await sendCodeEmail({ to: email, code, purpose, locale });
}

function consumeCode(email: string, purpose: MailPurpose, code: string): { ok: true; payload: string | null } | { error: string; status: number } {
  const row = db
    .prepare('SELECT id, code_hash, payload, attempts, expires_at FROM email_codes WHERE email = ? AND purpose = ? ORDER BY id DESC LIMIT 1')
    .get(email, purpose) as Row | undefined;
  if (!row) return { error: 'Aucun code en cours. Demandez-en un nouveau.', status: 400 };
  const id = Number(row.id);
  if (String(row.expires_at) < new Date().toISOString()) {
    db.prepare('DELETE FROM email_codes WHERE id = ?').run(id);
    return { error: 'Ce code a expiré. Demandez-en un nouveau.', status: 400 };
  }
  const attempts = Number(row.attempts) + 1;
  db.prepare('UPDATE email_codes SET attempts = ? WHERE id = ?').run(attempts, id);
  if (attempts > CODE_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM email_codes WHERE id = ?').run(id);
    return { error: 'Trop de tentatives. Demandez un nouveau code.', status: 429 };
  }
  const expected = Buffer.from(String(row.code_hash), 'utf8');
  const got = Buffer.from(hashCode(email, purpose, code.replace(/\s/g, '')), 'utf8');
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
    return { error: 'Code incorrect.', status: 401 };
  }
  db.prepare('DELETE FROM email_codes WHERE email = ? AND purpose = ?').run(email, purpose);
  return { ok: true, payload: (row.payload as string | null) ?? null };
}

export async function register(
  emailRaw: string,
  password: string,
  locale?: string,
): Promise<{ needsCode: true; purpose: 'verify' } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid, status: 400 };

  const existing = findUserByEmail(email);
  if (existing?.emailVerified) return { error: 'Un compte existe déjà avec cet e-mail.', status: 409 };

  const hash = await hashPassword(password);
  if (existing) setPasswordHash(existing.id, hash);
  else createUser(email, hash, { verified: false });

  try {
    await issueCode(email, 'verify', locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { needsCode: true, purpose: 'verify' };
}

export async function login(
  emailRaw: string,
  password: string,
  locale?: string,
): Promise<
  { user: AuthUser; token: string } | { needsCode: true; purpose: 'verify' } | { error: string; status: number }
> {
  const email = normalizeEmail(emailRaw);
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: 'E-mail ou mot de passe incorrect.', status: 401 };

  const found = findUserByEmail(email);
  if (!found || !found.passwordHash) {
    if (found?.googleId) return { error: 'Ce compte se connecte avec Google.', status: 400 };
    return { error: 'E-mail ou mot de passe incorrect.', status: 401 };
  }
  if (!(await verifyPassword(password, found.passwordHash))) {
    return { error: 'E-mail ou mot de passe incorrect.', status: 401 };
  }

  if (found.emailVerified) {
    return { user: found, token: createSession(found.id) };
  }

  try {
    await issueCode(email, 'verify', locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { needsCode: true, purpose: 'verify' };
}

export async function verifyEmailCode(
  emailRaw: string,
  code: string,
  purposeRaw: string,
): Promise<{ user: AuthUser; token: string } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  if (validateEmail(email)) return { error: 'Adresse e-mail invalide.', status: 400 };
  const purpose = purposeRaw === 'verify' || purposeRaw === 'login' ? purposeRaw : null;
  if (!purpose) return { error: 'Vérification invalide.', status: 400 };
  if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return { error: 'Code incorrect.', status: 401 };

  const consumed = consumeCode(email, purpose, code);
  if ('error' in consumed) return consumed;

  const user = findUserByEmail(email);
  if (!user) return { error: 'Compte introuvable.', status: 404 };
  if (!user.emailVerified) markVerified(user.id);
  const fresh = findUserById(user.id)!;
  return { user: fresh, token: createSession(fresh.id) };
}

export async function resendCode(
  emailRaw: string,
  purposeRaw: string,
  locale?: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  if (validateEmail(email)) return { error: 'Adresse e-mail invalide.', status: 400 };
  const purpose: MailPurpose | null = purposeRaw === 'verify' || purposeRaw === 'login' || purposeRaw === 'reset' ? purposeRaw : null;
  if (!purpose) return { error: 'Demande invalide.', status: 400 };
  const found = findUserByEmail(email);
  if (!found && purpose !== 'verify') return { ok: true };
  try {
    await issueCode(email, purpose, locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { ok: true };
}

export async function forgot(
  emailRaw: string,
  locale?: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  if (validateEmail(email)) return { ok: true };
  const found = findUserByEmail(email);
  if (!found) return { ok: true };
  try {
    await issueCode(email, 'reset', locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { ok: true };
}

export async function resetPassword(
  emailRaw: string,
  code: string,
  password: string,
): Promise<{ user: AuthUser; token: string } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid, status: 400 };
  if (!/^\d{6}$/.test(code.replace(/\s/g, ''))) return { error: 'Code incorrect.', status: 401 };

  const consumed = consumeCode(email, 'reset', code);
  if ('error' in consumed) return consumed;

  const found = findUserByEmail(email);
  if (!found) return { error: 'Compte introuvable.', status: 404 };
  setPasswordHash(found.id, await hashPassword(password));
  const fresh = findUserById(found.id)!;
  return { user: fresh, token: createSession(fresh.id) };
}

type OauthState = { next: string; link: boolean; t: number };

function signOauthState(payload: OauthState): string {
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', pepper() || 'dev').update(json).digest('base64url');
  return `${json}.${sig}`;
}

function readOauthState(raw: string | undefined): OauthState | null {
  if (!raw || !raw.includes('.')) return null;
  const [json, sig] = raw.split('.');
  if (!json || !sig) return null;
  const expected = createHmac('sha256', pepper() || 'dev').update(json).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8')) as OauthState;
    if (Date.now() - payload.t > 10 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeNext(raw: string | undefined): string {
  if (!raw) return '/app';
  if (raw.startsWith('/app') || raw === '/abonnement') return raw;
  return '/app';
}

export function startGoogle(req: Request, res: Response): void {
  if (!googleConfigured()) {
    res.status(503).json({ error: 'La connexion Google n’est pas configurée.' });
    return;
  }
  const sessionUser = userFromRequest(req);
  const state = signOauthState({
    next: safeNext(typeof req.query.next === 'string' ? req.query.next : undefined),
    link: Boolean(sessionUser) || req.query.link === '1',
    t: Date.now(),
  });
  res.redirect(googleAuthUrl(req, state));
}

export async function finishGoogle(req: Request, res: Response): Promise<void> {
  const appUrl = publicBaseUrl(req);
  const fail = (message: string) => {
    res.redirect(`${appUrl}/connexion?error=${encodeURIComponent(message)}`);
  };

  const err = typeof req.query.error === 'string' ? req.query.error : '';
  if (err) return fail('Connexion Google annulée.');
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = readOauthState(typeof req.query.state === 'string' ? req.query.state : undefined);
  if (!code || !state) return fail('Connexion Google invalide.');

  let profile: Awaited<ReturnType<typeof exchangeGoogleCode>>;
  try {
    profile = await exchangeGoogleCode(req, code);
  } catch {
    return fail('Google a refusé la connexion.');
  }

  const sessionUser = userFromRequest(req);
  if (state.link && sessionUser) {
    const taken = findUserByGoogleId(profile.googleId);
    if (taken && taken.id !== sessionUser.id) {
      return fail('Ce compte Google est déjà lié à un autre utilisateur.');
    }
    saveGoogle(sessionUser.id, profile);
    res.redirect(`${appUrl}${state.next}`);
    return;
  }

  let user = findUserByGoogleId(profile.googleId) ?? findUserByEmail(profile.email);
  if (user) {
    saveGoogle(user.id, profile);
    user = findUserById(user.id);
  } else {
    user = createUser(profile.email, '', { verified: true, googleId: profile.googleId });
    saveGoogle(user.id, profile);
    user = findUserById(user.id);
  }
  if (!user) return fail('Impossible de créer le compte Google.');
  attachSession(req, res, createSession(user.id));
  res.redirect(`${appUrl}${state.next}`);
}

export function attachSession(req: Request, res: Response, token: string): void {
  setSessionCookie(req, res, token);
}

export function dropSession(req: Request, res: Response): void {
  destroySession(req);
  clearSessionCookie(req, res);
}
