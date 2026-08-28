import { useEffect } from 'react';
import { Maximize2, X } from 'lucide-react';
import type { Lead } from '../../shared/types';
import { TIER_COLORS, tierLabel, type Tier } from '../lib/lead';
import { GeoMap } from './GeoMap';

const LEGEND: Tier[] = ['excellent', 'bon', 'moyen', 'faible'];

/**
 * Carte plein écran : fond OpenStreetMap de la France, points GPS exacts.
 * Un clic sur un point n’ouvre plus Maps : la carte sert à se situer.
 */
export function MapView({ leads, onClose }: { leads: Lead[]; onClose: () => void }) {
  const located = leads.filter((l) => l.lat != null && l.lng != null).length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="app-stage flex flex-col bg-paper">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">
        <span className="legend">carte de france</span>
        <span className="legend tnum">{located} positions</span>

        <div className="ml-2 hidden items-center gap-2.5 sm:flex">
          {LEGEND.map((tier) => (
            <span key={tier} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: TIER_COLORS[tier].css }} aria-hidden />
              <span className="legend">{tierLabel(tier)}</span>
            </span>
          ))}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs font-medium hover:bg-card-2"
        >
          <X className="size-3.5" /> Fermer
        </button>
      </header>

      <GeoMap leads={leads} mode="full" className="min-h-0 flex-1" />

      <footer className="border-t border-rule px-4 py-2">
        <p className="legend text-center">
          molette pour zoomer · glisser pour déplacer · les noms apparaissent en se rapprochant
        </p>
      </footer>
    </div>
  );
}

/** Aperçu compact : même carte, figée. Un clic l'ouvre en grand. */
export function MiniMap({
  leads,
  onExpand,
  className,
}: {
  leads: Lead[];
  onExpand?: () => void;
  className?: string;
}) {
  const located = leads.filter((l) => l.lat != null && l.lng != null).length;

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-md border border-rule">
        <GeoMap leads={leads} mode="mini" onExpand={onExpand} className="aspect-square w-full" />
        {onExpand && located > 0 && (
          <span className="pointer-events-none absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded border border-rule bg-card px-1.5 py-0.5">
            <Maximize2 className="size-2.5 text-lime-deep" />
            <span className="legend">agrandir</span>
          </span>
        )}
      </div>
      <p className="legend mt-2 text-center">
        {located} pos.
        {leads.length - located > 0 && ` · ${leads.length - located} hors carte`}
      </p>
    </div>
  );
}
