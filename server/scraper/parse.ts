import { createHash } from 'node:crypto';
import type { WebsiteKind } from '../../shared/types.ts';

/** Domaines qui ne constituent pas un vrai site web d'entreprise. */
const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.me',
  'fb.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'youtube.com',
  'pinterest.com',
  'wa.me',
  'linktr.ee',
  'snapchat.com',
];

/** Annuaires et plateformes : ce n'est pas le site de l'entreprise. */
const DIRECTORY_HOSTS = [
  'pagesjaunes.fr',
  'google.com',
  'google.fr',
  'goo.gl',
  'maps.app.goo.gl',
  'ubereats.com',
  'deliveroo.fr',
  'just-eat.fr',
  'thefork.fr',
  'lafourchette.com',
  'doctolib.fr',
  'planity.com',
  'treatwell.fr',
  'shortcutssoftware.com',
  'booksy.com',
  'resalib.fr',
  'kiute.com',
  'flexybeauty.com',
  'wellnessliving.com',
  'zenchef.com',
  'guestonline.fr',
  'malou.io',
  'obypay.com',
  'sumup.link',
  'booking.com',
  'tripadvisor.fr',
  'tripadvisor.com',
  'yelp.com',
  'leboncoin.fr',
  'airbnb.fr',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Détermine si une URL est un vrai site d'entreprise, une simple présence
 * sur les réseaux sociaux, ou rien d'exploitable.
 */
export function classifyWebsite(url: string | null | undefined): { website: string | null; kind: WebsiteKind } {
  if (!url) return { website: null, kind: 'aucun' };
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { website: null, kind: 'aucun' };

  const host = hostOf(clean);
  if (!host) return { website: null, kind: 'aucun' };

  if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return { website: clean, kind: 'social' };
  }
  if (DIRECTORY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    // Une fiche d'annuaire ne compte pas comme site : l'entreprise reste une cible.
    return { website: clean, kind: 'social' };
  }
  return { website: clean, kind: 'site' };
}

const PHONE_RE =
  /(?:\+33|0033)\s?[1-9](?:[\s.\-]?\d{2}){4}|\b0[1-9](?:[\s.\-]?\d{2}){4}\b|\b(?:\+\d{1,3}\s?)?\d{2,4}(?:[\s.\-]\d{2,3}){2,4}\b/;

/** Met un numéro français au format `01 23 45 67 89`. */
export function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+33')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0033')) digits = `0${digits.slice(4)}`;

  if (/^0\d{9}$/.test(digits)) return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
  // Numéro étranger ou format inhabituel : on garde la valeur nettoyée.
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed.length >= 6 ? trimmed : null;
}

/** Cherche un numéro de téléphone dans un bloc de texte. */
export function findPhone(text: string): string | null {
  const lines = text.split('\n');
  for (const line of lines) {
    // On évite les lignes d'horaires ("Ferme à 22:00") et de notes ("4,5(120)").
    if (/\d{1,2}:\d{2}/.test(line)) continue;
    if (/^\d[.,]\d/.test(line.trim())) continue;
    const m = line.match(PHONE_RE);
    if (m) {
      const formatted = formatPhone(m[0]);
      if (formatted) return formatted;
    }
  }
  return null;
}

const ADDRESS_HINT =
  /\b(rue|avenue|av\.|boulevard|bd|place|impasse|chemin|route|rte|allée|allee|quai|cours|square|passage|zone|z\.?a\.?|z\.?i\.?|centre|cc|lieu-dit|résidence|residence|faubourg|esplanade|parc|villa|sentier|voie|carrefour|rond-point)\b/i;

/** Google sépare les métadonnées d'une carte par différents caractères « point médian ». */
const SEPARATORS = /[·⋅•∙]/;

/** Horaires, statut d'ouverture, services : ce n'est ni une activité ni une adresse. */
const NOISE =
  /\d{1,2}\s?:\s?\d{2}|\bouvert\b|\bferm[eé]\b|\bferme\b|\bouvre\b|24\s?h|\bh\s?\d{2}\b|livraison|à emporter|sur place|drive|rendez-vous|ferme bient[oô]t|temporairement/i;

