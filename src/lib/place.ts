import { useEffect, useState } from 'react';
import type { Lead } from '../../shared/types';
import { api, type VisitorPlace } from '../api';

export type { VisitorPlace };

/** Point de repli : le mock historique, si l’IP ne dit rien. */
export const FALLBACK_PLACE: VisitorPlace = {
  city: 'Lyon',
  lat: 45.764,
  lng: 4.8357,
};

const LYON = { lat: 45.764, lng: 4.8357 };

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

/** En local l’API voit 127.0.0.1 : on interroge alors l’IP vue par le navigateur (donc le VPN). */
async function locateFromBrowser(): Promise<VisitorPlace | null> {
  const res = await fetch('https://ipwho.is/?fields=success,city,region,country,latitude,longitude', {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  return parseWho(await res.json());
}

export async function locateVisitor(): Promise<VisitorPlace> {
  try {
    const fromApi = await api.locate();
    if (fromApi?.city && Number.isFinite(fromApi.lat) && Number.isFinite(fromApi.lng)) return fromApi;
  } catch {
    /* endpoint indisponible : on passe par le navigateur */
  }
  try {
    const fromBrowser = await locateFromBrowser();
    if (fromBrowser) return fromBrowser;
  } catch {
    /* hors ligne ou bloqué */
  }
  return FALLBACK_PLACE;
}

export function relocateLeads(leads: Lead[], place: VisitorPlace): Lead[] {
  const dLat = place.lat - LYON.lat;
  const dLng = place.lng - LYON.lng;
  return leads.map((lead) => {
    const lat = (lead.lat ?? LYON.lat) + dLat;
    const lng = (lead.lng ?? LYON.lng) + dLng;
    return {
      ...lead,
      lat,
      lng,
      city: place.city,
      address: place.city,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    };
  });
}

export function useVisitorPlace(): VisitorPlace {
  const [place, setPlace] = useState<VisitorPlace>(FALLBACK_PLACE);

  useEffect(() => {
    let dead = false;
    void locateVisitor().then((next) => {
      if (!dead) setPlace(next);
    });
    return () => {
      dead = true;
    };
  }, []);

  return place;
}
