/** Types partagés entre le serveur (scraping) et l'interface React. */

/** Étape du pipeline commercial d'un prospect. */
export type LeadStatus =
  /** Trouvé lors d'une recherche, pas encore trié. */
  | 'nouveau'
  /** Mis de côté pour être appelé. */
  | 'favori'
  /** Client signé. */
  | 'termine'
  /** Contacté mais non signé — exclu des recherches suivantes. */
  | 'perdu';

export const LEAD_STATUSES: LeadStatus[] = ['nouveau', 'favori', 'termine', 'perdu'];

/**
 * Nature du lien web de l'entreprise.
 * `social` (page Facebook/Instagram uniquement) est considéré comme une cible
 * de prospection : l'entreprise n'a pas de vrai site.
 */
export type WebsiteKind = 'aucun' | 'social' | 'site';

/** Une entreprise trouvée sur Google Maps. */
export interface Lead {
  id: number;
  /** Identifiant Google Maps (CID ou empreinte nom+adresse) — sert de clé de déduplication. */
  placeKey: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  /** URL trouvée sur la fiche, `null` si aucune. */
  website: string | null;
  websiteKind: WebsiteKind;
  rating: number | null;
  reviewCount: number | null;
  /** Lien cliquable vers la fiche Google Maps. */
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
  city: string;
  /** Le métier recherché qui a fait remonter cette entreprise. */
  domain: string;
  status: LeadStatus;
  /** Nom du dirigeant (SIRENE), s’il a pu être identifié. */
  dirigeant: string | null;
  /** Page publique (annuaire-entreprises) correspondant à la recherche SIRENE. */
  dirigeantSource: string | null;
  /** `found` / `missing` après lookup ; `null` si pas encore cherché. */
  dirigeantStatus: 'pending' | 'found' | 'missing' | null;
  /** Notes libres saisies pendant l'appel. */
  notes: string | null;
  /** true si l'entreprise a déjà été vue lors d'une recherche précédente. */
  createdAt: string;
  updatedAt: string;
  /** Nombre de fois où l'entreprise est remontée dans une recherche. */
  seenCount: number;
}

export interface SearchRecord {
  id: number;
  userId: number;
  workspaceId: number;
  city: string;
  domains: string[];
  /** Options utilisées, conservées pour pouvoir relancer la recherche à l'identique. */
  options: SearchOptions;
  status: 'en_cours' | 'termine' | 'annule' | 'erreur';
  /** Nombre total de fiches inspectées. */
  scanned: number;
  /** Nombre d'entreprises sans site web retenues. */
  found: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  /** Nombre total de couples métier × secteur à parcourir. */
  totalTasks: number | null;
  /** Nombre de ces couples déjà terminés — le reste peut être reprise. */
  doneTasks: number;
}

/** Une recherche arrêtée avant la fin peut être relancée là où elle en était. */
export function isResumable(search: SearchRecord): boolean {
  if (search.status === 'en_cours') return false;
  return search.totalTasks !== null && search.doneTasks < search.totalTasks;
}

export interface SearchOptions {
  /** Ne garder que les entreprises sans vrai site web. */
  onlyWithoutWebsite: boolean;
  /** Compter une page Facebook/Instagram comme « pas de site » (donc à prospecter). */
  socialCountsAsNoWebsite: boolean;
  /** Ouvrir chaque fiche pour confirmer l'absence de site et récupérer le téléphone exact. */
  deepCheck: boolean;
  /** Exclure les entreprises déjà traitées (terminé / perdu). */
  excludeHandled: boolean;
  /** Ne garder que les fiches avec un numéro de téléphone. */
  requirePhone: boolean;
  /** Nombre maximum de fiches inspectées par métier (0 = illimité). */
  maxPerDomain: number;
  /** Quadrillage géographique : découpe la ville en zones pour dépasser la limite de ~120 résultats. */
  gridMode: boolean;
  /** Nombre de zones par côté du quadrillage (2 = 4 zones, 3 = 9 zones...). */
  gridSize: number;
}

export const DEFAULT_OPTIONS: SearchOptions = {
  onlyWithoutWebsite: true,
  socialCountsAsNoWebsite: true,
  deepCheck: true,
  excludeHandled: true,
  requirePhone: false,
  maxPerDomain: 0,
  gridMode: false,
  gridSize: 2,
};

export interface SearchRequest {
  city: string;
  domains: string[];
  options: SearchOptions;
}

/** Messages poussés en direct (SSE) pendant une recherche. */
export type ScrapeEvent =
  | { type: 'start'; searchId: number; totalTasks: number }
  | { type: 'progress'; message: string; scanned: number; found: number; taskIndex: number; totalTasks: number }
  | { type: 'lead'; lead: Lead }
  | { type: 'done'; search: SearchRecord }
  | { type: 'error'; message: string };

export interface Stats {
  nouveau: number;
  favori: number;
  termine: number;
  perdu: number;
  total: number;
  searches: number;
}

/** Offres d’abonnement. Les Price IDs Stripe restent côté serveur. */
export type PlanId = 'starter' | 'pro' | 'agence';

export type SubscriptionStatus =
  | 'none'
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

/** Profil renvoyé au navigateur : jamais de hash ni d’identifiants Stripe. */
export interface PublicUser {
  id: number;
  email: string;
  username: string;
  avatarUrl: string | null;
  needsUsername: boolean;
  hasPassword: boolean;
  createdAt: string;
  plan: PlanId | null;
  subscriptionStatus: SubscriptionStatus;
  googleLinked: boolean;
  canExportSheets: boolean;
}

export interface AccountStats {
  sessions: number;
  searches: number;
  leads: number;
  signed: number;
  memberSince: string;
}

export interface PeopleMatch {
  id: number;
  username: string;
  email: string;
  avatarUrl: string | null;
}

export interface BillingPlan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Libellé d’affichage uniquement ; le montant facturé est celui de Stripe. */
  amountLabel: string;
  interval: 'month';
  features: string[];
  /** Limites de l’offre, affichées sur le site. Pas encore appliquées dans l’outil. */
  locked?: string[];
  highlighted?: boolean;
  cta: string;
  priceConfigured: boolean;
}

export interface BillingPublicConfig {
  /** Clé publiable Stripe (`pk_…`), prévue pour le navigateur. */
  publishableKey: string | null;
  configured: boolean;
  plans: BillingPlan[];
}

/** Espace de travail partagé (appelé « session » dans l’interface). */
export interface WorkspaceMember {
  id: number;
  email: string;
  username: string;
  role: 'owner' | 'member';
}

export interface Workspace {
  id: number;
  name: string;
  personal: boolean;
  role: 'owner' | 'member';
  memberCount: number;
  leadCount: number;
  searchCount: number;
  createdAt: string;
  members: WorkspaceMember[];
}

export interface WorkspaceInvite {
  id: number;
  workspaceId: number;
  workspaceName: string;
  fromEmail: string;
  fromUsername: string;
  email: string;
  createdAt: string;
}
