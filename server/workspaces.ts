/**
 * Espaces de travail partagés (« sessions » dans l’interface).
 * Les fiches et recherches appartiennent à l’espace, pas au compte.
 */

import type { NextFunction, Request, Response } from 'express';
import type { PeopleMatch, Workspace, WorkspaceInvite, WorkspaceMember } from '../shared/types.ts';
import { currentUser, findUserByEmail, findUserById, findUserByLogin, normalizeEmail, planLimitsForUser, validateEmail, type AuthUser } from './auth.ts';
import { avatarUrl } from './avatars.ts';
import db, { ensurePersonalWorkspace } from './db.ts';
import { mailConfigured, sendInviteEmail } from './mail.ts';

type Row = Record<string, unknown>;
const now = () => new Date().toISOString();

export function currentWorkspaceId(res: Response): number {
  return res.locals.workspaceId as number;
}

export function currentWorkspaceRole(res: Response): 'owner' | 'member' {
  return res.locals.workspaceRole as 'owner' | 'member';
}

function membership(workspaceId: number, userId: number): { role: 'owner' | 'member' } | null {
  const row = db
    .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
    .get(workspaceId, userId) as Row | undefined;
  if (!row) return null;
  const role = row.role === 'owner' ? 'owner' : 'member';
  return { role };
}

export function shareWorkspace(userA: number, userB: number): boolean {
  if (userA === userB) return true;
  const row = db
    .prepare(
      `SELECT 1 FROM workspace_members a
       JOIN workspace_members b ON a.workspace_id = b.workspace_id
       WHERE a.user_id = ? AND b.user_id = ?
       LIMIT 1`,
    )
    .get(userA, userB);
  return Boolean(row);
}

function seatCount(workspaceId: number): number {
  const members = db.prepare('SELECT COUNT(*) AS n FROM workspace_members WHERE workspace_id = ?').get(workspaceId) as
    | Row
    | undefined;
  const pending = db
    .prepare(`SELECT COUNT(*) AS n FROM workspace_invites WHERE workspace_id = ? AND status = 'pending'`)
    .get(workspaceId) as Row | undefined;
  return Number(members?.n ?? 0) + Number(pending?.n ?? 0);
}

function workspaceExists(id: number): boolean {
  return Boolean(db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id));
}

export function requireWorkspace(req: Request, res: Response, next: NextFunction): void {
  const user = currentUser(res);
  const raw = req.headers['x-workspace-id'] ?? req.query.workspaceId;
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Choisissez une session.' });
    return;
  }
  const member = membership(id, user.id);
  if (!member) {
    res.status(403).json({ error: 'Cette session ne vous est pas ouverte.' });
    return;
  }
  res.locals.workspaceId = id;
  res.locals.workspaceRole = member.role;
  next();
}

function membersOf(workspaceId: number): WorkspaceMember[] {
  return (
    db
      .prepare(
        `SELECT u.id, u.email, u.username, m.role
         FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ?
         ORDER BY m.role DESC, u.email`,
      )
      .all(workspaceId) as Row[]
  ).map((row) => ({
    id: Number(row.id),
    email: String(row.email),
    username: String(row.username ?? ''),
    role: row.role === 'owner' ? 'owner' : 'member',
  }));
}

function guestLabel(email: string): string {
  const found = findUserByEmail(email);
  if (found?.username) return found.username;
  const local = email.split('@')[0]?.trim() || 'invite';
  return local.slice(0, 24);
}

function refreshAutoName(workspaceId: number): void {
  const row = db.prepare('SELECT auto_named, owner_id FROM workspaces WHERE id = ?').get(workspaceId) as Row | undefined;
  if (!row || Number(row.auto_named) !== 1) return;
  const owner = findUserById(Number(row.owner_id));
  if (!owner) return;

  const members = db
    .prepare(
      `SELECT u.username, u.email FROM workspace_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ? AND m.user_id != ?
       ORDER BY m.joined_at, u.id`,
    )
    .all(workspaceId, owner.id) as Row[];
  const pending = db
    .prepare(
      `SELECT email FROM workspace_invites WHERE workspace_id = ? AND status = 'pending' ORDER BY id`,
    )
    .all(workspaceId) as Row[];

  const seen = new Set([owner.email]);
  const parts = [owner.username];
  for (const member of members) {
    const email = String(member.email);
    if (seen.has(email)) continue;
    seen.add(email);
    parts.push(String(member.username || guestLabel(email)));
  }
  for (const invite of pending) {
    const email = String(invite.email);
    if (seen.has(email)) continue;
    seen.add(email);
    parts.push(guestLabel(email));
  }

  const name = parts.join(' & ').slice(0, 80);
  if (name.length >= 2) db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, workspaceId);
}

