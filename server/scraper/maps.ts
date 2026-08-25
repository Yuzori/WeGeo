/**
 * Scraping de Google Maps avec un vrai navigateur (Playwright).
 * Aucune clé d'API n'est nécessaire : on lit la page comme un utilisateur.
 *
 * Stratégie en deux temps pour rester rapide :
 *  1. on déroule la liste de résultats et on lit chaque carte (nom, lien,
 *     présence d'un bouton « Site Web ») ;
 *  2. on n'ouvre la fiche détaillée que des entreprises retenues, pour
 *     confirmer l'absence de site et récupérer adresse + téléphone exacts.
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { resolve } from 'node:path';
import type { Tile } from './geo.ts';

const PROFILE_DIR = process.env.WEGEO_BROWSER_DIR ?? resolve(process.cwd(), 'data', 'browser');
const HEADLESS = process.env.WEGEO_HEADFUL !== '1';
const DEBUG = process.env.WEGEO_DEBUG === '1';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/**
 * En conteneur, `/dev/shm` est minuscule : sans ce drapeau Chromium plante dès
 * qu'on ouvre plusieurs onglets. Le bac à sable, lui, ne peut être désactivé
 * que volontairement (l'hébergeur exécute le processus en root).
 */
const CHROME_ARGS = [
  '--lang=fr-FR',
  '--disable-blink-features=AutomationControlled',
  '--no-first-run',
  '--disable-dev-shm-usage',
  ...(process.env.WEGEO_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
];

/** Tuiles, imagerie et télémétrie : aucun intérêt pour lire du texte. */
const USELESS = /\/maps\/vt|\/maps\/photo|gen_204|log204|\/maps\/preview\/log|googleusercontent|\/gen204/i;

let contextPromise: Promise<BrowserContext> | null = null;

/** Ouvre le navigateur à l'avance pour que la première recherche démarre vite. */
export function warmUp(): void {
  void getContext().catch(() => {});
}

async function getContext(): Promise<BrowserContext> {
  if (!contextPromise) {
    contextPromise = chromium
      .launchPersistentContext(PROFILE_DIR, {
        headless: HEADLESS,
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1440, height: 900 },
        userAgent: UA,
        args: CHROME_ARGS,
      })
      .then(async (ctx) => {
        ctx.setDefaultTimeout(30_000);
        // tsx (esbuild) conserve le nom des fonctions via un helper `__name`
        // absent du navigateur : sans ce shim, tout `page.evaluate` contenant
        // une fonction nommée échoue avec « __name is not defined ».
        await ctx.addInitScript({
          content: 'globalThis.__name = globalThis.__name || function (f) { return f; };',
        });
        // Seul le texte nous intéresse : on coupe tout le reste, en particulier
        // les tuiles cartographiques qui représentent l'essentiel du trafic.
        await ctx.route('**/*', (route) => {
          const request = route.request();
          const type = request.resourceType();
          if (type === 'image' || type === 'media' || type === 'font') return route.abort();

          const url = request.url();
          if (USELESS.test(url)) return route.abort();
          return route.continue();
        });
        return ctx;
      });
  }
  return contextPromise;
}

export async function closeBrowser(): Promise<void> {
  if (!contextPromise) return;
  const ctx = await contextPromise.catch(() => null);
  contextPromise = null;
  await ctx?.close().catch(() => {});
}

/** Accepte la bannière de cookies (une seule fois grâce au profil persistant). */
async function acceptConsent(page: Page): Promise<void> {
  const labels = [
    'Tout accepter',
    'Accepter tout',
    "J'accepte",
    'Accepter',
    'Accept all',
    'Alles accepteren',
  ];
  for (const label of labels) {
    const button = page.getByRole('button', { name: label, exact: false }).first();
    if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
      await button.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return;
    }
  }
}

