import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { sniffImage } from './avatars.ts';

const DIR = resolve(process.cwd(), 'data/workspace-logos');
mkdirSync(DIR, { recursive: true });

export type LogoMode = 'default' | 'custom' | 'previous';

function logoFile(workspaceId: number): string {
  return join(DIR, `${workspaceId}.jpg`);
}

function previousLogoFile(workspaceId: number): string {
  return join(DIR, `${workspaceId}.previous.jpg`);
}

function logoUrlFor(path: string, route: string): string | null {
  if (!existsSync(path)) return null;
  try {
    const stamp = readFileSync(path).length;
    return `${route}?v=${stamp}`;
  } catch {
    return route;
  }
}

export function hasCustomWorkspaceLogo(workspaceId: number): boolean {
  return existsSync(logoFile(workspaceId));
}

export function hasPreviousWorkspaceLogo(workspaceId: number): boolean {
  return existsSync(previousLogoFile(workspaceId));
}

export function customWorkspaceLogoUrl(workspaceId: number): string | null {
  return logoUrlFor(logoFile(workspaceId), `/api/workspace-logos/${workspaceId}`);
}

export function previousWorkspaceLogoUrl(workspaceId: number): string | null {
  return logoUrlFor(previousLogoFile(workspaceId), `/api/workspace-logos/${workspaceId}/previous`);
}

export function workspaceLogoUrl(workspaceId: number, mode: LogoMode = 'custom'): string | null {
  if (mode === 'default') return null;
  if (mode === 'previous') return previousWorkspaceLogoUrl(workspaceId);
  return customWorkspaceLogoUrl(workspaceId);
}

export function normalizeLogoMode(raw: unknown): LogoMode | null {
  const value = String(raw ?? '').trim();
  if (value === 'default' || value === 'custom' || value === 'previous') return value;
  return null;
}

function archiveCurrentWorkspaceLogo(workspaceId: number): void {
  const active = logoFile(workspaceId);
  if (!existsSync(active)) return;
  mkdirSync(dirname(previousLogoFile(workspaceId)), { recursive: true });
  copyFileSync(active, previousLogoFile(workspaceId));
}

export function saveWorkspaceLogo(workspaceId: number, dataUrl: string): void {
  const match = dataUrl.trim().match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-zA-Z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Image invalide.');
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (buffer.length < 32 || buffer.length > 900_000) throw new Error('Logo trop lourd ou illisible.');
  if (!sniffImage(buffer)) throw new Error('Image invalide.');
  archiveCurrentWorkspaceLogo(workspaceId);
  mkdirSync(dirname(logoFile(workspaceId)), { recursive: true });
  writeFileSync(logoFile(workspaceId), buffer);
}

export function clearWorkspaceLogo(workspaceId: number): void {
  try {
    if (existsSync(logoFile(workspaceId))) unlinkSync(logoFile(workspaceId));
  } catch {
    /* ignore */
  }
}

export function clearAllWorkspaceLogos(workspaceId: number): void {
  clearWorkspaceLogo(workspaceId);
  try {
    if (existsSync(previousLogoFile(workspaceId))) unlinkSync(previousLogoFile(workspaceId));
  } catch {
    /* ignore */
  }
}

export function readWorkspaceLogo(workspaceId: number): Buffer | null {
  try {
    if (!existsSync(logoFile(workspaceId))) return null;
    return readFileSync(logoFile(workspaceId));
  } catch {
    return null;
  }
}

export function readPreviousWorkspaceLogo(workspaceId: number): Buffer | null {
  try {
    if (!existsSync(previousLogoFile(workspaceId))) return null;
    return readFileSync(previousLogoFile(workspaceId));
  } catch {
    return null;
  }
}

const COVER_PRESETS = new Set(['lime', 'forest', 'ember', 'violet', 'night']);

export function normalizeCoverStyle(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  const value = String(raw).trim().slice(0, 32);
  if (!value) return null;
  if (COVER_PRESETS.has(value)) return value;
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  return null;
}