function toWorkspace(row: Row, userId: number): Workspace {
  const id = Number(row.id);
  const member = membership(id, userId);
  const counts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?) AS members,
         (SELECT COUNT(*) FROM leads WHERE workspace_id = ?) AS leads,
         (SELECT COUNT(*) FROM searches WHERE workspace_id = ?) AS searches`,
    )
    .get(id, id, id) as Row;
  return {
    id,
    name: String(row.name),
    personal: Number(row.personal) === 1,
    role: member?.role ?? 'member',
    memberCount: Number(counts.members ?? 0),
    leadCount: Number(counts.leads ?? 0),
    searchCount: Number(counts.searches ?? 0),
    createdAt: String(row.created_at),
    members: membersOf(id),
  };
}

export function listForUser(user: AuthUser): Workspace[] {
  ensurePersonalWorkspace(user.id);
  const rows = db
    .prepare(
      `SELECT w.* FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = ?
       ORDER BY w.personal DESC, w.created_at DESC`,
    )
    .all(user.id) as Row[];
  return rows.map((row) => toWorkspace(row, user.id));
}

export function getForUser(id: number, user: AuthUser): Workspace | null {
  if (!membership(id, user.id)) return null;
  const row = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as Row | undefined;
  return row ? toWorkspace(row, user.id) : null;
}

export function createWorkspace(user: AuthUser, nameRaw: string): Workspace | { error: string; status: number } {
  const name = nameRaw.trim().slice(0, 80);
  if (name.length < 2) return { error: 'Donnez un nom d’au moins 2 lettres.', status: 400 };
  const info = db
    .prepare('INSERT INTO workspaces (name, owner_id, personal, created_at) VALUES (?,?,0,?)')
    .run(name, user.id, now());
  const id = Number(info.lastInsertRowid);
  db.prepare('INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?,?,?,?)').run(
    id,
    user.id,
    'owner',
    now(),
  );
  return getForUser(id, user)!;
}

export function renameWorkspace(
  id: number,
  user: AuthUser,
  nameRaw: string,
): Workspace | { error: string; status: number } {
  const member = membership(id, user.id);
  if (!member) return { error: 'Cette session ne vous est pas ouverte.', status: 403 };
  if (member.role !== 'owner') return { error: 'Seul le créateur peut renommer la session.', status: 403 };
  const name = nameRaw.trim().slice(0, 80);
  if (name.length < 2) return { error: 'Donnez un nom d’au moins 2 lettres.', status: 400 };
  db.prepare('UPDATE workspaces SET name = ?, auto_named = 0 WHERE id = ?').run(name, id);
  return getForUser(id, user)!;
}

export function deleteWorkspace(id: number, user: AuthUser): { ok: true } | { error: string; status: number } {
  const row = db.prepare('SELECT personal, owner_id FROM workspaces WHERE id = ?').get(id) as Row | undefined;
  if (!row) return { error: 'Session introuvable.', status: 404 };
  if (Number(row.personal) === 1) return { error: 'La session personnelle ne se supprime pas.', status: 400 };
  if (Number(row.owner_id) !== user.id) return { error: 'Seul le créateur peut supprimer la session.', status: 403 };
  db.prepare('DELETE FROM leads WHERE workspace_id = ?').run(id);
  db.prepare('DELETE FROM searches WHERE workspace_id = ?').run(id);
  db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  return { ok: true };
}

export function leaveWorkspace(id: number, user: AuthUser): { ok: true } | { error: string; status: number } {
  const row = db.prepare('SELECT personal, owner_id FROM workspaces WHERE id = ?').get(id) as Row | undefined;
  if (!row) return { error: 'Session introuvable.', status: 404 };
  if (Number(row.personal) === 1) return { error: 'Vous ne pouvez pas quitter votre session personnelle.', status: 400 };
  if (!membership(id, user.id)) return { error: 'Vous n’êtes pas dans cette session.', status: 403 };
  if (Number(row.owner_id) === user.id) {
    const others = db
      .prepare(`SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id != ? AND role = 'owner'`)
      .get(id, user.id) as Row | undefined;
    if (!others) return { error: 'Transférez la session ou supprimez-la avant de partir.', status: 400 };
  }
  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(id, user.id);
  refreshAutoName(id);
  return { ok: true };
}

export function removeMember(
  id: number,
  user: AuthUser,
  memberId: number,
): Workspace | { error: string; status: number } {
  const member = membership(id, user.id);
  if (!member || member.role !== 'owner') return { error: 'Seul le créateur peut retirer quelqu’un.', status: 403 };
  if (memberId === user.id) return { error: 'Quittez la session plutôt que de vous retirer.', status: 400 };
  db.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?').run(id, memberId);
  refreshAutoName(id);
  return getForUser(id, user)!;
}

export function listInvites(user: AuthUser): WorkspaceInvite[] {
  return (
    db
      .prepare(
        `SELECT i.id, i.workspace_id, i.email, i.created_at, w.name AS workspace_name, u.email AS from_email, u.username AS from_username
         FROM workspace_invites i
         JOIN workspaces w ON w.id = i.workspace_id
         JOIN users u ON u.id = i.from_user_id
         WHERE i.status = 'pending' AND i.email = ?
         ORDER BY i.id DESC`,
      )
      .all(user.email) as Row[]
  ).map((row) => ({
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    workspaceName: String(row.workspace_name),
    fromEmail: String(row.from_email),
    fromUsername: String(row.from_username ?? ''),
    email: String(row.email),
    createdAt: String(row.created_at),
  }));
}

export async function invite(
  workspaceId: number,
  user: AuthUser,
  queryRaw: string,
  locale?: string,
): Promise<{ ok: true; found: boolean; workspace: Workspace } | { error: string; status: number }> {
  const member = membership(workspaceId, user.id);
  if (!member) return { error: 'Cette session ne vous est pas ouverte.', status: 403 };
  if (!workspaceExists(workspaceId)) return { error: 'Session introuvable.', status: 404 };

  const looked = lookupPerson(queryRaw);
  if ('error' in looked) return looked;
  const email = looked.email;
  if (email === user.email) return { error: 'Vous êtes déjà dans cette session.', status: 400 };

  const target = findUserByEmail(email);
  if (target && membership(workspaceId, target.id)) {
    return { error: 'Cette personne est déjà dans la session.', status: 409 };
  }

  const current = db
    .prepare('SELECT personal, owner_id FROM workspaces WHERE id = ?')
    .get(workspaceId) as Row | undefined;
  const owner = current ? findUserById(Number(current.owner_id)) : null;
  const limits = planLimitsForUser(owner ?? user);
  if (limits.maxSeats <= 1) {
    return { error: 'Les invitations d’équipe sont réservées aux offres Pro et Agence.', status: 402 };
  }
  if (seatCount(workspaceId) >= limits.maxSeats) {
    return { error: `Cette session est limitée à ${limits.maxSeats} personnes.`, status: 403 };
  }

  if (current && Number(current.personal) === 1) {
    db.prepare('UPDATE workspaces SET personal = 0, auto_named = 1 WHERE id = ?').run(workspaceId);
    ensurePersonalWorkspace(user.id);
  }

  db.prepare(
    `DELETE FROM workspace_invites WHERE workspace_id = ? AND email = ? AND status = 'pending'`,
  ).run(workspaceId, email);
  db.prepare(
    'INSERT INTO workspace_invites (workspace_id, email, from_user_id, status, created_at) VALUES (?,?,?,?,?)',
  ).run(workspaceId, email, user.id, 'pending', now());

  refreshAutoName(workspaceId);

  const workspace = getForUser(workspaceId, user)!;
  if (mailConfigured()) {
    try {
      await sendInviteEmail({
        to: email,
        fromEmail: user.username || user.email,
        workspaceName: workspace.name,
        locale,
      });
    } catch {
      /* l’invitation in-app reste valable même si le mail échoue */
    }
  }

  return { ok: true, found: looked.found, workspace };
}

export function acceptInvite(inviteId: number, user: AuthUser): Workspace | { error: string; status: number } {
  const row = db
    .prepare(
      `SELECT id, workspace_id, email, status FROM workspace_invites WHERE id = ?`,
    )
    .get(inviteId) as Row | undefined;
  if (!row || String(row.email) !== user.email) return { error: 'Invitation introuvable.', status: 404 };
  if (String(row.status) !== 'pending') return { error: 'Cette invitation n’est plus valable.', status: 400 };
  const workspaceId = Number(row.workspace_id);
  if (!workspaceExists(workspaceId)) {
    db.prepare('DELETE FROM workspace_invites WHERE id = ?').run(inviteId);
    return { error: 'Cette session n’existe plus.', status: 404 };
  }
  db.prepare('INSERT OR IGNORE INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?,?,?,?)').run(
    workspaceId,
    user.id,
    'member',
    now(),
  );
  db.prepare(`UPDATE workspace_invites SET status = 'accepted' WHERE id = ?`).run(inviteId);
  refreshAutoName(workspaceId);
  return getForUser(workspaceId, user)!;
}

export function declineInvite(inviteId: number, user: AuthUser): { ok: true } | { error: string; status: number } {
  const row = db.prepare('SELECT workspace_id, email, status FROM workspace_invites WHERE id = ?').get(inviteId) as
    | Row
    | undefined;
  if (!row || String(row.email) !== user.email) return { error: 'Invitation introuvable.', status: 404 };
  db.prepare(`UPDATE workspace_invites SET status = 'declined' WHERE id = ?`).run(inviteId);
  refreshAutoName(Number(row.workspace_id));
  return { ok: true };
}

export function lookupPerson(queryRaw: string): { found: boolean; email: string } | { error: string; status: number } {
  const query = queryRaw.trim();
  if (!query) return { error: 'Indiquez un pseudo ou un e-mail.', status: 400 };
  if (query.includes('@')) {
    const email = normalizeEmail(query);
    if (validateEmail(email)) return { error: 'Adresse e-mail invalide.', status: 400 };
    return { found: Boolean(findUserByEmail(email)), email };
  }
  const found = findUserByLogin(query);
  if (!found) return { error: 'Aucun compte avec ce pseudo.', status: 404 };
  return { found: true, email: found.email };
}

export function searchPeople(user: AuthUser, queryRaw: string): PeopleMatch[] {
  const query = queryRaw.trim().toLowerCase();
  if (query.length < 2) return [];
  const safe = query.replace(/[%_]/g, '');
  if (safe.length < 2) return [];
  const like = `%${safe}%`;
  const prefix = `${safe}%`;
  const rows = db
    .prepare(
      `SELECT id, username FROM users
       WHERE id != ?
         AND email_verified = 1
         AND LOWER(username) LIKE ?
       ORDER BY
         CASE
           WHEN LOWER(username) = ? THEN 0
           WHEN LOWER(username) LIKE ? THEN 1
           ELSE 2
         END,
         username
       LIMIT 8`,
    )
    .all(user.id, like, safe, prefix) as Row[];
  return rows.map((row) => {
    const id = Number(row.id);
    return {
      id,
      username: String(row.username ?? ''),
      avatarUrl: shareWorkspace(user.id, id) ? avatarUrl(id) : null,
    };
  });
}

export function publicLookup(queryRaw: string): { found: boolean } | { error: string; status: number } {
  const query = queryRaw.trim();
  if (!query) return { error: 'Indiquez un pseudo ou un e-mail.', status: 400 };
  if (query.includes('@')) {
    const email = normalizeEmail(query);
    if (validateEmail(email)) return { error: 'Adresse e-mail invalide.', status: 400 };
    return { found: true };
  }
  const found = findUserByLogin(query);
  if (!found) return { error: 'Aucun compte avec ce pseudo.', status: 404 };
  return { found: true };
}