export interface RawCard {
  name: string;
  mapsUrl: string;
  websiteUrl: string | null;
  ratingText: string | null;
  text: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => sleep(min + Math.random() * (max - min));

function searchUrl(query: string, tile: Tile | null): string {
  const q = encodeURIComponent(query);
  if (tile) {
    return `https://www.google.com/maps/search/${q}/@${tile.lat.toFixed(6)},${tile.lng.toFixed(6)},${tile.zoom}z?hl=fr&gl=fr`;
  }
  return `https://www.google.com/maps/search/${q}?hl=fr&gl=fr`;
}

export interface ScrapeListOptions {
  /** Arrête le déroulement de la liste au-delà de ce nombre de fiches (0 = tout). */
  max: number;
  onProgress?: (count: number) => void;
  isCancelled?: () => boolean;
}

/**
 * Déroule la liste de résultats et renvoie toutes les cartes trouvées.
 *
 * Google refuse ponctuellement de servir la liste (trafic jugé inhabituel).
 * On réessaie alors après une pause : sans cela, une recherche entière
 * pouvait se terminer sur zéro résultat sans explication.
 */
export async function scrapeList(
  query: string,
  tile: Tile | null,
  options: ScrapeListOptions,
): Promise<RawCard[]> {
  const ctx = await getContext();
  let lastReason = 'liste illisible';

  for (let attempt = 1; attempt <= 3; attempt++) {
    if (options.isCancelled?.()) return [];

    const page = await ctx.newPage();
    try {
      const result = await attemptList(page, query, tile, options);
      if (result.cards) return result.cards;
      lastReason = result.reason;
      if (DEBUG) console.warn(`[prospy] « ${query} » essai ${attempt} : ${result.reason}`);
    } catch (err) {
      lastReason = err instanceof Error ? err.message.split('\n')[0] : 'erreur inconnue';
    } finally {
      await page.close().catch(() => {});
    }

    if (attempt < 3) await jitter(2_500 * attempt, 5_000 * attempt);
  }

  throw new Error(`Google n'a pas répondu (${lastReason}). Réessayez dans quelques minutes.`);
}

/** Une tentative de lecture : `cards` absent = à réessayer. */
async function attemptList(
  page: Page,
  query: string,
  tile: Tile | null,
  { max, onProgress, isCancelled }: ScrapeListOptions,
): Promise<{ cards: RawCard[] } | { cards: null; reason: string }> {
  {
    await page.goto(searchUrl(query, tile), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await acceptConsent(page);

    const feed = page.locator('div[role="feed"]').first();
    const hasFeed = await feed.waitFor({ state: 'attached', timeout: 20_000 }).then(
      () => true,
      () => false,
    );

    if (!hasFeed) {
      // Requête très précise : Google ouvre directement une fiche unique.
      if (page.url().includes('/maps/place/')) {
        const single = await readSinglePlaceCard(page);
        return { cards: single ? [single] : [] };
      }
      if (await isBlocked(page)) return { cards: null, reason: 'blocage temporaire de Google' };
      return { cards: null, reason: 'liste de résultats absente' };
    }

    let count = await feedState(page).then((s) => s.count);
    let stagnant = 0;
    onProgress?.(count);

    for (let round = 0; round < 80; round++) {
      if (isCancelled?.()) break;
      if (max > 0 && count >= max) break;

      await page.evaluate(() => {
        const f = document.querySelector('div[role="feed"]');
        if (f) f.scrollTop = f.scrollHeight;
      });

      // On repart dès que de nouvelles fiches apparaissent, sans attendre
      // un délai fixe : c'est là que se gagne l'essentiel du temps.
      const grown = await waitForGrowth(page, count, 2200);

      if (grown.count === count) {
        if (grown.atEnd || ++stagnant >= 3) break;
      } else {
        stagnant = 0;
        count = grown.count;
        onProgress?.(count);
        if (grown.atEnd) break;
      }
    }

    const cards = await extractCards(page);
    return { cards: max > 0 ? cards.slice(0, max) : cards };
  }
}

/** Page « trafic inhabituel » ou captcha : il faut laisser Google respirer. */
async function isBlocked(page: Page): Promise<boolean> {
  if (/\/sorry\/|captcha/i.test(page.url())) return true;
  const text = await page.textContent('body').catch(() => null);
  return !!text && /trafic inhabituel|unusual traffic|pas un robot|not a robot/i.test(text);
}

/** Nombre de fiches chargées et présence du marqueur de fin de liste. */
async function feedState(page: Page): Promise<{ count: number; atEnd: boolean }> {
  return page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    return {
      count: feed ? feed.querySelectorAll('a[href*="/maps/place/"]').length : 0,
      atEnd: /fin de la liste|end of the list/i.test(feed?.textContent ?? ''),
    };
  });
}

