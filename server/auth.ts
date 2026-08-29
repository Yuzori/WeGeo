/**
 * Comptes et sessions. Les mots de passe sont dérivés avec scrypt ;
 * le jeton de session est un secret aléatoire, seul son hash est stocké.
 * E-mail : code à 6 chiffres. Google : OAuth + jeton Sheets.
 */

import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { NextFunction, Request, Response } from 'express';
import type { PlanId, PublicUser, SubscriptionStatus } from '../shared/types.ts';
import { DEV_PLAN_LIMITS, PLAN_LIMITS, type PlanLimits } from '../shared/plans.ts';
import db, { ensurePersonalWorkspace } from './db.ts';
import { googleAuthUrl, googleConfigured, exchangeGoogleCode } from './google.ts';
import { mailConfigured, sendCodeEmail, type MailPurpose } from './mail.ts';
import { avatarUrl, clearAvatar, hasAvatar, saveAvatarDataUrl, saveAvatarFromUrl } from './avatars.ts';
import { isHttpsRequest, publicBaseUrl } from './security.ts';
import { normalizeUsername, usernameFromDisplayName, usernameSeedFromEmail, validateUsername } from './username.ts';

const scryptAsync = promisify(scrypt);

const COOKIE = 'prospy_sid';
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const CODE_MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthUser {
  id: number;
  email: string;
  username: string;
  emailVerified: boolean;
  googleId: string | null;
  googleRefreshToken: string | null;
  needsUsername: boolean;
  hasPassword: boolean;
  createdAt: string;
}

type Row = Record<string, unknown>;

function pepper(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) return secret;
  return process.env.NODE_ENV === 'production' ? '' : 'dev';
}

export function isDeveloperAccount(email: string): boolean {
  const raw = process.env.DEV_ACCOUNT_EMAILS ?? '';
  const allowed = new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email.trim().toLowerCase());
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

