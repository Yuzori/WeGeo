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
import { Badge, IconButton, cx, useToast } from './ui';

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

/** Initiales de l'entreprise, sur une nuance de la charte propre à son nom. */
function Monogram({ name, dimmed }: { name: string; dimmed?: boolean }) {
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  // Teinte stable : même entreprise, même nuance à chaque affichage.
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const shade = [300, 400, 500, 600, 700][hash % 5];

  return (
    <span
      aria-hidden
      className={cx(
        'flex size-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold tracking-tight text-white',
        'shadow-[var(--shadow-soft)] transition-transform duration-200 group-hover:scale-105',
        dimmed && 'opacity-60 grayscale',
      )}
      style={{ backgroundImage: `linear-gradient(140deg, var(--brand-${shade}), var(--brand-${shade + 200}))` }}
    >
      {initials || '?'}
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

  // Les mêmes actions sont placées à droite sur grand écran et sous la fiche
  // sur téléphone, où la colonne de texte a besoin de toute la largeur.
  const actions = (
    <>
      <a
        href={lead.mapsUrl}
        target="_blank"
        rel="noreferrer"
        title="Ouvrir la fiche Google Maps"
        aria-label="Ouvrir la fiche Google Maps"
        className="inline-flex size-9 items-center justify-center rounded-xl text-subtle transition-all duration-150 hover:bg-accent-soft hover:text-accent-text active:scale-95"
      >
        <ExternalLink className="size-4" />
      </a>

      <IconButton
        label={notesOpen ? 'Enregistrer la note' : 'Ajouter une note'}
        active={notesOpen || !!lead.notes}
        onClick={() => (notesOpen ? saveNotes() : setNotesOpen(true))}
      >
        <StickyNote className="size-4" />
      </IconButton>

      {restoreMode ? (
        <IconButton label="Remettre dans les favoris" tone="brand" onClick={() => onStatus(lead, 'favori')}>
          <RotateCcw className="size-4" />
        </IconButton>
      ) : (
        <>
          <IconButton
            label={lead.status === 'favori' ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            tone="brand"
            active={lead.status === 'favori'}
            onClick={() => onStatus(lead, lead.status === 'favori' ? 'nouveau' : 'favori')}
          >
            <Star className={cx('size-4', lead.status === 'favori' && 'fill-current')} />
          </IconButton>

          <IconButton
            label="Marquer comme signé"
            tone="brand"
            active={lead.status === 'termine'}
            onClick={() => onStatus(lead, 'termine')}
          >
            <Check className="size-4" />
          </IconButton>

          <IconButton
            label="Non conclu (ne plus proposer)"
            tone="neutral"
            active={lead.status === 'perdu'}
            onClick={() => onStatus(lead, 'perdu')}
          >
            <ThumbsDown className="size-4" />
          </IconButton>
        </>
      )}

      <IconButton
        label={armed ? 'Cliquez à nouveau pour supprimer' : 'Supprimer définitivement'}
        tone="armed"
        active={armed}
        onClick={() => (armed ? onDelete(lead) : setArmed(true))}
      >
        <Trash2 className="size-4" />
      </IconButton>
    </>
  );

  return (
    <article
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cx(
        'card group relative overflow-hidden px-4 py-3.5 transition-all duration-200',
        'animate-in hover:-translate-y-px hover:shadow-[var(--shadow-lift)]',
        selected && 'border-accent ring-1 ring-accent',
        lead.status === 'perdu' && 'opacity-70 hover:opacity-100',
      )}
    >
      {/* Liseré des fiches signées */}
      {lead.status === 'termine' && (
        <span className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden />
      )}

      <div className="flex items-start gap-3.5">
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(lead.id)}
            aria-label={`Sélectionner ${lead.name}`}
            className="mt-3.5 size-4 shrink-0 cursor-pointer accent-[var(--accent)]"
          />
        )}

        <Monogram name={lead.name} dimmed={lead.status === 'perdu'} />

        <div className="min-w-0 flex-1">
          {/* Nom + étiquettes */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] leading-tight font-semibold text-text">{lead.name}</h3>

            {lead.websiteKind === 'aucun' ? (
              <Badge tone="brand">
                <Globe className="size-3" /> Aucun site
              </Badge>
            ) : (
              <Badge tone="outline">
                <Globe className="size-3" /> {linkLabel(lead.website ?? '')} uniquement
              </Badge>
            )}

            {lead.status === 'termine' && (
              <Badge tone="solid">
                <Check className="size-3" /> Signé
              </Badge>
            )}
            {lead.status === 'perdu' && (
              <Badge tone="neutral">
                <ThumbsDown className="size-3" /> Non conclu
              </Badge>
            )}
            {lead.seenCount > 1 && <Badge tone="neutral">vu {lead.seenCount}×</Badge>}
          </div>

          {/* Métadonnées */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-subtle">
            {lead.category && <span className="font-medium text-muted">{lead.category}</span>}
            {lead.rating != null && (
              <span className="tnum inline-flex items-center gap-0.5">
                <Star className="size-3 fill-current" />
                {lead.rating.toFixed(1).replace('.', ',')}
                {lead.reviewCount != null && <span className="ml-0.5">({lead.reviewCount})</span>}
              </span>
            )}
            {/* Le métier recherché n'est utile que s'il diffère de l'activité affichée. */}
            {!sameLabel(lead.category, lead.domain) && (
              <>
                <span aria-hidden>·</span>
                <span>recherché : {lead.domain}</span>
              </>
            )}
          </div>

          {/* Contact : téléphone et adresse cliquables */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {lead.phone ? (
              <span className="group/tel inline-flex items-center overflow-hidden rounded-lg border border-accent-line bg-accent-soft">
                <a
                  href={`tel:${lead.phone.replace(/\s/g, '')}`}
                  className="tnum inline-flex items-center gap-1.5 py-1 pr-2 pl-2.5 text-sm font-semibold text-accent-text transition hover:brightness-110"
                >
                  <Phone className="size-3.5" />
                  {lead.phone}
                </a>
                <button
                  type="button"
                  onClick={() => copy(lead.phone!, 'Numéro')}
                  title="Copier le numéro"
                  aria-label="Copier le numéro"
                  className="h-full px-1.5 py-1.5 text-accent-text/60 transition hover:bg-accent-line hover:text-accent-text"
                >
                  <Copy className="size-3.5" />
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-sm text-subtle">
                <PhoneOff className="size-3.5" /> Pas de numéro
              </span>
            )}

            {lead.address && (
              <a
                href={mapsSearch(`${lead.name} ${lead.address}`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-transparent px-1.5 py-1 text-sm text-muted transition hover:border-line hover:bg-surface-3 hover:text-text"
              >
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{lead.address}</span>
              </a>
            )}
          </div>

          {lead.notes && !notesOpen && (
            <p className="mt-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted">
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
              className="input mt-2.5 resize-y text-xs"
            />
          )}

          <div className="mt-2 -mr-1 flex items-center justify-end gap-0.5 border-t border-line pt-1.5 sm:hidden">
            {actions}
          </div>
        </div>

        <div className="hidden shrink-0 items-center gap-0.5 opacity-70 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 sm:flex">
          {actions}
        </div>
      </div>
    </article>
  );
}
