/**
 * Photos de profil : fichiers locaux, jamais renvoyés en base64 dans l’API.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'data/avatars');
const RECENT_MAX = 8;
mkdirSync(DIR, { recursive: true });

export type AvatarKind = 'jpeg' | 'png' | 'webp';

export function avatarFile(userId: number): string {
  return join(DIR, `${userId}.jpg`);
}

function recentDir(userId: number): string {
  return join(DIR, 'recent', String(userId));
}

function manifestFile(userId: number): string {
  return join(recentDir(userId), 'manifest.json');
}

function readManifest(userId: number): string[] {
  try {
    const raw = readFileSync(manifestFile(userId), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((entry) => String(entry)).filter(Boolean);
  } catch {
    return [];
  }
}

function writeManifest(userId: number, entries: string[]): void {
  mkdirSync(recentDir(userId), { recursive: true });
  writeFileSync(manifestFile(userId), JSON.stringify(entries.slice(0, RECENT_MAX)));
}

function bufferHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

function recentFile(userId: number, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '');
  if (!safe.endsWith('.jpg')) throw new Error('Nom de fichier invalide.');
  return join(recentDir(userId), safe);
}

function pushRecentAvatar(userId: number, buffer: Buffer): void {
  if (buffer.length < 32) return;
  const hash = bufferHash(buffer);
  const dir = recentDir(userId);
  mkdirSync(dir, { recursive: true });
  let manifest = readManifest(userId);

  const existing = manifest.find((name) => {
    try {
      return bufferHash(readFileSync(recentFile(userId, name))) === hash;
    } catch {
      return false;
    }
  });

  if (existing) {
    manifest = [existing, ...manifest.filter((name) => name !== existing)];
  } else {
    const name = `${Date.now()}.jpg`;
    writeFileSync(recentFile(userId, name), buffer);
    manifest = [name, ...manifest];
  }

  while (manifest.length > RECENT_MAX) {
    const removed = manifest.pop();
    if (!removed) break;
    try {
      unlinkSync(recentFile(userId, removed));
    } catch {
      /* ignore */
    }
  }

  writeManifest(userId, manifest);
}

function archiveCurrentAvatar(userId: number): void {
  if (!hasAvatar(userId)) return;
  try {
    pushRecentAvatar(userId, readFileSync(avatarFile(userId)));
  } catch {
    /* ignore */
  }
}

export function hasAvatar(userId: number): boolean {
  return existsSync(avatarFile(userId));
}

export function avatarUrl(userId: number): string | null {
  if (!hasAvatar(userId)) return null;
  try {
    const stamp = readFileSync(avatarFile(userId)).length;
    return `/api/avatars/${userId}?v=${stamp}`;
  } catch {
    return `/api/avatars/${userId}`;
  }
}

export function recentAvatarUrls(userId: number): string[] {
  return readManifest(userId).map((name) => {
    try {
      const stamp = readFileSync(recentFile(userId, name)).length;
      return `/api/avatars/${userId}/recent/${encodeURIComponent(name)}?v=${stamp}`;
    } catch {
      return `/api/avatars/${userId}/recent/${encodeURIComponent(name)}`;
    }
  });
}

export function sniffImage(buffer: Buffer): AvatarKind | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function saveAvatarBuffer(userId: number, buffer: Buffer): void {
  if (buffer.length < 32 || buffer.length > 900_000) {
    throw new Error('Photo trop lourde ou illisible.');
  }
  if (!sniffImage(buffer)) {
    throw new Error('Image invalide.');
  }
  archiveCurrentAvatar(userId);
  mkdirSync(dirname(avatarFile(userId)), { recursive: true });
  writeFileSync(avatarFile(userId), buffer);
}

export function saveAvatarDataUrl(userId: number, dataUrl: string): void {
  const match = dataUrl.trim().match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Image invalide.');
  saveAvatarBuffer(userId, Buffer.from(match[2].replace(/\s/g, ''), 'base64'));
}

export async function saveAvatarFromUrl(userId: number, url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Photo Google indisponible.');
  const buffer = Buffer.from(await res.arrayBuffer());
  saveAvatarBuffer(userId, buffer);
}

export function applyRecentAvatar(userId: number, index: number): void {
  const manifest = readManifest(userId);
  const name = manifest[index];
  if (!name) throw new Error('Photo récente introuvable.');
  const buffer = readFileSync(recentFile(userId, name));
  if (!sniffImage(buffer)) throw new Error('Image invalide.');
  archiveCurrentAvatar(userId);
  mkdirSync(dirname(avatarFile(userId)), { recursive: true });
  writeFileSync(avatarFile(userId), buffer);
}

export function clearAvatar(userId: number): void {
  archiveCurrentAvatar(userId);
  try {
    if (hasAvatar(userId)) unlinkSync(avatarFile(userId));
  } catch {
    /* ignore */
  }
}

export function readAvatar(userId: number): { buffer: Buffer; kind: AvatarKind } | null {
  if (!hasAvatar(userId)) return null;
  const buffer = readFileSync(avatarFile(userId));
  const kind = sniffImage(buffer);
  if (!kind) return null;
  return { buffer, kind };
}

export function readRecentAvatar(userId: number, name: string): { buffer: Buffer; kind: AvatarKind } | null {
  const manifest = readManifest(userId);
  if (!manifest.includes(name)) return null;
  const buffer = readFileSync(recentFile(userId, name));
  const kind = sniffImage(buffer);
  if (!kind) return null;
  return { buffer, kind };
}

export function clearAllAvatars(userId: number): void {
  clearAvatar(userId);
  const manifest = readManifest(userId);
  for (const name of manifest) {
    try {
      unlinkSync(recentFile(userId, name));
    } catch {
      /* ignore */
    }
  }
  try {
    unlinkSync(manifestFile(userId));
  } catch {
    /* ignore */
  }
}
