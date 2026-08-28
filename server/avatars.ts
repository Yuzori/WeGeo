/**
 * Photos de profil : fichiers locaux, jamais renvoyés en base64 dans l’API.
 */

import { mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'data/avatars');
mkdirSync(DIR, { recursive: true });

export function avatarFile(userId: number): string {
  return join(DIR, `${userId}.jpg`);
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

export function saveAvatarBuffer(userId: number, buffer: Buffer): void {
  if (buffer.length < 32 || buffer.length > 900_000) {
    throw new Error('Photo trop lourde ou illisible.');
  }
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

export function clearAvatar(userId: number): void {
  if (hasAvatar(userId)) unlinkSync(avatarFile(userId));
}

export function readAvatar(userId: number): Buffer | null {
  if (!hasAvatar(userId)) return null;
  return readFileSync(avatarFile(userId));
}
