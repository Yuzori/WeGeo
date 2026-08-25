/**
 * Orchestration d'une recherche : métiers × zones géographiques,
 * déduplication, filtrage et enregistrement en base, avec diffusion
 * des évènements en direct vers l'interface.
 */

import { EventEmitter } from 'node:events';
import type { ScrapeEvent, SearchOptions, SearchRecord, SearchRequest } from '../shared/types.ts';
import * as db from './db.ts';
import { buildGrid, geocodeCity, type Tile } from './scraper/geo.ts';
import { fetchPlaceDetailsBatch, scrapeList, type RawCard } from './scraper/maps.ts';
import {
  classifyWebsite,
  cleanMapsUrl,
  coordsFrom,
  findPhone,
  formatPhone,
  parseCardLines,
  parseRating,
  placeKeyFrom,
  stripLabel,
} from './scraper/parse.ts';

class Run {
  readonly events: ScrapeEvent[] = [];
  readonly emitter = new EventEmitter();
  cancelled = false;
  finished = false;

  constructor(readonly id: number) {
    this.emitter.setMaxListeners(0);
  }

  push(event: ScrapeEvent) {
    this.events.push(event);
    this.emitter.emit('event', event);
    if (event.type === 'done' || event.type === 'error') this.finished = true;
  }

  /** Rejoue l'historique puis suit les évènements suivants. */
  subscribe(listener: (event: ScrapeEvent) => void): () => void {
    for (const event of this.events) listener(event);
    if (this.finished) return () => {};
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}

const runs = new Map<number, Run>();

export function getRun(id: number): Run | undefined {
  return runs.get(id);
}

export function cancelRun(id: number): boolean {
  const run = runs.get(id);
  if (!run || run.finished) return false;
  run.cancelled = true;
  return true;
}

export function activeRunIds(): number[] {
  return [...runs.values()].filter((r) => !r.finished).map((r) => r.id);
}

/** Libère la mémoire des recherches terminées depuis un moment. */
function scheduleCleanup(id: number) {
  setTimeout(() => runs.delete(id), 10 * 60 * 1000).unref?.();
}

/** Lance la recherche en tâche de fond et renvoie son identifiant. */
export function startSearch(request: SearchRequest, userId: number): number {
  const city = request.city.trim();
  const domains = request.domains.map((d) => d.trim()).filter(Boolean);
  const options = request.options;

  const record = db.createSearch(userId, city, domains, options);
  launch(record);
  return record.id;
}

/**
 * Reprend une recherche arrêtée : les métiers déjà parcourus sont sautés, les
 * compteurs repartent de leur dernière valeur.
 */
export function resumeSearch(id: number, userId: number): boolean {
  const existing = db.getSearch(id, userId);
  if (!existing || existing.status === 'en_cours') return false;
  if (existing.totalTasks === null || existing.doneTasks >= existing.totalTasks) return false;

  const record = db.reopenSearch(id);
  if (!record || record.userId !== userId) return false;
  launch(record);
  return true;
}

function launch(record: SearchRecord): void {
  const run = new Run(record.id);
  runs.set(record.id, run);

  void execute(run, record).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    db.finishSearch(run.id, 'erreur', message);
    run.push({ type: 'error', message });
    scheduleCleanup(run.id);
  });
}

