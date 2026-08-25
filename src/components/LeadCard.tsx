import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  MapPin,
  Phone,
  PhoneOff,
  RotateCcw,
  Star,
  StickyNote,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import type { Lead, LeadStatus } from '../../shared/types';
import { TIER_COLORS, formatCoords, hueOf, initials, potential, tierLabel } from '../lib/lead';
import { IconButton, Tag, cx, useToast } from './ui';

const mapsSearch = (query: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const SOCIAL_LABEL: Record<string, string> = {
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'planity.com': 'Planity',
  'doctolib.fr': 'Doctolib',
  'pagesjaunes.fr': 'Pages Jaunes',
  'shortcutssoftware.com': 'Shortcuts',
  'ubereats.com': 'Uber Eats',
  'tripadvisor.fr': 'Tripadvisor',
};

function linkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const known = Object.keys(SOCIAL_LABEL).find((k) => host.endsWith(k));
    return known ? SOCIAL_LABEL[known] : host;
  } catch {
    return 'Lien';
  }
}

/** Deux libellés désignent-ils la même chose ? (« Fleuriste » / « fleuriste ») */
function sameLabel(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const norm = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const [x, y] = [norm(a), norm(b)];
  return x === y || x.includes(y) || y.includes(x);
}

/** Repère de carte : les initiales dans une pastille teintée par le nom. */
function Marker({ name, dimmed }: { name: string; dimmed?: boolean }) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cx(
        'relative flex size-10 shrink-0 items-center justify-center rounded-[10px] border',
        'font-mono text-[13px] font-semibold',
        dimmed && 'opacity-50 grayscale',
      )}
      style={{
        background: `linear-gradient(150deg, oklch(0.88 0.09 ${hue}), oklch(0.79 0.11 ${hue + 24}))`,
        borderColor: `oklch(0.66 0.11 ${hue})`,
        color: `oklch(0.28 0.07 ${hue})`,
      }}
    >
      {initials(name) || '?'}
      <span
        className="absolute -bottom-1 left-1/2 size-1.5 -translate-x-1/2 rotate-45 border-r border-b"
        style={{
          background: `oklch(0.79 0.11 ${hue + 24})`,
          borderColor: `oklch(0.66 0.11 ${hue})`,
        }}
      />
    </span>
  );
}

/**
 * Jauge de potentiel : des barres pour le palier, la note chiffrée pour
 * comparer deux fiches d'un coup d'œil (le libellé seul sature vite).
 */
function PotentialGauge({ lead }: { lead: Lead }) {
  const { score, tier, reasons } = potential(lead);
  const filled = { excellent: 4, bon: 3, moyen: 2, faible: 1 }[tier];
  const color = TIER_COLORS[tier];

  return (
    <span
      title={`Potentiel ${score}/100 — ${tierLabel(tier)} · ${reasons.join(' · ')}`}
      className="inline-flex shrink-0 items-center gap-1.5 rounded border border-rule bg-card-2 px-1.5 py-1"
    >
      <span className="flex items-end gap-[2px]" aria-hidden>
        {[3, 5.5, 8, 10.5].map((h, i) => (
          <span
            key={h}
            className={cx('w-[3px] rounded-full transition-all duration-300', i < filled ? color.bg : 'bg-rule-strong')}
            style={{ height: h }}
          />
        ))}
      </span>
      <span className={cx('tnum text-[11px] leading-none font-semibold', color.text)}>{score}</span>
    </span>
  );
}

export interface LeadCardProps {
  lead: Lead;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  onStatus: (lead: Lead, status: LeadStatus) => void;
  onDelete: (lead: Lead) => void;
  onNotes: (lead: Lead, notes: string) => void;
  /** Affiche l'action « remettre dans les favoris » plutôt que le tri complet. */
  restoreMode?: boolean;
  /** Décalage d'animation, pour une apparition en cascade. */
  index?: number;
}

