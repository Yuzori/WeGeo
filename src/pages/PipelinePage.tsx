import { useMemo, useState, type ReactNode } from 'react';
import { RefreshCw, Search, Table2 } from 'lucide-react';
import type { LeadStatus } from '../../shared/types';
import { LeadList } from '../components/LeadList';
import { SheetModal } from '../components/SheetModal';
import { Button, EmptyState } from '../components/ui';
import { useLeadCollection, useMeta } from '../hooks';

interface PipelinePageProps {
  status: LeadStatus;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
  /** Les fiches classées ne proposent que « remettre dans les favoris ». */
  restoreMode?: boolean;
}

export function PipelinePage({
  status,
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon,
  restoreMode,
}: PipelinePageProps) {
  const { refreshMeta } = useMeta();
  const [term, setTerm] = useState('');
  const [city, setCity] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);

  const collection = useLeadCollection({ status }, refreshMeta);
  const cities = useMemo(
    () => [...new Set(collection.leads.map((l) => l.city))].sort((a, b) => a.localeCompare(b, 'fr')),
    [collection.leads],
  );

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return collection.leads.filter((lead) => {
      if (city && lead.city !== city) return false;
      if (!needle) return true;
      return [lead.name, lead.address, lead.phone, lead.category, lead.domain, lead.notes]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [collection.leads, term, city]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-[0.08em] text-accent-text uppercase">Suivi</p>
          <h1 className="flex items-center gap-2.5 text-[1.75rem] leading-none font-semibold tracking-tight text-text">
            {title}
            {collection.leads.length > 0 && (
              <span className="tnum rounded-lg bg-surface-3 px-2 py-1 text-sm font-semibold text-muted">
                {collection.leads.length}
              </span>
            )}
          </h1>
          <p className="mt-2 text-sm text-muted">{description}</p>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={collection.refresh}>
            Actualiser
          </Button>
          <Button
            variant="secondary"
            icon={<Table2 className="size-4" />}
            onClick={() => setSheetOpen(true)}
            disabled={!collection.leads.length}
          >
            Voir le tableur
          </Button>
        </div>
      </header>

      {collection.leads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Filtrer par nom, rue, téléphone, note…"
              className="input h-11 pl-10"
            />
          </div>
          {cities.length > 1 && (
            <select value={city} onChange={(e) => setCity(e.target.value)} className="input h-11 w-auto">
              <option value="">Toutes les villes</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <LeadList
        collection={collection}
        leads={filtered}
        restoreMode={restoreMode}
        empty={
          collection.leads.length ? (
            <p className="py-12 text-center text-sm text-subtle">Aucune fiche ne correspond à ce filtre.</p>
          ) : (
            <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
          )
        }
      />

      <SheetModal open={sheetOpen} onClose={() => setSheetOpen(false)} query={{ status }} title={title.toLowerCase()} />
    </div>
  );
}
