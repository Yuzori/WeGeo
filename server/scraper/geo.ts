/**
 * Géocodage via Nominatim (OpenStreetMap) — gratuit et sans clé d'API.
 * Sert uniquement à connaître l'emprise d'une ville pour la découper en zones.
 */

const USER_AGENT = 'Prospy/1.0 (outil de prospection locale)';

export interface GeoCity {
  displayName: string;
  lat: number;
  lng: number;
  /** [sud, nord, ouest, est] */
  bbox: [number, number, number, number];
}

/** Pays francophones : évite de confondre une ville française avec une homonyme lointaine. */
const COUNTRIES = 'fr,be,ch,lu,mc';

interface NominatimPlace {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  importance?: number;
  type?: string;
  addresstype?: string;
  extratags?: Record<string, string> | null;
}

const SETTLEMENTS = ['city', 'town', 'village', 'municipality', 'borough', 'suburb'];

/**
 * Plusieurs communes françaises portent le même nom : on privilégie la plus
 * peuplée et la plus notoire, sinon on scraperait la mauvaise région.
 */
function score(place: NominatimPlace): number {
  const kind = place.addresstype ?? place.type ?? '';
  const isSettlement = SETTLEMENTS.includes(kind) ? 2 : 0;
  const population = Number(place.extratags?.population ?? 0);
  return isSettlement + (place.importance ?? 0) + Math.min(2, population / 50_000);
}

function toGeoCity(place: NominatimPlace): GeoCity {
  return {
    displayName: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
    bbox: [
      Number(place.boundingbox[0]),
      Number(place.boundingbox[1]),
      Number(place.boundingbox[2]),
      Number(place.boundingbox[3]),
    ],
  };
}

const cache = new Map<string, GeoCity | null>();
let lastCall = 0;

/** Nominatim demande au maximum une requête par seconde. */
async function throttle() {
  const wait = 1100 - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function query(city: string, settlementsOnly: boolean): Promise<NominatimPlace[]> {
  await throttle();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', city);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '10');
  url.searchParams.set('countrycodes', COUNTRIES);
  url.searchParams.set('extratags', '1');
  if (settlementsOnly) url.searchParams.set('featureType', 'settlement');

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return (await res.json()) as NominatimPlace[];
}

export async function geocodeCity(city: string): Promise<GeoCity | null> {
  const key = city.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;

  try {
    // On cherche d'abord parmi les communes, puis on élargit (code postal, quartier…).
    let places = await query(city, true);
    if (!places.length) places = await query(city, false);

    if (!places.length) {
      cache.set(key, null);
      return null;
    }

    const best = places.reduce((a, b) => (score(b) > score(a) ? b : a));
    const result = toGeoCity(best);
    cache.set(key, result);
    return result;
  } catch {
    cache.set(key, null);
    return null;
  }
}

export interface Tile {
  lat: number;
  lng: number;
  /** Niveau de zoom Google Maps adapté à la taille de la zone. */
  zoom: number;
  label: string;
}

/**
 * Découpe l'emprise d'une ville en `size × size` zones.
 * Google Maps ne renvoie qu'environ 120 résultats par recherche : en
 * interrogeant plusieurs zones plus petites, on couvre toute la ville.
 */
export function buildGrid(city: GeoCity, size: number): Tile[] {
  const [south, north, west, east] = city.bbox;
  const n = Math.max(1, Math.min(6, Math.round(size)));
  if (n === 1) return [{ lat: city.lat, lng: city.lng, zoom: 13, label: 'ville entière' }];

  const latStep = (north - south) / n;
  const lngStep = (east - west) / n;
  const tiles: Tile[] = [];

  // Plus la zone est petite, plus on peut zoomer : Google renvoie alors
  // les commerces de proximité plutôt qu'un échantillon de l'agglomération.
  const spanKm = Math.max(latStep * 111, lngStep * 111 * Math.cos((city.lat * Math.PI) / 180));
  const zoom = spanKm > 8 ? 13 : spanKm > 4 ? 14 : spanKm > 2 ? 15 : 16;

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      tiles.push({
        lat: south + latStep * (row + 0.5),
        lng: west + lngStep * (col + 0.5),
        zoom,
        label: `zone ${row * n + col + 1}/${n * n}`,
      });
    }
  }
  return tiles;
}
