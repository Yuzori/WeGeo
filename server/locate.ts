import { clientIp } from './security.ts';
import type { Request } from 'express';

export type VisitorPlace = {
  city: string;
  lat: number;
  lng: number;
};

const USER_AGENT = 'Prospy/1.0 (outil de prospection locale)';

function isPrivateIp(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/i, '');
  if (!v4 || v4 === 'unknown' || v4 === '::1' || v4 === '127.0.0.1') return true;
  if (/^10\./.test(v4) || /^127\./.test(v4) || /^192\.168\./.test(v4) || /^169\.254\./.test(v4)) return true;
  const m = /^172\.(\d+)\./.exec(v4);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function parseWho(data: unknown): VisitorPlace | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (row.success === false) return null;
  const lat = Number(row.latitude);
  const lng = Number(row.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const city = String(row.city || row.region || row.country || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
  if (!city) return null;
  return { city, lat, lng };
}

export async function locateRequest(req: Request): Promise<VisitorPlace | null> {
  const ip = clientIp(req).replace(/^::ffff:/i, '');
  if (isPrivateIp(ip)) return null;
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country,latitude,longitude`, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  return parseWho(await res.json());
}
