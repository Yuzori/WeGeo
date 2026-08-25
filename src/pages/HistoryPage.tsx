import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, MapPin, PlayCircle, RotateCcw, Table2, Trash2 } from 'lucide-react';
import { isResumable, type Lead, type SearchRecord } from '../../shared/types';
import { api } from '../api';
import { SESSION_KEY } from '../hooks';
import { LeadCard } from '../components/LeadCard';
import { SheetModal } from '../components/SheetModal';
import { Button, EmptyState, IconButton, Spinner, Tag, useToast } from '../components/ui';
import { useLeadCollection, useMeta } from '../hooks';

const STATUS_STYLE: Record<
  SearchRecord['status'],
  { label: string; tone: 'lime' | 'outline' | 'ink' | 'plain' | 'ember' }
> = {
  termine: { label: 'terminée', tone: 'lime' },
  en_cours: { label: 'en cours', tone: 'ink' },
  annule: { label: 'arrêtée', tone: 'plain' },
  erreur: { label: 'erreur', tone: 'ember' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')}`;
}

export function HistoryPage({ onReplay }: { onReplay: (search: SearchRecord) => void }) {
  const notify = useToast();
  const navigate = useNavigate();
  const { refreshMeta } = useMeta();
  const [searches, setSearches] = useState<SearchRecord[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [sheetId, setSheetId] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .searches()
      .then(setSearches)
      .catch(() => notify("L'historique n'a pas pu être chargé", 'error'));
  }, [notify]);

  useEffect(load, [load]);

  /**
   * Relance un relevé arrêté et bascule sur l'écran de recherche : celui-ci
   * retrouve la session par l'identifiant déposé ici.
   */
  const resume = async (search: SearchRecord) => {
    try {
      await api.resumeSearch(search.id);
      localStorage.setItem(SESSION_KEY, JSON.stringify(search.id));
      navigate('/app');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'La reprise a échoué', 'error');
    }
  };

  const remove = async (search: SearchRecord) => {
    setSearches((list) => list?.filter((s) => s.id !== search.id) ?? null);
    await api.deleteSearch(search.id).catch(() => {});
    refreshMeta();
    notify('Relevé retiré de l’historique');
  };

  if (!searches) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-faint">
        <Spinner /> Chargement du journal…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[2rem] leading-none font-semibold tracking-tight">Historique</h1>
        <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">
          Tous vos relevés passés. Rejouez-les en un clic ou consultez leurs fiches.
        </p>
      </header>

      {!searches.length ? (
        <EmptyState
          title="Aucun relevé pour le moment"
          description="Chaque recherche lancée depuis Prospy est conservée ici avec ses résultats."
        />
      ) : (
        <div className="space-y-2">
          {searches.map((search, index) => (
            <article
              key={search.id}
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              className="sheet deal-in overflow-hidden transition-all duration-200 hover:border-rule-strong hover:shadow-[var(--shadow-raised)]"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      <MapPin className="size-4 text-lime-deep" />
                      {search.city}
                    </span>
                    <Tag tone={STATUS_STYLE[search.status].tone}>{STATUS_STYLE[search.status].label}</Tag>
                    {search.options.gridMode && (
                      <Tag tone="outline">
                        quadrillage {search.options.gridSize}×{search.options.gridSize}
                      </Tag>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] tracking-wide text-faint">
                    {search.domains.join(' · ')}
                  </p>
                </div>

                <dl className="flex gap-5">
                  <div>
                    <dt className="legend">trouvées</dt>
                    <dd className="tnum text-lg leading-tight font-semibold text-lime-deep">{search.found}</dd>
                  </div>
                  <div>
                    <dt className="legend">inspectées</dt>
                    <dd className="tnum text-lg leading-tight font-semibold">{search.scanned}</dd>
                  </div>
                  <div className="hidden sm:block">
                    <dt className="legend">durée</dt>
                    <dd className="tnum pt-1 text-xs text-muted">{formatDuration(search.durationMs)}</dd>
                  </div>
                  <div className="hidden md:block">
                    <dt className="legend">date</dt>
                    <dd className="inline-flex items-center gap-1 pt-1 text-xs text-muted">
                      <Clock className="size-3" />
                      {formatDate(search.createdAt)}
                    </dd>
                  </div>
                </dl>

                <div className="flex items-center gap-0.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setOpenId(openId === search.id ? null : search.id)}
                  >
                    {openId === search.id ? 'Masquer' : 'Fiches'}
                  </Button>
                  {isResumable(search) && (
                    <IconButton
                      label={`Reprendre : ${(search.totalTasks ?? 0) - search.doneTasks} métier(s) restant(s)`}
                      tone="green"
                      motion="pop"
                      onClick={() => resume(search)}
                    >
                      <PlayCircle className="size-4" />
                    </IconButton>
                  )}
                  <IconButton label="Voir le tableur" motion="fly" onClick={() => setSheetId(search.id)}>
                    <Table2 className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Relancer ce relevé"
                    tone="lime"
                    motion="spin"
                    onClick={() => onReplay(search)}
                  >
                    <RotateCcw className="size-4" />
                  </IconButton>
                  <IconButton
                    label="Supprimer de l’historique"
                    tone="danger"
                    motion="shake"
                    onClick={() => remove(search)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>

              {search.error && (
                <p className="border-t border-rule bg-card-2 px-4 py-2 text-xs text-muted">{search.error}</p>
              )}

              {openId === search.id && <SearchResults searchId={search.id} />}
            </article>
          ))}
        </div>
      )}

      {sheetId !== null && (
        <SheetModal
          open
          onClose={() => setSheetId(null)}
          query={{ searchId: sheetId }}
          title={`relevé n°${sheetId}`}
        />
      )}
    </div>
  );
}

/** Fiches issues d'un relevé précis, dépliées sous la ligne d'historique. */
function SearchResults({ searchId }: { searchId: number }) {
  const { refreshMeta } = useMeta();
  const collection = useLeadCollection({ searchId }, refreshMeta);

  if (collection.loading && !collection.leads.length) {
    return (
      <div className="flex items-center gap-2 border-t border-rule px-4 py-6 text-sm text-faint">
        <Spinner /> Chargement des fiches…
      </div>
    );
  }

  if (!collection.leads.length) {
    return (
      <p className="border-t border-rule px-4 py-6 text-sm text-faint">Aucune fiche conservée pour ce relevé.</p>
    );
  }

  return (
    <div className="space-y-2 border-t border-rule bg-card-2 p-3">
      {collection.leads.map((lead: Lead, index: number) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          index={index}
          onStatus={collection.setStatus}
          onNotes={collection.setNotes}
          onDelete={collection.remove}
        />
      ))}
    </div>
  );
}
