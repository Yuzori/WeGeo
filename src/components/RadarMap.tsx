import { useEffect, useMemo, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import type { Lead } from '../../shared/types';
import { TIER_COLORS, potential } from '../lib/lead';
import { cx } from './ui';

/** Rayon utile du disque, en unités du viewBox (0–100). */
const R = 46;

/** Durée d'un tour complet du balayage, en millisecondes. */
const SWEEP_MS = 3600;

/** Largeur du faisceau, en fraction de tour : ~18°. */
const BEAM = 0.05;

interface Blip {
  id: number;
  name: string;
  mapsUrl: string;
  x: number;
  y: number;
  color: string;
  score: number;
  /** Position sur le tour, de 0 (nord) à 1. */
  at: number;
}

/**
 * Projette les prospects sur un disque, à leur position réelle relative.
 *
 * L'emprise est déduite des fiches trouvées et non d'une carte fixe : le radar
 * se cadre tout seul, qu'on prospecte un village ou une métropole.
 */
function project(leads: Lead[]): { blips: Blip[]; missing: number; spanKm: number } {
  const located = leads.filter((l) => l.lat != null && l.lng != null);
  const missing = leads.length - located.length;
  if (!located.length) return { blips: [], missing, spanKm: 0 };

  const lats = located.map((l) => l.lat!);
  const lngs = located.map((l) => l.lng!);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

  // Un degré de longitude se resserre vers les pôles : sans ce facteur, les
  // villes françaises apparaîtraient étirées horizontalement.
  const squeeze = Math.cos((midLat * Math.PI) / 180);
  const half =
    Math.max(
      (Math.max(...lats) - Math.min(...lats)) / 2,
      ((Math.max(...lngs) - Math.min(...lngs)) / 2) * squeeze,
      0.004,
    ) * 1.15;

  const blips = located.map((lead) => {
    const dx = ((lead.lng! - midLng) * squeeze) / half;
    const dy = (lead.lat! - midLat) / half;
    const dist = Math.hypot(dx, dy) || 1;
    const clamp = dist > 1 ? 1 / dist : 1;

    const x = 50 + dx * clamp * R;
    const y = 50 - dy * clamp * R;

    // 0 = nord, dans le sens horaire, comme la ligne du balayage.
    const at = ((Math.atan2(x - 50, 50 - y) * 180) / Math.PI + 360) % 360 / 360;
    const { score, tier } = potential(lead);

    return {
      id: lead.id,
      name: lead.name,
      mapsUrl: lead.mapsUrl,
      x,
      y,
      score,
      at,
      color: TIER_COLORS[tier].css,
    };
  });

  return { blips, missing, spanKm: half * 2 * 111 };
}

/** Distance circulaire entre deux positions 0–1. */
const ringDelta = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};

