import { useCallback, useEffect, useState } from 'react';
import { Clock, History, MapPin, RotateCcw, Table2, Trash2 } from 'lucide-react';
import type { Lead, SearchRecord } from '../../shared/types';
import { api } from '../api';
import { LeadCard } from '../components/LeadCard';
import { SheetModal } from '../components/SheetModal';
import { Badge, Button, EmptyState, IconButton, Spinner, useToast } from '../components/ui';
import { useLeadCollection, useMeta } from '../hooks';

const STATUS_STYLE: Record<SearchRecord['status'], { label: string; tone: 'brand' | 'outline' | 'solid' | 'neutral' }> = {
  termine: { label: 'Terminée', tone: 'brand' },
  en_cours: { label: 'En cours', tone: 'solid' },
  annule: { label: 'Arrêtée', tone: 'neutral' },
  erreur: { label: 'Erreur', tone: 'outline' },
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
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`;
}

export function HistoryPage({ onReplay }: { onReplay: (search: SearchRecord) => void }) {
  const notify = useToast();
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

  const remove = async (search: SearchRecord) => {
    setSearches((list) => list?.filter((s) => s.id !== search.id) ?? null);
    await api.deleteSearch(search.id).catch(() => {});
    refreshMeta();
    notify('Recherche retirée de l’historique');
  };

  if (!searches) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-subtle">
        <Spinner /> Chargement de l’historique…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-accent-text uppercase">Journal</p>
        <h1 className="text-[1.75rem] leading-none font-semibold tracking-tight text-text">Historique</h1>
        <p className="mt-2 text-sm text-muted">
          Toutes vos recherches passées. Rejouez-les en un clic ou consultez leurs résultats.
        </p>
      </header>

      {!searches.length ? (
        <EmptyState
          icon={<History className="size-7" />}
          title="Aucune recherche pour le moment"
          description="Chaque recherche lancée depuis WeGeo est conservée ici avec ses résultats."
        />
      ) : (
        <div className="space-y-2.5">
          {searches.map((search, index) => (
            <article
              key={search.id}
              style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              className="card animate-in overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]"
            >
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-text">
                      <MapPin className="size-4 text-accent-text" />
                      {search.city}
                    </span>
                    <Badge tone={STATUS_STYLE[search.status].tone}>{STATUS_STYLE[search.status].label}</Badge>
                    {search.options.gridMode && (
                      <Badge tone="neutral">
                        quadrillage {search.options.gridSize}×{search.options.gridSize}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-subtle">{search.domains.join(' · ')}</p>
                </div>

                <dl className="flex gap-5 text-xs">
                  <div>
                    <dt className="text-subtle">Trouvées</dt>
                    <dd className="tnum text-lg leading-tight font-semibold text-accent-text">{search.found}</dd>
                  </div>
                  <div>
                    <dt className="text-subtle">Inspectées</dt>
                    <dd className="tnum text-lg leading-tight font-semibold text-text">{search.scanned}</dd>
                  </div>
                  <div className="hidden sm:block">
                    <dt className="text-subtle">Durée</dt>
                    <dd className="pt-1 text-muted">{formatDuration(search.durationMs)}</dd>
                  </div>
                  <div className="hidden md:block">
                    <dt className="text-subtle">Date</dt>
                    <dd className="inline-flex items-center gap-1 pt-1 text-muted">
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
                    {openId === search.id ? 'Masquer' : 'Résultats'}
                  </Button>
                  <IconButton label="Voir le tableur" onClick={() => setSheetId(search.id)}>
                    <Table2 className="size-4" />
                  </IconButton>
                  <IconButton label="Relancer cette recherche" tone="brand" onClick={() => onReplay(search)}>
                    <RotateCcw className="size-4" />
                  </IconButton>
                  <IconButton label="Supprimer de l’historique" tone="armed" onClick={() => remove(search)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>
              </div>

              {search.error && (
                <p className="border-t border-line bg-surface-3 px-4 py-2 text-xs text-muted">{search.error}</p>
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
          title={`recherche n°${sheetId}`}
        />
      )}
    </div>
  );
}

/** Fiches issues d'une recherche précise, dépliées sous la ligne d'historique. */
function SearchResults({ searchId }: { searchId: number }) {
  const { refreshMeta } = useMeta();
  const collection = useLeadCollection({ searchId }, refreshMeta);

  if (collection.loading && !collection.leads.length) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-4 py-6 text-sm text-subtle">
        <Spinner /> Chargement des fiches…
      </div>
    );
  }

  if (!collection.leads.length) {
    return (
      <p className="border-t border-line px-4 py-6 text-sm text-subtle">
        Aucune fiche conservée pour cette recherche.
      </p>
    );
  }

  return (
    <div className="space-y-2 border-t border-line bg-surface-2 p-3">
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
