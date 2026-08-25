import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Map, PhoneOff, PlayCircle, Table2, X } from 'lucide-react';
import {
  DEFAULT_OPTIONS,
  isResumable,
  type Lead,
  type SearchOptions,
  type SearchRecord,
} from '../../shared/types';
import { api, openSearchStream } from '../api';
import { SearchForm } from '../components/SearchForm';
import { LeadList } from '../components/LeadList';
import { SheetModal } from '../components/SheetModal';
import { ScanPanel, type ScanProgress } from '../components/ScanPanel';
import { MiniMap, MapView } from '../components/MapView';
import { StatStrip } from '../components/StatStrip';
import { RecentSearches } from '../components/RecentSearches';
import { Button, EmptyState, IconButton, LeadSkeleton, useToast } from '../components/ui';
import { potential } from '../lib/lead';
import { SESSION_KEY, useLeadCollection, useMeta, useStored } from '../hooks';

export function SearchPage() {
  const notify = useToast();
  const { meta, refreshMeta } = useMeta();

  const [city, setCity] = useStored('wegeo.city', '');
  const [domains, setDomains] = useStored<string[]>('wegeo.domains', []);
  const [options, setOptions] = useStored<SearchOptions>('wegeo.options', DEFAULT_OPTIONS);

  // Identifiant du dernier relevé lancé : c'est lui qui permet de retrouver la
  // session après un changement d'onglet ou une fermeture du navigateur.
  const [sessionId, setSessionId] = useStored<number | null>(SESSION_KEY, null);
  const [searchId, setSearchId] = useState<number | null>(null);
  const [interrupted, setInterrupted] = useState<SearchRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [log, setLog] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const closeStream = useRef<(() => void) | null>(null);

  // Les résultats en direct sont alimentés par le flux, pas par une requête.
  const collection = useLeadCollection(null, refreshMeta);

  useEffect(() => () => closeStream.current?.(), []);

  /** Branche l'interface sur le flux d'une recherche en cours côté serveur. */
  const attach = useCallback(
    (id: number) => {
      setSearchId(id);
      setRunning(true);
      closeStream.current = openSearchStream(id, (event) => {
        switch (event.type) {
          case 'progress':
            setProgress({
              message: event.message,
              scanned: event.scanned,
              found: event.found,
              ratio: event.totalTasks ? event.taskIndex / event.totalTasks : 0,
            });
            setLog((lines) => (lines[lines.length - 1] === event.message ? lines : [...lines, event.message]));
            break;

          // Chaque fiche arrive dès qu'elle est vérifiée : la liste se remplit
          // sous les yeux au lieu d'attendre la fin du balayage.
          case 'lead':
            collection.setLeads((list) => [...list, event.lead]);
            break;

          case 'done':
            setRunning(false);
            closeStream.current?.();
            closeStream.current = null;
            setProgress(null);
            refreshMeta();
            // Un relevé arrêté en route reste proposé à la reprise.
            if (isResumable(event.search)) setInterrupted(event.search);
            notify(
              event.search.status === 'annule'
                ? `Relevé arrêté — ${event.search.found} entreprise(s) trouvée(s)`
                : `Relevé terminé — ${event.search.found} entreprise(s) sans site sur ${event.search.scanned} inspectée(s)`,
              'success',
            );
            break;

          case 'error':
            setRunning(false);
            setProgress(null);
            notify(event.message, 'error');
            break;
        }
      });
    },
    [collection, notify, refreshMeta],
  );

  const start = useCallback(async () => {
    // Un relevé déjà en cours est arrêté (et donc reprisable) avant d'en lancer
    // un nouveau : on ne perd jamais le travail déjà fait.
    if (running && searchId) {
      await api.cancelSearch(searchId).catch(() => {});
      closeStream.current?.();
      closeStream.current = null;
    }

    collection.setLeads([]);
    setLog([]);
    setInterrupted(null);
    setStartedAt(Date.now());
    setProgress({ message: 'Démarrage du navigateur…', scanned: 0, found: 0, ratio: 0 });

    try {
      const { searchId: id } = await api.startSearch(city.trim(), domains, options);
      setSessionId(id);
      attach(id);
    } catch (err) {
      setRunning(false);
      setProgress(null);
      notify(err instanceof Error ? err.message : 'La recherche a échoué', 'error');
    }
  }, [city, domains, options, collection, notify, attach, setSessionId, running, searchId]);

  /**
   * Reprise de la session : au retour sur la page — changement d'onglet,
   * navigation interne ou fermeture du navigateur — on récupère le dernier
   * relevé, ses fiches déjà trouvées, et on se rebranche s'il tourne encore.
   */
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;

    const id = sessionId ?? meta?.activeSearches?.[0];
    if (id == null) return;
    restored.current = true;

    void (async () => {
      try {
        const [record, saved] = await Promise.all([api.search(id), api.searchLeads(id)]);
        setSearchId(id);
        setSessionId(id);
        collection.setLeads(saved);

        if (record.status === 'en_cours') {
          setStartedAt(Date.now());
          setProgress({
            message: 'Reprise du relevé en cours…',
            scanned: record.scanned,
            found: record.found,
            ratio: record.totalTasks ? record.doneTasks / record.totalTasks : 0,
          });
          attach(id);
        } else if (isResumable(record)) {
          setInterrupted(record);
        }
      } catch {
        // Le relevé a été supprimé entre-temps : on repart de zéro.
        setSessionId(null);
      }
    })();
  }, [sessionId, meta?.activeSearches, attach, collection, setSessionId]);

  /** Repart du relevé interrompu, sans refaire les métiers déjà parcourus. */
  const resume = useCallback(async () => {
    if (!interrupted) return;
    setStartedAt(Date.now());
    setProgress({
      message: 'Reprise du relevé…',
      scanned: interrupted.scanned,
      found: interrupted.found,
      ratio: interrupted.totalTasks ? interrupted.doneTasks / interrupted.totalTasks : 0,
    });

    try {
      await api.resumeSearch(interrupted.id);
      setSessionId(interrupted.id);
      setInterrupted(null);
      attach(interrupted.id);
    } catch (err) {
      setProgress(null);
      notify(err instanceof Error ? err.message : 'La reprise a échoué', 'error');
    }
  }, [interrupted, attach, notify]);

  const cancel = useCallback(async () => {
    if (searchId) await api.cancelSearch(searchId).catch(() => {});
    notify('Arrêt en cours…', 'info');
  }, [searchId, notify]);

  const results = collection.leads;
  const withoutPhone = results.filter((l: Lead) => !l.phone).length;
  const hot = useMemo(() => results.filter((l) => potential(l).tier === 'excellent').length, [results]);
  const idle = !running && !results.length;
  const hasData = !!meta?.stats && meta.stats.total > 0;

  /** Recharger une recherche passée depuis le tableau de bord. */
  const replay = useCallback(
    (search: SearchRecord) => {
      setCity(search.city);
      setDomains(search.domains);
      setOptions({ ...DEFAULT_OPTIONS, ...search.options });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [setCity, setDomains, setOptions],
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[2rem] leading-none font-extrabold tracking-tight">
            Les commerces <span className="marker">sans site web</span>
          </h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">
            Prospy parcourt Google Maps métier par métier, ouvre chaque fiche, et ne garde que les entreprises
            joignables qui n’ont rien en ligne.
          </p>
        </div>
        {results.length > 0 && (
          <div className="flex gap-2">
            <Button icon={<Map className="size-4" />} onClick={() => setMapOpen(true)}>
              Carte
            </Button>
            <Button icon={<Table2 className="size-4" />} onClick={() => setSheetOpen(true)} disabled={!searchId}>
              Tableur
            </Button>
          </div>
        )}
      </header>

      <SearchForm
        city={city}
        onCity={setCity}
        domains={domains}
        onDomains={setDomains}
        options={options}
        onOptions={setOptions}
        running={running}
        onStart={start}
        onCancel={cancel}
        knownCities={meta?.cities ?? []}
      />

      {/* Relevé laissé en route : on propose de le finir. */}
      {interrupted && !running && (
        <section className="sheet-raised rise-in flex flex-wrap items-center gap-x-4 gap-y-2 border-l-[3px] border-l-lime p-3.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-lime-line bg-lime-soft text-lime-deep">
            <PlayCircle className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Relevé interrompu à {interrupted.city} — il reste{' '}
              <span className="tnum">{(interrupted.totalTasks ?? 0) - interrupted.doneTasks}</span> métier(s) à
              parcourir
            </p>
            <p className="legend mt-1">
              {interrupted.doneTasks}/{interrupted.totalTasks} déjà faits · {interrupted.found} fiches retenues ·{' '}
              {interrupted.domains.join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="primary" icon={<PlayCircle className="size-4" />} onClick={resume}>
              Reprendre
            </Button>
            <IconButton
              label="Ne plus proposer"
              tone="danger"
              motion="tilt"
              onClick={() => {
                setInterrupted(null);
                setSessionId(null);
              }}
            >
              <X className="size-4" />
            </IconButton>
          </div>
        </section>
      )}

      {progress && (
        <ScanPanel
          progress={progress}
          log={log}
          leads={results}
          startedAt={startedAt}
          onStop={running ? cancel : undefined}
          onExpandMap={() => setMapOpen(true)}
        />
      )}

      {/* Au repos, l'écran sert de tableau de bord plutôt que de page vide. */}
      {idle && hasData && (
        <>
          <StatStrip stats={meta!.stats} />
          <RecentSearches onReplay={replay} />
        </>
      )}

      {/* Bilan du relevé terminé, avec la carte des positions trouvées. */}
      {!running && results.length > 0 && (
        <section className="sheet-raised rise-in grid gap-5 p-4 sm:grid-cols-[minmax(0,180px)_1fr]">
          <MiniMap leads={results} onExpand={() => setMapOpen(true)} className="mx-auto w-full max-w-[220px]" />
          <div className="flex flex-col justify-center gap-2">
            <p className="text-lg font-semibold">
              <span className="tnum">{results.length}</span> entreprise{results.length > 1 ? 's' : ''} à contacter
            </p>
            <ul className="space-y-1 text-sm text-muted">
              <li className="flex items-center gap-2">
                <Flame className="size-3.5 text-score-high" />
                <span className="tnum font-semibold text-ink">{hot}</span> à fort potentiel (beaucoup d’avis, aucun
                site)
              </li>
              <li className="flex items-center gap-2">
                <PhoneOff className="size-3.5 text-faint" />
                <span className="tnum font-semibold text-ink">{withoutPhone}</span> sans numéro sur la fiche
              </li>
            </ul>
            <p className="legend mt-1">triez avec l’étoile, puis appelez depuis les favoris</p>
          </div>
        </section>
      )}

      {results.length > 0 && running && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <h2 className="legend">
            <span className="tnum text-lime-deep">{results.length}</span> trouvée{results.length > 1 ? 's' : ''} pour
            l’instant
          </h2>
          {withoutPhone > 0 && (
            <span className="legend inline-flex items-center gap-1.5">
              <PhoneOff className="size-3" />
              {withoutPhone} sans numéro
            </span>
          )}
        </div>
      )}

      <div data-guide="results">
        <LeadList
          collection={collection}
          empty={
            running ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <LeadSkeleton key={i} />
                ))}
              </div>
            ) : hasData ? null : (
              <EmptyState
                title="Aucun relevé pour l’instant"
                description="Choisissez une ville, ajoutez un ou plusieurs métiers, puis laissez Prospy parcourir Google Maps. Les entreprises sans site web apparaîtront ici, avec leur adresse et leur téléphone."
              />
            )
          }
        />
      </div>

      {searchId && (
        <SheetModal
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          query={{ searchId }}
          title={`relevé ${city}`}
        />
      )}

      {mapOpen && <MapView leads={results} onClose={() => setMapOpen(false)} />}
    </div>
  );
}