export function RadarMap({
  leads,
  scanning,
  className,
  onExpand,
}: {
  leads: Lead[];
  scanning?: boolean;
  className?: string;
  /** Ouvre la grande carte détaillée. */
  onExpand?: () => void;
}) {
  const [hovered, setHovered] = useState<Blip | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const { blips, missing, spanKm } = useMemo(() => project(leads), [leads]);

  // Le balayage tourne en permanence : chaque point grossit au passage de la ligne.
  useEffect(() => {
    const t0 = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - t0), 40);
    return () => window.clearInterval(timer);
  }, []);

  const turn = (elapsed / SWEEP_MS) % 1;
  const angle = turn * 360;

  return (
    <div className={cx('relative', className)}>
      <div className="group relative aspect-square w-full">
        {onExpand && blips.length > 0 && (
          <button
            type="button"
            onClick={onExpand}
            title="Ouvrir la grande carte"
            className="absolute inset-0 z-0 rounded-full transition-colors hover:bg-lime-soft/35"
          >
            <span className="sr-only">Ouvrir la grande carte</span>
          </button>
        )}

        {/* Trainée du faisceau, calée sur le même angle que la ligne. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, color-mix(in oklab, var(--lime) 28%, transparent) 350deg, var(--lime) 360deg)',
            mask: 'radial-gradient(circle, black 92%, transparent 92%)',
            WebkitMask: 'radial-gradient(circle, black 92%, transparent 92%)',
            opacity: scanning ? 0.55 : 0.32,
            transform: `rotate(${angle}deg)`,
          }}
        />

        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 size-full overflow-visible">
          {[R, R * 0.68, R * 0.36].map((r, i) => (
            <circle
              key={r}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth="0.3"
              strokeDasharray={i === 0 ? undefined : '1 2'}
              opacity={i === 0 ? 0.9 : 0.55}
            />
          ))}

          <g stroke="var(--rule-strong)" strokeWidth="0.3" opacity="0.6">
            <line x1={50 - R} y1="50" x2={50 + R} y2="50" strokeDasharray="1 3" />
            <line x1="50" y1={50 - R} x2="50" y2={50 + R} strokeDasharray="1 3" />
          </g>
          {['N', 'E', 'S', 'O'].map((label, i) => {
            const pos = [
              { x: 50, y: 50 - R - 2.5 },
              { x: 50 + R + 3, y: 50.9 },
              { x: 50, y: 50 + R + 4 },
              { x: 50 - R - 3.5, y: 50.9 },
            ][i];
            return (
              <text
                key={label}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                className="fill-[var(--ink-faint)] font-mono"
                fontSize="3.2"
              >
                {label}
              </text>
            );
          })}

          {/* Aiguille du balayage : c'est elle qui « touche » les points. */}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2={50 - R}
            stroke="var(--lime)"
            strokeWidth="0.55"
            strokeLinecap="round"
            opacity="0.85"
            transform={`rotate(${angle} 50 50)`}
          />

          {blips.map((blip) => {
            const hit = ringDelta(turn, blip.at) < BEAM;
            const hover = hovered?.id === blip.id;
            // Le rayon est animé en attribut SVG, pas en CSS : sinon seuls les
            // points près du centre réagiraient, à cause du viewBox.
            const radius = hover ? 3.8 : hit ? 3.4 : 1.65;

            return (
              <g
                key={blip.id}
                className="pointer-events-auto cursor-pointer"
                transform={`translate(${blip.x} ${blip.y})`}
                onMouseEnter={() => setHovered(blip)}
                onMouseLeave={() => setHovered((h) => (h?.id === blip.id ? null : h))}
                onClick={(event) => {
                  event.stopPropagation();
                  window.open(blip.mapsUrl, '_blank', 'noopener');
                }}
              >
                <title>{`${blip.name}. Potentiel ${blip.score}/100`}</title>

                {hit && (
                  <circle r={radius + 4} fill="none" stroke={blip.color} strokeWidth="0.55" opacity="0.75" />
                )}

                <circle r="4.2" fill="transparent" />
                <circle r={radius} fill={blip.color} stroke="var(--card)" strokeWidth="0.4" />
              </g>
            );
          })}

          <circle cx="50" cy="50" r="0.8" fill="var(--ink-faint)" />
        </svg>

        {hovered && (
          <div
            className="pop-in pointer-events-none absolute z-10 max-w-[80%] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded border border-rule bg-card px-2 py-1 shadow-[var(--shadow-lift)]"
            style={{ left: `${hovered.x}%`, top: `${hovered.y}%` }}
          >
            <span className="block truncate text-xs font-medium">{hovered.name}</span>
            <span className="legend" style={{ color: hovered.color }}>
              {hovered.score}/100 · fiche Google Maps
            </span>
          </div>
        )}

        {onExpand && blips.length > 0 && (
          <span className="pointer-events-none absolute right-0 bottom-0 inline-flex items-center gap-1 rounded border border-rule bg-card px-1.5 py-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <Maximize2 className="size-2.5 text-lime-deep" />
            <span className="legend">grande carte</span>
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-rule pt-2">
        <span className="legend whitespace-nowrap">
          {blips.length} pos.
          {missing > 0 && ` · ${missing} hors carte`}
        </span>
        {spanKm > 0 && <span className="legend tnum whitespace-nowrap">≈ {spanKm.toFixed(1)} km</span>}
      </div>
    </div>
  );
}