async function execute(run: Run, record: SearchRecord): Promise<void> {
  const { city, domains, options } = record;
  const isCancelled = () => run.cancelled;

  // 1. Zones à interroger.
  let tiles: Array<Tile | null> = [null];
  if (options.gridMode) {
    const geo = await geocodeCity(city);
    if (geo) {
      tiles = buildGrid(geo, options.gridSize);
      // On affiche la zone retenue : plusieurs communes portent le même nom.
      run.push({
        type: 'progress',
        message: `Zone analysée : ${geo.displayName} — ${tiles.length} secteur(s)`,
        scanned: 0,
        found: 0,
        taskIndex: 0,
        totalTasks: domains.length * tiles.length,
      });
    } else {
      run.push({
        type: 'progress',
        message: `Ville introuvable pour le quadrillage — recherche simple sur « ${city} »`,
        scanned: 0,
        found: 0,
        taskIndex: 0,
        totalTasks: domains.length,
      });
    }
  }

  // Chaque couple métier × secteur est une tâche indépendante, identifiée par
  // une clé stable : c'est elle qui permet de reprendre une recherche arrêtée.
  const allTasks = domains.flatMap((domain) =>
    tiles.map((tile) => ({
      domain,
      tile,
      where: tile ? `${city} — ${tile.label}` : city,
      key: `${domain}@@${tile?.label ?? '-'}`,
    })),
  );

  const totalTasks = allTasks.length;
  db.setSearchTotalTasks(run.id, totalTasks);

  const alreadyDone = new Set(db.searchDoneTasks(run.id));
  const tasks = allTasks.filter((task) => !alreadyDone.has(task.key));

  run.push({ type: 'start', searchId: run.id, totalTasks });
  if (alreadyDone.size) {
    run.push({
      type: 'progress',
      message: `Reprise : ${alreadyDone.size} métier(s) déjà parcouru(s), ${tasks.length} restant(s)`,
      scanned: record.scanned,
      found: record.found,
      taskIndex: alreadyDone.size,
      totalTasks,
    });
  }

  const handled = options.excludeHandled ? db.handledPlaceKeys(record.userId) : new Set<string>();
  const seenKeys = new Set<string>();
  // Une reprise continue les compteurs de la recherche au lieu de repartir de zéro.
  let scanned = record.scanned;
  let found = record.found;
  let done = alreadyDone.size;

  // Plusieurs métiers sont explorés de front. On garde des chiffres modestes :
  // chaque tâche ouvre elle-même plusieurs onglets pour vérifier les fiches.
  // Sur une machine peu dotée en mémoire, les deux réglages sont abaissables.
  const taskConcurrency = Math.min(tasks.length, envLimit('WEGEO_TASK_CONCURRENCY', 3));
  const detailConcurrency = envLimit('WEGEO_DETAIL_CONCURRENCY', taskConcurrency > 1 ? 3 : 6);

  const emit = (message: string) =>
    run.push({ type: 'progress', message, scanned, found, taskIndex: done, totalTasks });

  let cursor = 0;
  const failures: string[] = [];

  /** Enregistre une entreprise retenue et l'envoie aussitôt à l'écran. */
  const publish = (candidate: Candidate): void => {
    if (options.onlyWithoutWebsite && !isTarget(candidate, options)) return;
    if (options.requirePhone && !candidate.phone) return;

    const { lead, isNew } = db.upsertLead({ ...candidate, userId: record.userId });
    db.linkSearchLead(run.id, lead.id);

    // Une fiche déjà classée par l'utilisateur ne réapparaît pas.
    if (!isNew && options.excludeHandled && (lead.status === 'termine' || lead.status === 'perdu')) return;

    found++;
    run.push({ type: 'lead', lead });
  };

  const worker = async (): Promise<void> => {
    while (cursor < tasks.length && !isCancelled()) {
      const { domain, tile, where, key } = tasks[cursor++];
      emit(`« ${domain} » à ${where} : ouverture de Google Maps…`);

      let cards: RawCard[] = [];
      try {
        cards = await scrapeList(`${domain} ${city}`, tile, {
          max: options.maxPerDomain,
          isCancelled,
          // `scanned` reste le total dédupliqué déjà traité : le compteur ne
          // doit jamais reculer, le nombre en cours de chargement va au message.
          onProgress: (count) => emit(`« ${domain} » à ${where} : ${count} fiches chargées…`),
        });
      } catch (err) {
        done++;
        failures.push(err instanceof Error ? err.message : 'erreur inconnue');
        emit(`« ${domain} » à ${where} : échec (${failures[failures.length - 1]})`);
        continue;
      }

      // 2. Première lecture : on écarte tout de suite les entreprises
      //    qui affichent un bouton « Site Web » sur leur carte.
      const candidates: Candidate[] = [];

      for (const card of cards) {
        if (isCancelled()) break;
        const candidate = toCandidate(card, city, domain);
        if (seenKeys.has(candidate.placeKey)) continue;
        seenKeys.add(candidate.placeKey);
        scanned++;

        if (handled.has(candidate.placeKey)) continue;
        if (options.onlyWithoutWebsite && !isTarget(candidate, options)) continue;
        candidates.push(candidate);
      }

      db.updateSearchProgress(run.id, scanned, found);

      // 3. Vérification approfondie, fiche par fiche. Chaque entreprise retenue
      //    est envoyée à l'écran dès que sa fiche est lue : la liste se remplit
      //    au fil de l'eau au lieu d'apparaître d'un bloc à la fin du métier.
      if (options.deepCheck && candidates.length && !isCancelled()) {
        let checked = 0;
        emit(`« ${domain} » à ${where} : vérification de ${candidates.length} fiches…`);

        await fetchPlaceDetailsBatch(
          candidates,
          (c) => c.mapsUrl,
          (c, details) => {
            checked++;
            if (details) applyDetails(c, details);
            c.verified = details !== null;
            publish(c);
            emit(`« ${domain} » à ${where} : ${checked}/${candidates.length} fiches vérifiées`);
          },
          { concurrency: detailConcurrency, isCancelled },
        );
      } else {
        for (const candidate of candidates) publish(candidate);
      }

      done++;
      db.updateSearchProgress(run.id, scanned, found);
      // La tâche n'est notée comme faite qu'ici : une interruption au milieu
      // la laisse à reprendre, sans perdre les fiches déjà enregistrées.
      if (!isCancelled()) db.recordSearchTask(run.id, key);
    }
  };

  await Promise.all(Array.from({ length: taskConcurrency }, worker));

  // Une recherche qui n'a rien pu lire doit le dire clairement.
  const allFailed = tasks.length > 0 && failures.length === tasks.length;
  const search = db.finishSearch(
    run.id,
    run.cancelled ? 'annule' : allFailed ? 'erreur' : 'termine',
    allFailed ? failures[0] : failures.length ? `${failures.length} métier(s) illisible(s) : ${failures[0]}` : null,
  );
  run.push({ type: 'done', search: search! });
  scheduleCleanup(run.id);
}