/** Attend l'arrivée de nouvelles fiches, sans dépasser `timeout`. */
async function waitForGrowth(
  page: Page,
  previous: number,
  timeout: number,
): Promise<{ count: number; atEnd: boolean }> {
  const deadline = Date.now() + timeout;
  let state = await feedState(page);

  while (state.count === previous && !state.atEnd && Date.now() < deadline) {
    await sleep(160);
    state = await feedState(page);
  }
  return state;
}

/** Lit toutes les cartes présentes dans le DOM de la liste. */
async function extractCards(page: Page): Promise<RawCard[]> {
  return page.evaluate(() => {
    const feed = document.querySelector('div[role="feed"]');
    const root: ParentNode = feed ?? document;
    const anchors = Array.from(root.querySelectorAll('a[href*="/maps/place/"]')) as HTMLAnchorElement[];

    const seen = new Set<string>();
    const out: Array<{
      name: string;
      mapsUrl: string;
      websiteUrl: string | null;
      ratingText: string | null;
      text: string;
    }> = [];

    for (const anchor of anchors) {
      const mapsUrl = anchor.href;
      if (!mapsUrl || seen.has(mapsUrl)) continue;
      seen.add(mapsUrl);

      // Frontière de la carte : on remonte tant que l'ancêtre ne contient
      // qu'un seul résultat. Se baser sur la présence d'un lien externe
      // ferait « déborder » les fiches sans site sur leur voisine.
      let card: HTMLElement = anchor;
      while (card.parentElement && card.parentElement !== root) {
        const parent = card.parentElement;
        if (parent.querySelectorAll('a[href*="/maps/place/"]').length > 1) break;
        card = parent;
      }

      const name =
        anchor.getAttribute('aria-label')?.trim() ||
        (card.querySelector('.qBF1Pd, .fontHeadlineSmall') as HTMLElement | null)?.innerText?.trim() ||
        '';
      if (!name) continue;

      // Lien externe = l'entreprise a un site (ou une page réseau social).
      const explicit = card.querySelector(
        'a[data-value="Site Web"], a[data-value="Website"], a[aria-label*="ite Web"], a[aria-label*="ebsite"]',
      ) as HTMLAnchorElement | null;

      let websiteUrl: string | null = explicit?.href ?? null;
      if (!websiteUrl) {
        const external = (Array.from(card.querySelectorAll('a[href]')) as HTMLAnchorElement[]).find((a) => {
          const href = a.href;
          if (!/^https?:/i.test(href)) return false;
          if (/google\.[a-z.]+\/(maps|search|url)/i.test(href)) return false;
          if (href.includes('/maps/')) return false;
          return true;
        });
        websiteUrl = external?.href ?? null;
      }

      const ratingText =
        (card.querySelector('span[role="img"][aria-label*="étoile"]') as HTMLElement | null)?.getAttribute(
          'aria-label',
        ) ??
        (card.querySelector('.MW4etd')?.parentElement as HTMLElement | null)?.innerText ??
        null;

      out.push({ name, mapsUrl, websiteUrl, ratingText, text: card.innerText ?? '' });
    }

    return out;
  });
}

/** Cas où Google ouvre directement la fiche d'un unique établissement. */
async function readSinglePlaceCard(page: Page): Promise<RawCard | null> {
  const detail = await readPlaceDetails(page);
  if (!detail?.name) return null;
  return {
    name: detail.name,
    mapsUrl: page.url(),
    websiteUrl: detail.website,
    ratingText: detail.ratingText,
    text: [detail.category, detail.address, detail.phone].filter(Boolean).join('\n'),
  };
}

