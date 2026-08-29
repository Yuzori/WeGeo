/**
 * Photos de profil : fichiers locaux, jamais renvoyés en base64 dans l’API.
 */

import { mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'data/avatars');
mkdirSync(DIR, { recursive: true });

export type AvatarKind = 'jpeg' | 'png' | 'webp';

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

export function readAvatar(userId: number): { buffer: Buffer; kind: AvatarKind } | null {
  if (!hasAvatar(userId)) return null;
  const buffer = readFileSync(avatarFile(userId));
  const kind = sniffImage(buffer);
  if (!kind) return null;
  return { buffer, kind };
}