function isPhoneLike(v: string): boolean {
  if (/\p{L}/u.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

function looksLikeAddress(v: string): boolean {
  if (isPhoneLike(v)) return false;
  if (NOISE.test(v)) return false;
  if (ADDRESS_HINT.test(v)) return true;
  // « 12 Grande Rue », « 4 bis Jean Moulin » : un numéro suivi de mots.
  return /^\d{1,4}\s*(bis|ter)?\s+\p{L}{2,}/u.test(v.trim());
}

/**
 * Extrait catégorie et adresse depuis les lignes d'une carte de résultat
 * Google Maps (format « Catégorie · Adresse »).
 */
export function parseCardLines(
  lines: string[],
  name?: string,
): { category: string | null; address: string | null } {
  let category: string | null = null;
  let address: string | null = null;

  const normalizedName = name ? normalizeKey(name) : null;

  for (const line of lines) {
    // On ignore le nom de l'entreprise et la ligne de notation.
    if (normalizedName && normalizeKey(line) === normalizedName) continue;
    if (/^\d[.,]\d\s*\(/.test(line) || /^\(?\d+\)?$/.test(line) || /aucun avis|no reviews/i.test(line)) continue;

    const parts = line
      .split(SEPARATORS)
      .map((p) => p.trim())
      .filter(Boolean);

    for (const part of parts) {
      if (!address && looksLikeAddress(part)) {
        address = part;
        continue;
      }
      // La première mention neutre est l'activité (« Plombier », « Boulangerie »).
      if (!category && !NOISE.test(part) && !isPhoneLike(part) && !looksLikeAddress(part)) {
        const words = part.split(/\s+/);
        if (words.length <= 5 && /\p{L}/u.test(part) && !/^\d/.test(part)) category = part;
      }
    }
  }

  return { category: clean(category), address: clean(address) };
}

function clean(v: string | null): string | null {
  if (!v) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
}

/** Retire les préfixes des `aria-label` Google (« Adresse: 12 rue … »). */
export function stripLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return clean(value.replace(/^[^:]{0,30}:\s*/, ''));
}

/**
 * Clé de déduplication stable : l'identifiant de lieu Google contenu dans
 * l'URL (`!1s0x…:0x…`) ou, à défaut, une empreinte nom + adresse.
 */
export function placeKeyFrom(mapsUrl: string, name: string, address: string | null): string {
  const feature = mapsUrl.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1];
  if (feature) return feature.toLowerCase();

  const cid = mapsUrl.match(/[?&]cid=(\d+)/)?.[1];
  if (cid) return `cid:${cid}`;

  const placeId = mapsUrl.match(/!1s(ChI[\w-]+)/)?.[1];
  if (placeId) return placeId;

  const fingerprint = `${normalizeKey(name)}|${normalizeKey(address ?? '')}`;
  return `fp:${createHash('sha1').update(fingerprint).digest('hex').slice(0, 20)}`;
}

function normalizeKey(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Coordonnées présentes dans une URL Google Maps. */
export function coordsFrom(mapsUrl: string): { lat: number | null; lng: number | null } {
  const bang = mapsUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (bang) return { lat: Number(bang[1]), lng: Number(bang[2]) };
  const at = mapsUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) return { lat: Number(at[1]), lng: Number(at[2]) };
  return { lat: null, lng: null };
}

/** Note et nombre d'avis depuis un texte type « 4,5 (128) ». */
export function parseRating(text: string | null): { rating: number | null; reviewCount: number | null } {
  if (!text) return { rating: null, reviewCount: null };
  const rating = text.match(/(\d[.,]\d)/)?.[1];
  const reviews = text.match(/\(([\d\s\u202f.,]+)\)/)?.[1];
  return {
    rating: rating ? Number(rating.replace(',', '.')) : null,
    reviewCount: reviews ? Number(reviews.replace(/[^\d]/g, '')) || null : null,
  };
}

/** Construit un lien Google Maps propre et cliquable. */
export function cleanMapsUrl(url: string, name: string, address: string | null): string {
  if (url && url.includes('/maps/place/')) return url.split('?')[0];
  const q = encodeURIComponent(address ? `${name} ${address}` : name);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Lien « itinéraire » / recherche d'adresse cliquable. */
export function addressMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