export interface PlaceDetails {
  name: string | null;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  ratingText: string | null;
}

/** Lit les informations fiables du panneau de détail d'une fiche. */
async function readPlaceDetails(page: Page): Promise<PlaceDetails | null> {
  return page.evaluate(() => {
    const text = (el: Element | null | undefined) => (el as HTMLElement | null)?.innerText?.trim() || null;

    const name = text(document.querySelector('h1'));

    const addressBtn = document.querySelector(
      'button[data-item-id="address"], [data-tooltip="Copier l\'adresse"], [data-tooltip="Copy address"]',
    );
    const address = addressBtn?.getAttribute('aria-label') ?? text(addressBtn);

    const phoneBtn = document.querySelector(
      'button[data-item-id^="phone:tel:"], [data-tooltip="Copier le numéro de téléphone"], [data-tooltip="Copy phone number"]',
    );
    const phoneFromId = phoneBtn?.getAttribute('data-item-id')?.replace('phone:tel:', '') ?? null;
    const phone = phoneFromId ?? phoneBtn?.getAttribute('aria-label') ?? text(phoneBtn);

    const siteLink = document.querySelector(
      'a[data-item-id="authority"], a[data-tooltip="Ouvrir le site Web"], a[data-tooltip="Open website"]',
    ) as HTMLAnchorElement | null;

    const category =
      text(document.querySelector('button[jsaction*="category"]')) ??
      text(document.querySelector('.DkEaL')) ??
      null;

    const ratingText = text(document.querySelector('.F7nice')) ?? null;

    return {
      name,
      category,
      address,
      phone,
      website: siteLink?.href ?? null,
      ratingText,
    };
  });
}

/**
 * Ouvre la fiche détaillée d'une entreprise pour obtenir les informations
 * exactes (adresse complète, téléphone, site web).
 */
/**
 * Charge une fiche dans une page existante et en extrait les informations.
 *
 * On attend l'apparition du bloc d'informations plutôt qu'un délai fixe :
 * lire trop tôt ferait passer une entreprise équipée pour une entreprise
 * sans site, ce qui fausserait toute la prospection.
 */
async function readPlaceIn(page: Page, mapsUrl: string): Promise<PlaceDetails | null> {
  try {
    const url = mapsUrl.includes('hl=') ? mapsUrl : `${mapsUrl}${mapsUrl.includes('?') ? '&' : '?'}hl=fr`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40_000 });

    await page
      .locator('button[data-item-id="address"], button[data-item-id^="phone:tel:"], a[data-item-id="authority"]')
      .first()
      .waitFor({ state: 'attached', timeout: 12_000 })
      .catch(() => {});
    await page.waitForTimeout(120);

    return await readPlaceDetails(page);
  } catch (err) {
    if (DEBUG) console.error(`[prospy] fiche illisible ${mapsUrl}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchPlaceDetails(mapsUrl: string): Promise<PlaceDetails | null> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  try {
    return await readPlaceIn(page, mapsUrl);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Enrichit plusieurs fiches en parallèle (petit pool pour rester discret et
 * ne pas saturer la machine).
 */
export async function fetchPlaceDetailsBatch<T>(
  items: T[],
  urlOf: (item: T) => string,
  onResult: (item: T, details: PlaceDetails | null) => void | Promise<void>,
  opts: { concurrency?: number; isCancelled?: () => boolean } = {},
): Promise<void> {
  const ctx = await getContext();
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 5, items.length));
  let cursor = 0;

  // Chaque ouvrier garde sa propre page et la réutilise : ouvrir un onglet
  // par fiche coûtait plus cher que la lecture elle-même.
  const worker = async () => {
    const page = await ctx.newPage();
    try {
      while (cursor < items.length) {
        if (opts.isCancelled?.()) return;
        const item = items[cursor++];
        await onResult(item, await readPlaceIn(page, urlOf(item)));
        await jitter(120, 320);
      }
    } finally {
      await page.close().catch(() => {});
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
}
