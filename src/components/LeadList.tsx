import { useMemo, useState, type ReactNode } from 'react';
import { Check, Star, ThumbsDown, Trash2, X } from 'lucide-react';
import type { Lead, LeadStatus } from '../../shared/types';
import type { LeadCollection } from '../hooks';
import { LeadCard } from './LeadCard';
import { Button, LeadSkeleton, cx, useToast } from './ui';

interface LeadListProps {
  collection: LeadCollection;
  /** Fiches à afficher (permet de filtrer côté client sans refetch). */
  leads?: Lead[];
  empty: ReactNode;
  restoreMode?: boolean;
  /** Désactive la sélection multiple (résultats en direct pendant un scan). */
  selectable?: boolean;
}

export function LeadList({ collection, leads, empty, restoreMode, selectable = true }: LeadListProps) {
  const notify = useToast();
  const rows = leads ?? collection.leads;
  const [selection, setSelection] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => rows.map((l) => l.id), [rows]);
  const selectedIds = useMemo(() => visibleIds.filter((id) => selection.has(id)), [visibleIds, selection]);

  const toggle = (id: number) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = selectedIds.length > 0 && selectedIds.length === visibleIds.length;

  const runBulk = async (action: LeadStatus | 'delete') => {
    const ids = selectedIds;
    if (!ids.length) return;
    const n = await collection.bulk(ids, action);
    setSelection(new Set());
    const labels: Record<LeadStatus | 'delete', string> = {
      favori: 'ajoutée(s) aux favoris',
      termine: 'marquée(s) comme signée(s)',
      perdu: 'marquée(s) comme non conclue(s)',
      nouveau: 'remise(s) en attente',
      delete: 'supprimée(s)',
    };
    notify(`${n} fiche(s) ${labels[action]}`);
  };

  if (collection.loading && !rows.length) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3].map((i) => (
          <LeadSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (collection.error) {
    return (
      <div className="card border-line-strong px-4 py-3 text-sm text-text">
        {collection.error}{' '}
        <button onClick={collection.refresh} className="font-semibold text-accent-text underline">
          Réessayer
        </button>
      </div>
    );
  }

  if (!rows.length) return <>{empty}</>;

  return (
    <div className="space-y-2.5">
      {selectable && (
        <div className="flex items-center justify-between gap-3 px-1.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-subtle transition hover:text-muted">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelection(allSelected ? new Set() : new Set(visibleIds))}
              className="size-4 cursor-pointer accent-[var(--accent)]"
            />
            Tout sélectionner ({rows.length})
          </label>
        </div>
      )}

      {rows.map((lead, index) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          index={index}
          selected={selection.has(lead.id)}
          onToggleSelect={selectable ? toggle : undefined}
          onStatus={collection.setStatus}
          onNotes={collection.setNotes}
          onDelete={collection.remove}
          restoreMode={restoreMode}
        />
      ))}

      {/* Barre d'actions groupées */}
      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4',
          'transition-all duration-300 ease-[var(--ease-out-quint)]',
          selectedIds.length ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-6 opacity-0',
        )}
      >
        {selectedIds.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/10 bg-overlay px-2.5 py-2 shadow-[var(--shadow-float)]">
            <span className="tnum px-2 text-sm font-semibold text-overlay-text">
              {selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}
            </span>
            <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden />
            <Button size="sm" variant="onDark" icon={<Star className="size-3.5" />} onClick={() => runBulk('favori')}>
              Favoris
            </Button>
            <Button size="sm" variant="onDark" icon={<Check className="size-3.5" />} onClick={() => runBulk('termine')}>
              Signé
            </Button>
            <Button
              size="sm"
              variant="onDark"
              icon={<ThumbsDown className="size-3.5" />}
              onClick={() => runBulk('perdu')}
            >
              Non conclu
            </Button>
            <Button
              size="sm"
              variant="onDark"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => runBulk('delete')}
            >
              Supprimer
            </Button>
            <button
              onClick={() => setSelection(new Set())}
              aria-label="Annuler la sélection"
              className="ml-0.5 rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
