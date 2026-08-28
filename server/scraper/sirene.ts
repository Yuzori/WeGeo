/**
 * Nom du dirigeant via l’API publique Recherche d’entreprises (SIRENE / INSEE).
 * Aucune clé : on interroge en parallèle du scraping Maps, sans jamais bloquer
 * l’enregistrement d’une fiche si l’API est lente ou ne trouve rien.
 */

const ENDPOINT = 'https://recherche-entreprises.api.gouv.fr/search';
const TIMEOUT_MS = 3_500;
const MAX_INFLIGHT = 12;
const CACHE_MAX = 800;

const LEGAL =
  /\b(sarl|sasu|sas|eurl|sa|sci|snc|earl|selarl|selas|scop|association|auto[\s-]?entrepreneur|micro[\s-]?entreprise)\b/gi;

interface DirigeantJson {
  nom?: string | null;
  prenoms?: string | null;
  prenom?: string | null;
  qualite?: string | null;
  type_dirigeant?: string | null;
  denomination?: string | null;
}

interface EtablissementJson {
  code_postal?: string | null;
  libelle_commune?: string | null;
  etat_administratif?: string | null;
}

interface EntrepriseJson {
  siren?: string | null;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  sigle?: string | null;
  etat_administratif?: string | null;
  siege?: EtablissementJson | null;
  matching_etablissements?: EtablissementJson[] | null;
  dirigeants?: DirigeantJson[] | null;
}

interface SearchResponse {
  results?: EntrepriseJson[];
}

export interface DirigeantQuery {
  name: string;
  address: string | null;
  city: string;
}

export interface DirigeantHit {
  name: string | null;
  source: string | null;
  siren: string | null;
}

const cache = new Map<string, Promise<DirigeantHit>>();

