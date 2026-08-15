import { useCallback, useEffect, useRef, useState } from 'react';
import { PhoneOff, Radar, Table2 } from 'lucide-react';
import { DEFAULT_OPTIONS, type Lead, type SearchOptions, type SearchRecord } from '../../shared/types';
import { api, openSearchStream } from '../api';
import { SearchForm } from '../components/SearchForm';
import { LeadList } from '../components/LeadList';
import { SheetModal } from '../components/SheetModal';
import { ScanPanel, type ScanProgress } from '../components/ScanPanel';
import { StatStrip } from '../components/StatStrip';
import { RecentSearches } from '../components/RecentSearches';
import { Button, EmptyState, LeadSkeleton, useToast } from '../components/ui';
import { useLeadCollection, useMeta, useStored } from '../hooks';

export function SearchPage() {
  const notify = useToast();
  const { meta, refreshMeta } = useMeta();

  const [city, setCity] = useStored('wegeo.city', '');
  const [domains, setDomains] = useStored<string[]>('wegeo.domains', []);
  const [options, setOptions] = useStored<SearchOptions>('wegeo.options', DEFAULT_OPTIONS);

  const [searchId, setSearchId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
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

          case 'lead':
            collection.setLeads((list) => [...list, event.lead]);
            break;

          case 'done':
            setRunning(false);
            closeStream.current?.();
            closeStream.current = null;
            setProgress(null);
            refreshMeta();
            notify(
              event.search.status === 'annule'
                ? `Recherche arrêtée — ${event.search.found} entreprise(s) trouvée(s)`
                : `Recherche terminée — ${event.search.found} entreprise(s) sans site sur ${event.search.scanned} inspectée(s)`,
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
    collection.setLeads([]);
    setLog([]);
    setProgress({ message: 'Démarrage du navigateur…', scanned: 0, found: 0, ratio: 0 });

    try {
      const { searchId: id } = await api.startSearch(city.trim(), domains, options);
      attach(id);
    } catch (err) {
      setRunning(false);
      setProgress(null);
      notify(err instanceof Error ? err.message : 'La recherche a échoué', 'error');
    }
  }, [city, domains, options, collection, notify, attach]);

  // Après un rechargement de page, on récupère la recherche encore en cours.
  const reattached = useRef(false);
  useEffect(() => {
    const active = meta?.activeSearches?.[0];
    if (active == null || reattached.current || running) return;
    reattached.current = true;
    setProgress({ message: 'Reprise de la recherche en cours…', scanned: 0, found: 0, ratio: 0 });
    attach(active);
  }, [meta?.activeSearches, running, attach]);

  const cancel = useCallback(async () => {
    if (searchId) await api.cancelSearch(searchId).catch(() => {});
    notify('Arrêt en cours…', 'info');
  }, [searchId, notify]);

  const results = collection.leads;
  const withoutPhone = results.filter((l: Lead) => !l.phone).length;
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-accent-text uppercase">Prospection</p>
          <h1 className="text-[1.75rem] leading-none font-semibold tracking-tight text-text">Nouvelle recherche</h1>
          <p className="mt-2 text-sm text-muted">
            Les entreprises sans site web de votre secteur, avec leur téléphone, prêtes à être appelées.
          </p>
        </div>
        {results.length > 0 && (
          <Button
            variant="secondary"
            icon={<Table2 className="size-4" />}
            onClick={() => setSheetOpen(true)}
            disabled={!searchId}
          >
            Voir le tableur
          </Button>
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

      {progress && <ScanPanel progress={progress} log={log} />}

      {/* Au repos, l'écran sert de tableau de bord plutôt que de page vide. */}
      {idle && hasData && (
        <>
          <StatStrip stats={meta!.stats} />
          <RecentSearches onReplay={replay} />
        </>
      )}

      {results.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1.5">
          <h2 className="text-sm font-semibold text-text">
            <span className="tnum">{results.length}</span> entreprise{results.length > 1 ? 's' : ''} sans site web
          </h2>
          {withoutPhone > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-subtle">
              <PhoneOff className="size-3.5" />
              {withoutPhone} sans numéro de téléphone
            </span>
          )}
        </div>
      )}

      <LeadList
        collection={collection}
        empty={
          running ? (
            <div className="space-y-2.5">
              {[0, 1, 2].map((i) => (
                <LeadSkeleton key={i} />
              ))}
            </div>
          ) : hasData ? null : (
            <EmptyState
              icon={<Radar className="size-7" />}
              title="Lancez votre première recherche"
              description="Choisissez une ville, ajoutez un ou plusieurs métiers, puis laissez WeGeo parcourir Google Maps. Les entreprises sans site web apparaîtront ici, avec leur adresse et leur téléphone."
            />
          )
        }
      />

      {searchId && (
        <SheetModal
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          query={{ searchId }}
          title={`recherche ${city}`}
        />
      )}
    </div>
  );
}