function subscriptionRow(userId: number): { plan: PlanId | null; status: SubscriptionStatus } {
  const sub = db
    .prepare(
      `SELECT plan, status FROM subscriptions
       WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(userId) as Row | undefined;
  return {
    plan: (sub?.plan as PlanId | undefined) ?? null,
    status: (sub?.status as SubscriptionStatus | undefined) ?? 'none',
  };
}

function paidStatus(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing';
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
    username: String(row.username ?? ''),
    emailVerified: Number(row.email_verified) === 1,
    googleId: (row.google_id as string | null) ?? null,
    googleRefreshToken: (row.google_refresh_token as string | null) ?? null,
    needsUsername: Number(row.needs_username) === 1,
    hasPassword: Boolean(String(row.password_hash ?? '')),
    createdAt: String(row.created_at ?? ''),
  };
}

const USER_COLS =
  'id, email, username, email_verified, google_id, google_refresh_token, password_hash, needs_username, created_at';

function usernameTaken(username: string, exceptUserId?: number): boolean {
  const row = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as Row | undefined;
  if (!row) return false;
  return exceptUserId == null || Number(row.id) !== exceptUserId;
}

export function allocateUsername(seed: string, exceptUserId?: number): string {
  let base = normalizeUsername(seed);
  if (validateUsername(base)) base = usernameSeedFromEmail(`${base || 'user'}@prospy.local`);
  let candidate = base.slice(0, 24);
  let n = 0;
  while (usernameTaken(candidate, exceptUserId) || validateUsername(candidate)) {
    n += 1;
    const suffix = String(n);
    candidate = `${base.slice(0, Math.max(1, 24 - suffix.length))}${suffix}`;
  }
  return candidate;
}

export function createUser(
  email: string,
  passwordHash: string,
  extras: { verified?: boolean; googleId?: string; username?: string; needsUsername?: boolean } = {},
): AuthUser {
  const username = extras.username ? normalizeUsername(extras.username) : allocateUsername(usernameSeedFromEmail(email));
  const info = db
    .prepare(
      `INSERT INTO users (email, username, password_hash, created_at, email_verified, google_id, needs_username)
       VALUES (?,?,?,?,?,?,?)`,
    )
    .run(
      email,
      username,
      passwordHash,
      new Date().toISOString(),
      extras.verified ? 1 : 0,
      extras.googleId ?? null,
      extras.needsUsername ? 1 : 0,
    );
  const id = Number(info.lastInsertRowid);
  claimOrphanData(id);
  const workspaceId = ensurePersonalWorkspace(id);
  db.prepare('UPDATE leads SET workspace_id = ? WHERE user_id = ? AND workspace_id = 0').run(workspaceId, id);
  db.prepare('UPDATE searches SET workspace_id = ? WHERE user_id = ? AND workspace_id = 0').run(workspaceId, id);
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

export function findUserByUsername(usernameRaw: string): (AuthUser & { passwordHash: string }) | null {
  const username = normalizeUsername(usernameRaw);
  if (!username) return null;
  const row = db.prepare(`SELECT ${USER_COLS} FROM users WHERE username = ?`).get(username) as Row | undefined;
  if (!row) return null;
  return { ...rowToUser(row), passwordHash: (row.password_hash as string) ?? '' };
}

export function findUserByLogin(identifierRaw: string): (AuthUser & { passwordHash: string }) | null {
  const identifier = identifierRaw.trim();
  if (identifier.includes('@')) return findUserByEmail(normalizeEmail(identifier));
  return findUserByUsername(identifier);
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
      `SELECT u.id, u.email, u.username, u.email_verified, u.google_id, u.google_refresh_token, u.password_hash, u.needs_username, u.created_at
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

export function requirePaid(_req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  if (!userHasAccess(user)) {
    res.status(402).json({ error: 'Un abonnement actif est requis.' });
    return;
  }
  next();
}

export function currentUser(res: Response): AuthUser {
  return res.locals.user as AuthUser;
}

export function planLimitsForUser(user: AuthUser): PlanLimits {
  if (isDeveloperAccount(user.email)) return DEV_PLAN_LIMITS;
  if (!stripeConfigured() && process.env.NODE_ENV !== 'production') return DEV_PLAN_LIMITS;
  const { plan, status } = subscriptionRow(user.id);
  if (paidStatus(status) && plan && PLAN_LIMITS[plan]) return PLAN_LIMITS[plan];
  return PLAN_LIMITS.starter;
}

export function toPublicUser(user: AuthUser): PublicUser {
  const { plan, status } = subscriptionRow(user.id);
  const active = paidStatus(status);
  const developer = isDeveloperAccount(user.email);
  const hasAccess = userHasAccess(user);
  const limits = planLimitsForUser(user);

  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: avatarUrl(user.id),
    needsUsername: user.needsUsername,
    hasPassword: user.hasPassword,
    createdAt: user.createdAt,
    plan: active ? plan : developer ? 'agence' : null,
    subscriptionStatus: status,
    googleLinked: Boolean(user.googleId),
    canExportSheets: Boolean(user.googleRefreshToken) && limits.exportSheets,
    hasAccess,
    developer,
    limits,
  };
}

export function userHasAccess(user: AuthUser): boolean {
  if (isDeveloperAccount(user.email)) return true;
  if (!stripeConfigured()) return process.env.NODE_ENV !== 'production';
  const { status } = subscriptionRow(user.id);
  return paidStatus(status);
}

export function authMethods(): { google: boolean; mail: boolean } {
  return { google: googleConfigured(), mail: mailConfigured() };
}

function issueDigits(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

async function issueCode(email: string, purpose: Exclude<MailPurpose, 'invite'>, locale?: string, payload?: string): Promise<void> {
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
  usernameRaw?: string,
  avatarDataUrl?: string,
): Promise<{ needsCode: true; purpose: 'verify' } | { error: string; status: number }> {
  const email = normalizeEmail(emailRaw);
  const invalid = validateCredentials(email, password);
  if (invalid) return { error: invalid, status: 400 };
  const usernameError = validateUsername(usernameRaw ?? '');
  if (usernameError) return { error: usernameError, status: 400 };
  const username = normalizeUsername(usernameRaw ?? '');

  const existing = findUserByEmail(email);
  if (existing?.emailVerified) return { error: 'Un compte existe déjà avec cet e-mail.', status: 409 };
  if (usernameTaken(username, existing?.id)) return { error: 'Ce pseudo est déjà pris.', status: 409 };

  const hash = await hashPassword(password);
  if (existing) {
    setPasswordHash(existing.id, hash);
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, existing.id);
  } else createUser(email, hash, { verified: false, username });

  const user = findUserByEmail(email);
  if (user && avatarDataUrl?.trim()) {
    try {
      saveAvatarDataUrl(user.id, avatarDataUrl);
    } catch {
      /* photo optionnelle : le compte se crée quand même */
    }
  }

  try {
    await issueCode(email, 'verify', locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { needsCode: true, purpose: 'verify' };
}

export async function login(
  identifierRaw: string,
  password: string,
  locale?: string,
): Promise<
  | { user: AuthUser; token: string }
  | { needsCode: true; purpose: 'verify'; email: string }
  | { error: string; status: number }
> {
  if (validatePassword(password)) return { error: 'Pseudo, e-mail ou mot de passe incorrect.', status: 401 };

  const found = findUserByLogin(identifierRaw);
  if (!found || !found.passwordHash) {
    if (found?.googleId) return { error: 'Ce compte se connecte avec Google.', status: 400 };
    return { error: 'Pseudo, e-mail ou mot de passe incorrect.', status: 401 };
  }
  if (!(await verifyPassword(password, found.passwordHash))) {
    return { error: 'Pseudo, e-mail ou mot de passe incorrect.', status: 401 };
  }

  if (found.emailVerified) {
    return { user: found, token: createSession(found.id) };
  }

  try {
    await issueCode(found.email, 'verify', locale);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Impossible d’envoyer le code.', status: 503 };
  }
  return { needsCode: true, purpose: 'verify', email: found.email };
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
  const sig = createHmac('sha256', pepper()).update(json).digest('base64url');
  return `${json}.${sig}`;
}

function readOauthState(raw: string | undefined): OauthState | null {
  if (!raw || !raw.includes('.')) return null;
  const [json, sig] = raw.split('.');
  if (!json || !sig) return null;
  const expected = createHmac('sha256', pepper()).update(json).digest('base64url');
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

function withAppEnter(path: string): string {
  if (!path.startsWith('/app')) return path;
  if (path.startsWith('/app/compte') || path.startsWith('/app/pseudo')) return path;
  if (path.includes('enter=')) return path;
  return `${path}${path.includes('?') ? '&' : '?'}enter=1`;
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

async function applyGooglePhoto(userId: number, picture: string | null): Promise<void> {
  if (!picture || hasAvatar(userId)) return;
  try {
    await saveAvatarFromUrl(userId, picture);
  } catch {
    /* photo Google optionnelle */
  }
}

function pickGoogleUsername(name: string, email: string): { username: string; needsUsername: boolean } {
  if (!name.trim()) {
    return { username: allocateUsername(usernameSeedFromEmail(email)), needsUsername: true };
  }
  const preferred = usernameFromDisplayName(name);
  if (!validateUsername(preferred) && !usernameTaken(preferred)) {
    return { username: preferred, needsUsername: false };
  }
  return {
    username: allocateUsername(preferred || usernameSeedFromEmail(email)),
    needsUsername: true,
  };
}

export function claimUsername(
  user: AuthUser,
  raw: string,
): { user: AuthUser } | { error: string; status: number } {
  const usernameError = validateUsername(raw);
  if (usernameError) return { error: usernameError, status: 400 };
  const username = normalizeUsername(raw);
  if (usernameTaken(username, user.id)) return { error: 'Ce pseudo est déjà pris.', status: 409 };
  db.prepare('UPDATE users SET username = ?, needs_username = 0 WHERE id = ?').run(username, user.id);
  return { user: findUserById(user.id)! };
}

export async function updateProfile(
  user: AuthUser,
  body: {
    username?: string;
    password?: string;
    currentPassword?: string;
    avatar?: string | null;
  },
): Promise<{ user: AuthUser } | { error: string; status: number }> {
  if (typeof body.username === 'string' && body.username.trim() && body.username !== user.username) {
    const claimed = claimUsername(user, body.username);
    if ('error' in claimed) return claimed;
    user = claimed.user;
  }

  if (typeof body.password === 'string' && body.password.length > 0) {
    const invalid = validatePassword(body.password);
    if (invalid) return { error: invalid, status: 400 };
    if (user.hasPassword) {
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as Row | undefined;
      const hash = String(row?.password_hash ?? '');
      if (!hash || !(await verifyPassword(body.currentPassword ?? '', hash))) {
        return { error: 'Mot de passe actuel incorrect.', status: 401 };
      }
    }
    setPasswordHash(user.id, await hashPassword(body.password));
  }

  if (body.avatar === null) {
    clearAvatar(user.id);
  } else if (typeof body.avatar === 'string' && body.avatar.trim()) {
    try {
      saveAvatarDataUrl(user.id, body.avatar);
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Photo illisible.', status: 400 };
    }
  }

  return { user: findUserById(user.id)! };
}

export function accountStats(userId: number): {
  sessions: number;
  searches: number;
  leads: number;
  signed: number;
  memberSince: string;
} {
  const count = (sql: string) =>
    Number((db.prepare(sql).get(userId) as Row | undefined)?.n ?? 0);
  const created = db.prepare('SELECT created_at FROM users WHERE id = ?').get(userId) as Row | undefined;
  return {
    sessions: count('SELECT COUNT(*) AS n FROM workspace_members WHERE user_id = ?'),
    searches: count(
      `SELECT COUNT(*) AS n FROM searches s
       JOIN workspace_members m ON m.workspace_id = s.workspace_id
       WHERE m.user_id = ?`,
    ),
    leads: count(
      `SELECT COUNT(*) AS n FROM leads l
       JOIN workspace_members m ON m.workspace_id = l.workspace_id
       WHERE m.user_id = ?`,
    ),
    signed: count(
      `SELECT COUNT(*) AS n FROM leads l
       JOIN workspace_members m ON m.workspace_id = l.workspace_id
       WHERE m.user_id = ? AND l.status = 'termine'`,
    ),
    memberSince: String(created?.created_at ?? ''),
  };
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
    await applyGooglePhoto(sessionUser.id, profile.picture);
    res.redirect(`${appUrl}${state.next}`);
    return;
  }

  let user = findUserByGoogleId(profile.googleId) ?? findUserByEmail(profile.email);
  if (user) {
    saveGoogle(user.id, profile);
    await applyGooglePhoto(user.id, profile.picture);
    user = findUserById(user.id);
  } else {
    const picked = pickGoogleUsername(profile.name, profile.email);
    user = createUser(profile.email, '', {
      verified: true,
      googleId: profile.googleId,
      username: picked.username,
      needsUsername: picked.needsUsername,
    });
    saveGoogle(user.id, profile);
    await applyGooglePhoto(user.id, profile.picture);
    user = findUserById(user.id);
  }
  if (!user) return fail('Impossible de créer le compte Google.');
  attachSession(req, res, createSession(user.id));
  const next = user.needsUsername ? '/app/pseudo' : withAppEnter(state.next);
  res.redirect(`${appUrl}${next}`);
}

export function attachSession(req: Request, res: Response, token: string): void {
  setSessionCookie(req, res, token);
}

export function dropSession(req: Request, res: Response): void {
  destroySession(req);
  clearSessionCookie(req, res);
}