let inflight = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (inflight < MAX_INFLIGHT) {
    inflight += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else inflight -= 1;
}

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripLegal(value: string): string {
  return value.replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(value: string): string[] {
  return fold(stripLegal(value))
    .split(' ')
    .filter((t) => t.length > 2);
}

function postalOf(address: string | null): string | null {
  const match = address?.match(/\b(\d{5})\b/);
  return match?.[1] ?? null;
}

function cleanCity(city: string): string {
  return fold(city.replace(/\b(\d{1,2}\s*(e|er|eme|ème)|cedex)\b/gi, ' '));
}

function titleWord(word: string): string {
  if (!word) return '';
  if (word.includes('-')) return word.split('-').map(titleWord).join('-');
  if (word.includes("'")) {
    const [a, ...rest] = word.split("'");
    return `${titleWord(a)}'${rest.map(titleWord).join("'")}`;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function formatPerson(d: DirigeantJson): string | null {
  const last = (d.nom ?? '').trim();
  const first = (d.prenoms ?? d.prenom ?? '').trim();
  if (!last || !first) return null;
  return `${first.split(/\s+/).map(titleWord).join(' ')} ${titleWord(last)}`;
}

function qualityRank(qualite: string | null | undefined): number {
  const q = fold(qualite ?? '');
  if (/gerant/.test(q)) return 0;
  if (/president/.test(q)) return 1;
  if (/directeur/.test(q)) return 2;
  return 6;
}

function pickDirigeant(list: DirigeantJson[] | null | undefined): string | null {
  if (!list?.length) return null;
  const people = list.filter((d) => {
    if (d.type_dirigeant && /morale/i.test(d.type_dirigeant)) return false;
    return !!(d.nom && (d.prenoms || d.prenom));
  });
  people.sort((a, b) => qualityRank(a.qualite) - qualityRank(b.qualite));
  return people.length ? formatPerson(people[0]) : null;
}

function nameScore(queryName: string, result: EntrepriseJson): number {
  const q = fold(stripLegal(queryName));
  const names = [result.nom_complet, result.nom_raison_sociale, result.sigle]
    .filter(Boolean)
    .map((n) => fold(stripLegal(String(n))));
  if (!q || !names.length) return 0;

  let best = 0;
  for (const r of names) {
    if (q === r) best = Math.max(best, 8);
    else if (r.includes(q) || q.includes(r)) best = Math.max(best, 6);
    else {
      const qt = tokens(q);
      if (!qt.length) continue;
      const rt = new Set(tokens(r));
      const hits = qt.filter((t) => rt.has(t) || [...rt].some((x) => x.includes(t) || t.includes(x)));
      best = Math.max(best, Math.round((hits.length / qt.length) * 6));
    }
  }
  return best;
}

function hasPostal(result: EntrepriseJson, postal: string): boolean {
  if (result.siege?.code_postal === postal) return true;
  return (result.matching_etablissements ?? []).some((e) => e.code_postal === postal);
}

function hasCity(result: EntrepriseJson, city: string): boolean {
  if (!city) return false;
  const places = [result.siege?.libelle_commune, ...(result.matching_etablissements ?? []).map((e) => e.libelle_commune)]
    .filter(Boolean)
    .map((v) => fold(String(v)));
  return places.some((p) => p === city || p.includes(city) || city.includes(p));
}

function scoreResult(result: EntrepriseJson, query: DirigeantQuery, postal: string | null): number {
  if (result.etat_administratif && result.etat_administratif !== 'A') return -1;
  const named = nameScore(query.name, result);
  if (named < 3) return -1;
  let score = named;
  if (postal && hasPostal(result, postal)) score += 4;
  else if (hasCity(result, cleanCity(query.city))) score += 2;
  return score;
}

function cacheKey(query: DirigeantQuery): string {
  return `${fold(query.name)}|${postalOf(query.address) ?? ''}|${cleanCity(query.city)}`;
}

async function search(params: URLSearchParams): Promise<EntrepriseJson[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Prospy/1.0 (https://prospy.fr)',
      },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as SearchResponse;
    return body.results ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function companyPage(siren: string): string {
  return `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`;
}

function searchPage(query: DirigeantQuery): string {
  const terme = [query.name, query.city].filter(Boolean).join(' ').trim();
  return `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(terme)}`;
}

function emptyHit(query: DirigeantQuery): DirigeantHit {
  return { name: null, source: searchPage(query), siren: null };
}

async function fetchBest(query: DirigeantQuery): Promise<DirigeantHit> {
  const name = query.name.trim();
  if (name.length < 3) return emptyHit(query);

  const postal = postalOf(query.address);
  const city = cleanCity(query.city);

  const params = new URLSearchParams({
    q: postal ? `${name} ${postal}` : city ? `${name} ${query.city}` : name,
    per_page: '5',
    etat_administratif: 'A',
    page: '1',
  });
  if (postal) params.set('code_postal', postal);

  await acquire();
  let results: EntrepriseJson[] = [];
  try {
    results = await search(params);
    if (!results.length && postal) {
      const fallback = new URLSearchParams({
        q: city ? `${name} ${query.city}` : name,
        per_page: '5',
        etat_administratif: 'A',
        page: '1',
      });
      results = await search(fallback);
    }
  } finally {
    release();
  }

  let best: { score: number; row: EntrepriseJson } | null = null;
  for (const row of results) {
    const score = scoreResult(row, query, postal);
    if (score < 7) continue;
    if (!best || score > best.score) best = { score, row };
  }

  if (!best) return emptyHit(query);

  const siren = best.row.siren?.replace(/\D/g, '') || null;
  return {
    name: pickDirigeant(best.row.dirigeants),
    source: siren ? companyPage(siren) : searchPage(query),
    siren,
  };
}

/**
 * Résout le nom d’un dirigeant et la page source. Les appels identiques
 * sont dédupliqués. Jamais d’exception.
 */
export function lookupDirigeant(query: DirigeantQuery): Promise<DirigeantHit> {
  const key = cacheKey(query);
  const hit = cache.get(key);
  if (hit) return hit;

  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }

  const pending = fetchBest(query).catch(() => emptyHit(query));
  cache.set(key, pending);
  return pending;
}