/** Lit une limite de parallélisme dans l'environnement, entre 1 et 6. */
function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 1 ? Math.min(6, Math.floor(value)) : fallback;
}

interface Candidate extends Omit<db.LeadInput, 'userId'> {
  verified?: boolean;
}

function toCandidate(card: RawCard, city: string, domain: string): Candidate {
  const lines = card.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const { category, address } = parseCardLines(lines, card.name);
  const phone = findPhone(card.text);
  const { rating, reviewCount } = parseRating(card.ratingText ?? lines.join(' '));
  const { website, kind } = classifyWebsite(card.websiteUrl);
  const { lat, lng } = coordsFrom(card.mapsUrl);

  return {
    placeKey: placeKeyFrom(card.mapsUrl, card.name, address),
    name: card.name,
    category,
    address,
    phone,
    website,
    websiteKind: kind,
    rating,
    reviewCount,
    mapsUrl: cleanMapsUrl(card.mapsUrl, card.name, address),
    lat,
    lng,
    city,
    domain,
  };
}

function applyDetails(candidate: Candidate, details: { address: string | null; phone: string | null; website: string | null; category: string | null; ratingText: string | null; name: string | null }) {
  const address = stripLabel(details.address);
  if (address) candidate.address = address;

  const phone = formatPhone(stripLabel(details.phone) ?? details.phone);
  if (phone) candidate.phone = phone;

  if (details.category) candidate.category = details.category;
  if (details.name) candidate.name = details.name;

  // La fiche détaillée est la source de vérité pour le site web.
  const { website, kind } = classifyWebsite(details.website);
  candidate.website = website;
  candidate.websiteKind = kind;

  if (details.ratingText) {
    const { rating, reviewCount } = parseRating(details.ratingText);
    if (rating) candidate.rating = rating;
    if (reviewCount) candidate.reviewCount = reviewCount;
  }
}

/** L'entreprise est-elle une cible de prospection ? */
function isTarget(candidate: Candidate, options: SearchOptions): boolean {
  if (candidate.websiteKind === 'aucun') return true;
  if (candidate.websiteKind === 'social') return options.socialCountsAsNoWebsite;
  return false;
}
