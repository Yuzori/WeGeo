import type { Lead } from '../../shared/types';

/* ------------------------------------------------------ potentiel commercial */

/** Quatre paliers, du meilleur au moins bon. */
export type Tier = 'excellent' | 'bon' | 'moyen' | 'faible';

export interface Potential {
  /** Note de 0 à 100. */
  score: number;
  tier: Tier;
  /** Ce qui a fait monter la note, à afficher au survol. */
  reasons: string[];
}

const TIER_LABEL: Record<Tier, string> = {
  excellent: 'Excellent',
  bon: 'Bon',
  moyen: 'Moyen',
  faible: 'Faible',
};

export const tierLabel = (tier: Tier) => TIER_LABEL[tier];

/**
 * Feu tricolore du potentiel : vert au sommet, rouge en bas. Les variables CSS
 * suivent le thème clair ou sombre, les classes servent aux textes et fonds.
 */
export const TIER_COLORS: Record<Tier, { css: string; text: string; bg: string; border: string }> = {
  excellent: { css: 'var(--score-high)', text: 'text-score-high', bg: 'bg-score-high', border: 'border-score-high' },
  bon: { css: 'var(--score-good)', text: 'text-score-good', bg: 'bg-score-good', border: 'border-score-good' },
  moyen: { css: 'var(--score-mid)', text: 'text-score-mid', bg: 'bg-score-mid', border: 'border-score-mid' },
  faible: { css: 'var(--score-low)', text: 'text-score-low', bg: 'bg-score-low', border: 'border-score-low' },
};

export const tierOf = (score: number): Tier =>
  score >= 80 ? 'excellent' : score >= 65 ? 'bon' : score >= 50 ? 'moyen' : 'faible';

/**
 * Estime l'intérêt d'un prospect.
 *
 * L'absence de site étant le critère de recherche, elle ne départage presque
 * rien : ce qui distingue une fiche, c'est la demande qu'elle prouve. Le poids
 * va donc surtout au nombre d'avis, à la note, et au fait d'être joignable.
 */
export function potential(lead: Lead): Potential {
  const reasons: string[] = [];
  let score = 0;

  if (lead.websiteKind === 'aucun') {
    score += 15;
    reasons.push('Aucune présence en ligne');
  } else if (lead.websiteKind === 'social') {
    score += 8;
    reasons.push('Réseau social uniquement');
  }

  const reviews = lead.reviewCount ?? 0;
  if (reviews > 0) {
    // Échelle logarithmique : passer de 5 à 50 avis compte plus que de 300 à 350.
    score += Math.min(50, Math.round((Math.log10(reviews + 1) / Math.log10(501)) * 50));
    if (reviews >= 150) reasons.push(`${reviews} avis : clientèle installée`);
    else if (reviews >= 30) reasons.push(`${reviews} avis`);
    else reasons.push(`Peu d’avis (${reviews})`);
  } else {
    reasons.push('Aucun avis');
  }

  const rating = lead.rating ?? 0;
  if (rating >= 4.5) {
    score += 18;
    reasons.push(`Très bien notée (${rating.toFixed(1).replace('.', ',')})`);
  } else if (rating >= 4) {
    score += 12;
  } else if (rating >= 3.5) {
    score += 6;
  }

  if (lead.phone) {
    score += 17;
  } else {
    reasons.push('Pas de téléphone sur la fiche');
  }

  score = Math.max(0, Math.min(100, score));
  return { score, tier: tierOf(score), reasons };
}

/* -------------------------------------------------------------------- tris */

export type SortMode = 'potentiel' | 'avis' | 'note' | 'nom' | 'recent';

export const SORT_LABELS: Record<SortMode, string> = {
  potentiel: 'Potentiel',
  avis: 'Nombre d’avis',
  note: 'Note',
  nom: 'Nom (A→Z)',
  recent: 'Plus récents',
};

export function sortLeads(leads: Lead[], mode: SortMode): Lead[] {
  const copy = [...leads];

  switch (mode) {
    case 'potentiel':
      return copy.sort((a, b) => potential(b).score - potential(a).score);
    case 'avis':
      return copy.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    case 'note':
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    case 'nom':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    case 'recent':
      return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

/* ---------------------------------------------------------------- affichage */

/** Coordonnées en degrés, comme sur une carte d'état-major. */
export function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'O';
  return `${Math.abs(lat).toFixed(4)}° ${ns}  ${Math.abs(lng).toFixed(4)}° ${ew}`;
}

/** Numéro français lisible : 04 50 12 34 56. */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  const local = digits.startsWith('+33') ? `0${digits.slice(3)}` : digits;
  if (!/^0\d{9}$/.test(local)) return phone;
  return local.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
}

/** Initiales affichées dans le monogramme d'une fiche. */
export function initials(name: string): string {
  return name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('');
}

/**
 * Couleur stable déduite du nom : deux fiches voisines se distinguent, et une
 * même entreprise garde toujours sa teinte. La plage est volontairement
 * étroite — ocre, olive, sauge — pour rester dans les tons de la carte au lieu
 * de piquer l'écran de pastilles multicolores.
 */
export function hueOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 1_000;
  return 58 + (hash % 90);
}