export function LeadCard({
  lead,
  selected,
  onToggleSelect,
  onStatus,
  onDelete,
  onNotes,
  restoreMode,
  index = 0,
}: LeadCardProps) {
  const notify = useToast();
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState(lead.notes ?? '');
  const [armed, setArmed] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setDraft(lead.notes ?? ''), [lead.notes]);
  useEffect(() => {
    if (notesOpen) textarea.current?.focus();
  }, [notesOpen]);

  // La suppression est définitive : on demande une confirmation par un second clic.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(timer);
  }, [armed]);

  const copy = async (value: string, what: string) => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${what} copié`, 'info');
    } catch {
      notify('Copie impossible', 'error');
    }
  };

  const saveNotes = () => {
    if (draft !== (lead.notes ?? '')) onNotes(lead, draft);
    setNotesOpen(false);
  };

  const coords = formatCoords(lead.lat, lead.lng);

  // Les mêmes actions sont à droite sur grand écran, sous la fiche sur
  // téléphone, où la colonne de texte a besoin de toute la largeur.
  const actions = (
    <>
      <a
        href={lead.mapsUrl}
        target="_blank"
        rel="noreferrer"
        title="Ouvrir la fiche Google Maps"
        aria-label="Ouvrir la fiche Google Maps"
        className={cx(
          'inline-flex size-8 items-center justify-center rounded-md border border-transparent text-faint',
          'transition-colors duration-150 hover:bg-lime-soft hover:text-lime-deep',
        )}
      >
        <ExternalLink className="size-4" />
      </a>

      <IconButton
        label={notesOpen ? 'Enregistrer la note' : 'Ajouter une note'}
        tone="gold"
        motion="tilt"
        active={notesOpen || !!lead.notes}
        onClick={() => (notesOpen ? saveNotes() : setNotesOpen(true))}
      >
        <StickyNote className="size-4" />
      </IconButton>

      {restoreMode ? (
        <IconButton
          label="Remettre dans les favoris"
          tone="lime"
          motion="spin"
          onClick={() => onStatus(lead, 'favori')}
        >
          <RotateCcw className="size-4" />
        </IconButton>
      ) : (
        <>
          <IconButton
            label={lead.status === 'favori' ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            tone="gold"
            motion="spin"
            active={lead.status === 'favori'}
            onClick={() => onStatus(lead, lead.status === 'favori' ? 'nouveau' : 'favori')}
          >
            <Star className={cx('size-4', lead.status === 'favori' && 'fill-current')} />
          </IconButton>

          <IconButton
            label="Marquer comme signé"
            tone="green"
            motion="pop"
            active={lead.status === 'termine'}
            onClick={() => onStatus(lead, 'termine')}
          >
            <Check className="size-4" />
          </IconButton>

          <IconButton
            label="Non conclu (ne plus proposer)"
            tone="danger"
            motion="tilt"
            active={lead.status === 'perdu'}
            onClick={() => onStatus(lead, 'perdu')}
          >
            <ThumbsDown className="size-4" />
          </IconButton>
        </>
      )}

      <IconButton
        label={armed ? 'Cliquez à nouveau pour supprimer' : 'Supprimer définitivement'}
        tone="danger"
        motion="shake"
        active={armed}
        className={armed ? 'animate-pulse' : undefined}
        onClick={() => (armed ? onDelete(lead) : setArmed(true))}
      >
        <Trash2 className="size-4" />
      </IconButton>
    </>
  );

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 14) * 32}ms` }}
      className={cx(
        'sheet deal-in group relative px-3.5 py-3.5 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-[var(--shadow-lift)]',
        selected && 'border-lime-deep ring-1 ring-lime-deep',
        lead.status === 'perdu' && 'opacity-65 hover:opacity-100',
      )}
    >
      {/* Filet de rive : il s'allume au survol, comme un onglet de classeur. */}
      <span
        aria-hidden
        className={cx(
          'absolute inset-y-2 left-0 w-[3px] rounded-r transition-all duration-300',
          lead.status === 'termine' ? 'bg-lime' : 'bg-transparent group-hover:bg-lime-line',
        )}
      />

      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(lead.id)}
            aria-label={`Sélectionner ${lead.name}`}
            className="mt-3 size-4 shrink-0 cursor-pointer rounded accent-[var(--lime-deep)]"
          />
        )}

        <Marker name={lead.name} dimmed={lead.status === 'perdu'} />

        <div className="min-w-0 flex-1">
          {/* Nom + étiquettes */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] leading-tight font-semibold">{lead.name}</h3>

            {lead.websiteKind === 'aucun' ? (
              <Tag tone="lime">
                <Globe className="size-3" /> aucun site
              </Tag>
            ) : (
              <Tag tone="outline">
                <Globe className="size-3" /> {linkLabel(lead.website ?? '')} seul
              </Tag>
            )}

            {/* Tampon encreur, légèrement de travers. */}
            {lead.status === 'termine' && (
              <span className="stamp inline-flex items-center gap-1 rounded border-2 border-lime-deep px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.18em] text-lime-deep uppercase">
                <Check className="size-3" /> signé
              </span>
            )}
            {lead.status === 'perdu' && (
              <span className="inline-flex -rotate-3 items-center gap-1 rounded border-2 border-dashed border-rule-strong px-1.5 py-px font-mono text-[10px] font-bold tracking-[0.18em] text-faint uppercase">
                non conclu
              </span>
            )}
            {lead.seenCount > 1 && <Tag>vu {lead.seenCount}×</Tag>}
          </div>

          {/* Métadonnées */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
            {lead.category && <span className="font-medium text-muted">{lead.category}</span>}
            {lead.rating != null && (
              <span className="tnum inline-flex items-center gap-0.5 text-muted">
                <Star className="size-3 fill-current text-ember" />
                {lead.rating.toFixed(1).replace('.', ',')}
                {lead.reviewCount != null && <span className="ml-0.5 text-faint">({lead.reviewCount})</span>}
              </span>
            )}
            {/* Le métier recherché n'est utile que s'il diffère de l'activité affichée. */}
            {!sameLabel(lead.category, lead.domain) && <span>recherché : {lead.domain}</span>}
          </div>

          {/* Contact : téléphone et adresse cliquables */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {lead.phone ? (
              <span className="inline-flex items-center overflow-hidden rounded-md border border-lime-line bg-lime-soft">
                <a
                  href={`tel:${lead.phone.replace(/\s/g, '')}`}
                  className="tnum inline-flex items-center gap-1.5 py-1 pr-2 pl-2.5 text-sm font-semibold text-lime-deep transition hover:brightness-110"
                >
                  <Phone className="size-3.5" />
                  {lead.phone}
                </a>
                <button
                  type="button"
                  onClick={() => copy(lead.phone!, 'Numéro')}
                  title="Copier le numéro"
                  aria-label="Copier le numéro"
                  className="h-full self-stretch px-1.5 text-lime-deep/60 transition-colors hover:bg-lime-line hover:text-lime-deep"
                >
                  <Copy className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-rule-strong px-2.5 py-1 text-sm text-faint">
                <PhoneOff className="size-3.5" /> pas de numéro
              </span>
            )}

            {lead.address && (
              <a
                href={mapsSearch(`${lead.name} ${lead.address}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-transparent px-1.5 py-1 text-sm text-muted transition hover:border-rule hover:bg-card-2 hover:text-ink"
              >
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{lead.address}</span>
              </a>
            )}
          </div>

          {/* Relevé de position, comme en bas d'une carte. */}
          {coords && (
            <p className="mt-2 font-mono text-[10px] tracking-wide text-faint opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {coords}
            </p>
          )}

          {lead.notes && !notesOpen && (
            <p className="mt-2.5 rounded-md border border-rule border-l-2 border-l-lime bg-card-2 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted">
              {lead.notes}
            </p>
          )}

          {notesOpen && (
            <textarea
              ref={textarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(lead.notes ?? '');
                  setNotesOpen(false);
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNotes();
              }}
              rows={2}
              placeholder="Compte-rendu d'appel, objection, date de rappel…"
              className="field mt-2.5 resize-y text-xs"
            />
          )}

          <div className="mt-2 -mr-1 flex items-center justify-end gap-0.5 border-t border-rule pt-1.5 sm:hidden">
            {actions}
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <div className="flex items-center gap-0.5 opacity-80 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
            {actions}
          </div>
          <PotentialGauge lead={lead} />
        </div>
      </div>
    </article>
  );
}
