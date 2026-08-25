import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDownWideNarrow, Check, PhoneCall, Star, ThumbsDown, Trash2, X } from 'lucide-react';
import type { Lead, LeadStatus } from '../../shared/types';
import type { LeadCollection } from '../hooks';
import { SORT_LABELS, sortLeads, type SortMode } from '../lib/lead';
import { CallMode } from './CallMode';
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
  /** Propose la session d'appels (utile là où on téléphone : les favoris). */
  callable?: boolean;
}

export function LeadList({
  collection,
  leads,
  empty,
  restoreMode,
  selectable = true,
  callable,
}: LeadListProps) {
  const notify = useToast();
  const [sort, setSort] = useState<SortMode>('potentiel');
  const [selection, setSelection] = useState<Set<number>>(new Set());
  const [calling, setCalling] = useState(false);

  const source = leads ?? collection.leads;
  const rows = useMemo(() => sortLeads(source, sort), [source, sort]);

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
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <LeadSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (collection.error) {
    return (
      <div className="sheet px-4 py-3 text-sm">
        {collection.error}{' '}
        <button onClick={collection.refresh} className="font-semibold text-lime-deep underline">
          Réessayer
        </button>
      </div>
    );
  }

  if (!rows.length) return <>{empty}</>;

  return (
    <div className="space-y-2">
      {/* Barre d'outils de la liste */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-0.5 pb-2">
        {selectable && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-faint transition hover:text-ink">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelection(allSelected ? new Set() : new Set(visibleIds))}
              className="size-4 cursor-pointer rounded accent-[var(--lime-deep)]"
            />
            Tout ({rows.length})
          </label>
        )}

        <label className="inline-flex items-center gap-1.5">
          <ArrowDownWideNarrow className="size-3.5 text-faint" aria-hidden />
          <span className="sr-only">Trier par</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="cursor-pointer rounded border border-transparent bg-transparent py-0.5 pr-1 font-mono text-[11px] tracking-wide text-muted uppercase transition hover:border-rule focus:border-rule"
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {callable && rows.length > 0 && (
          <Button
            size="sm"
            variant="soft"
            className="ml-auto"
            icon={<PhoneCall className="size-3.5" />}
            onClick={() => setCalling(true)}
          >
            Session d’appels
          </Button>
        )}
      </div>

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

      {calling && (
        <CallMode
          leads={rows}
          onStatus={collection.setStatus}
          onNotes={collection.setNotes}
          onClose={() => setCalling(false)}
        />
      )}

      {/* Actions groupées : la barre monte quand une fiche est cochée. */}
      <div
        className={cx(
          'pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4',
          'transition-all duration-300 ease-[var(--ease-out-quint)]',
          selectedIds.length ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
        )}
      >
        {selectedIds.length > 0 && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-white/10 bg-[#12170f] px-2.5 py-2 shadow-[var(--shadow-float)]">
            <span className="tnum px-2 text-sm font-semibold text-white">
              {selectedIds.length} sélectionnée{selectedIds.length > 1 ? 's' : ''}
            </span>
            <span className="mx-0.5 h-5 w-px bg-white/15" aria-hidden />
            <Button size="sm" variant="onInk" icon={<Star className="size-3.5" />} onClick={() => runBulk('favori')}>
              Favoris
            </Button>
            <Button size="sm" variant="onInk" icon={<Check className="size-3.5" />} onClick={() => runBulk('termine')}>
              Signé
            </Button>
            <Button
              size="sm"
              variant="onInk"
              icon={<ThumbsDown className="size-3.5" />}
              onClick={() => runBulk('perdu')}
            >
              Non conclu
            </Button>
            <Button size="sm" variant="onInk" icon={<Trash2 className="size-3.5" />} onClick={() => runBulk('delete')}>
              Supprimer
            </Button>
            <button
              onClick={() => setSelection(new Set())}
              aria-label="Annuler la sélection"
              className="ml-0.5 rounded-md p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
