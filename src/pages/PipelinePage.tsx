import { useMemo, useState, type ReactNode } from 'react';
import { Map, RefreshCw, Search, Table2 } from 'lucide-react';
import type { LeadStatus } from '../../shared/types';
import { LeadList } from '../components/LeadList';
import { MapView } from '../components/MapView';
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

const EYEBROW: Record<LeadStatus, string> = {
  nouveau: 'file d’attente',
  favori: 'liste d’appels',
  termine: 'affaires conclues',
  perdu: 'écartées',
};

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
  const [mapOpen, setMapOpen] = useState(false);

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
      return [lead.name, lead.dirigeant, lead.address, lead.phone, lead.category, lead.domain, lead.notes]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle));
    });
  }, [collection.leads, term, city]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="legend mb-2">{EYEBROW[status]}</p>
          <h1 className="flex flex-wrap items-center gap-2.5 text-[1.55rem] leading-none font-semibold tracking-tight sm:text-[2rem]">
            <span className="text-lime-deep">{icon}</span>
            {title}
            {collection.leads.length > 0 && (
              <span className="tnum rounded border border-rule bg-card-2 px-1.5 py-0.5 text-sm font-semibold text-muted">
                {collection.leads.length}
              </span>
            )}
          </h1>
          <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-muted">{description}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" icon={<RefreshCw className="size-4" />} onClick={collection.refresh}>
            Actualiser
          </Button>
          <Button icon={<Map className="size-4" />} onClick={() => setMapOpen(true)} disabled={!filtered.length}>
            Carte
          </Button>
          <Button
            icon={<Table2 className="size-4" />}
            onClick={() => {
              setMapOpen(false);
              setSheetOpen(true);
            }}
            disabled={!collection.leads.length}
          >
            Tableur
          </Button>
        </div>
      </header>

      {collection.leads.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Filtrer par nom, rue, téléphone, note…"
              className="field h-11 pl-9"
            />
          </div>
          {cities.length > 1 && (
            <select value={city} onChange={(e) => setCity(e.target.value)} className="field h-11 w-auto">
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
        callable={status === 'favori' || status === 'nouveau'}
        empty={
          collection.leads.length ? (
            <p className="py-12 text-center text-sm text-faint">Aucune fiche ne correspond à ce filtre.</p>
          ) : (
            <EmptyState title={emptyTitle} description={emptyDescription} />
          )
        }
      />

      <SheetModal open={sheetOpen} onClose={() => setSheetOpen(false)} query={{ status }} title={title.toLowerCase()} />

      {mapOpen && !sheetOpen && <MapView leads={filtered} onClose={() => setMapOpen(false)} />}
    </div>
  );
}
