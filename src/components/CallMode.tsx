import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Phone,
  Star,
  ThumbsDown,
  X,
} from 'lucide-react';
import type { Lead, LeadStatus } from '../../shared/types';
import { TIER_COLORS, formatCoords, potential, tierLabel } from '../lib/lead';
import { DirigeantLine } from './DirigeantLine';
import { Tag, cx, useToast } from './ui';

/** Une touche du clavier, dessinée comme telle. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-rule-strong bg-card px-1 font-mono text-[10px] font-semibold text-muted">
      {children}
    </kbd>
  );
}

/**
 * Session d'appels : une fiche à la fois, en plein écran, pilotée au clavier.
 *
 * L'idée est de supprimer tout ce qui distrait pendant qu'on téléphone : il
 * reste le numéro, le bloc-notes, et deux touches pour trancher.
 */
export function CallMode({
  leads,
  startIndex = 0,
  onStatus,
  onNotes,
  onClose,
}: {
  leads: Lead[];
  startIndex?: number;
  onStatus: (lead: Lead, status: LeadStatus) => void;
  onNotes: (lead: Lead, notes: string) => void;
  onClose: () => void;
}) {
  const notify = useToast();
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(0, leads.length - 1)));
  const [draft, setDraft] = useState('');
  const [verdict, setVerdict] = useState<LeadStatus | null>(null);
  const [handled, setHandled] = useState(0);
  const [, setStamp] = useState(0);
  const notes = useRef<HTMLTextAreaElement>(null);

  // La liste est figée à l'ouverture : classer une fiche ne doit pas la faire
  // disparaître sous les doigts et décaler toutes les suivantes.
  const queue = useRef(leads);
  const list = queue.current;
  const lead = list[index];

  useEffect(() => {
    let touched = false;
    for (const updated of leads) {
      const slot = queue.current.findIndex((row) => row.id === updated.id);
      if (slot === -1) continue;
      if (
        updated.dirigeant !== queue.current[slot].dirigeant ||
        updated.dirigeantSource !== queue.current[slot].dirigeantSource ||
        updated.dirigeantStatus !== queue.current[slot].dirigeantStatus
      ) {
        queue.current[slot] = {
          ...queue.current[slot],
          dirigeant: updated.dirigeant,
          dirigeantSource: updated.dirigeantSource,
          dirigeantStatus: updated.dirigeantStatus,
        };
        if (slot === index) touched = true;
      }
    }
    if (touched) setStamp((n) => n + 1);
  }, [leads, index]);

  useEffect(() => {
    setDraft(lead?.notes ?? '');
    setVerdict(null);
  }, [lead]);

  const commitNotes = () => {
    if (lead && draft !== (lead.notes ?? '')) onNotes(lead, draft);
  };

  const go = (delta: number) => {
    commitNotes();
    setIndex((i) => Math.min(list.length - 1, Math.max(0, i + delta)));
  };

  const decide = (status: LeadStatus) => {
    if (!lead) return;
    commitNotes();
    onStatus(lead, status);
    setVerdict(status);
    setHandled((n) => n + 1);
    // On laisse le tampon s'afficher avant d'enchaîner.
    setTimeout(() => {
      if (index < list.length - 1) setIndex((i) => i + 1);
      else onClose();
    }, 620);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();

      // Les raccourcis ne doivent pas s'activer pendant la prise de notes.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;

      switch (event.key) {
        case 'ArrowRight':
        case ' ':
          event.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
          go(-1);
          break;
        case 's':
        case 'S':
          decide('termine');
          break;
        case 'n':
        case 'N':
          decide('perdu');
          break;
        case 'f':
        case 'F':
          if (lead) onStatus(lead, 'favori');
          break;
        default:
      }
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  if (!lead) return null;

  const { score, tier, reasons } = potential(lead);
  const coords = formatCoords(lead.lat, lead.lng);
  const telHref = `tel:${(lead.phone ?? '').replace(/\s/g, '')}`;

  return (
    <div className="app-stage flex flex-col bg-paper">
      {/* Bandeau : progression dans la file d'appels. */}
      <header className="flex items-center gap-2 border-b border-rule px-3 py-3 sm:gap-4 sm:px-4">
        <span className="legend shrink-0">session d’appels</span>
        <div className="flex min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
          {list.map((l, i) => (
            <span
              key={l.id}
              className={cx(
                'h-1 flex-1 rounded-full transition-colors duration-300',
                i === index ? 'bg-lime-deep' : i < index ? 'bg-lime-line' : 'bg-card-3',
              )}
            />
          ))}
        </div>
        <span className="legend tnum shrink-0">
          {index + 1} / {list.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rule px-2 py-1 text-xs font-medium transition hover:bg-card-2"
        >
          <X className="size-3.5" /> <span className="hidden sm:inline">Quitter</span> <span className="hidden sm:inline"><Key>Échap</Key></span>
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-3 py-5 sm:px-5 sm:py-8">
        <div key={lead.id} className="rise-in">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10px] font-medium tracking-wide uppercase"
              style={{ color: TIER_COLORS[tier].css, borderColor: TIER_COLORS[tier].css }}
            >
              potentiel {score}/100 · {tierLabel(tier)}
            </span>
            {lead.category && <Tag tone="outline">{lead.category}</Tag>}
            {lead.rating != null && (
              <span className="tnum inline-flex items-center gap-1 text-xs text-muted">
                <Star className="size-3.5 fill-current text-ember" />
                {lead.rating.toFixed(1).replace('.', ',')} ({lead.reviewCount ?? 0} avis)
              </span>
            )}
          </div>

          <h1 className="mt-3 text-[1.85rem] leading-[1.05] font-semibold tracking-tight sm:text-4xl lg:text-5xl">
            {lead.name}
          </h1>

          <div className="mt-4 max-w-lg">
            <DirigeantLine lead={lead} large />
          </div>

          <p className="mt-2 text-sm text-muted">
            {reasons.slice(0, 2).join(' · ')}
          </p>

          {/* Le numéro, en très grand : c'est l'objet de l'écran. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {lead.phone ? (
              <>
                <a
                  href={telHref}
                  className="group inline-flex items-center gap-3 rounded-lg border-2 border-lime-line bg-lime-soft px-5 py-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
                >
                  <Phone className="size-6 text-lime-deep transition-transform group-hover:rotate-12" />
                  <span className="tnum text-xl font-semibold break-all text-lime-deep sm:text-3xl lg:text-4xl">{lead.phone}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(lead.phone!).then(
                      () => notify('Numéro copié', 'info'),
                      () => notify('Copie impossible', 'error'),
                    );
                  }}
                  className="inline-flex size-11 items-center justify-center rounded-md border border-rule-strong transition hover:bg-card-2"
                  title="Copier le numéro"
                >
                  <Copy className="size-4" />
                </button>
              </>
            ) : (
              <p className="rounded-lg border border-dashed border-rule-strong px-5 py-3 text-muted">
                Aucun numéro sur la fiche. À chercher sur place.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {lead.address && (
              <a
                href={lead.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-ink hover:underline"
              >
                <MapPin className="size-3.5" /> {lead.address}
              </a>
            )}
            <a
              href={lead.mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-ink hover:underline"
            >
              <ExternalLink className="size-3.5" /> Fiche Google Maps
            </a>
            {coords && <span className="font-mono text-[10px] text-faint">{coords}</span>}
          </div>

          <textarea
            ref={notes}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitNotes}
            rows={3}
            placeholder="Compte-rendu de l’appel. Interlocuteur, objection, date de rappel…"
            className="field mt-6 resize-y text-sm"
          />
        </div>
      </div>

      {/* Tampon du verdict, plaqué au centre de l'écran. */}
      {verdict && (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center">
          <span
            className={cx(
              'stamp rounded-lg border-4 px-5 py-2 font-mono text-2xl font-bold tracking-[0.2em] uppercase sm:px-8 sm:py-3 sm:text-4xl',
              verdict === 'termine' ? 'border-lime-deep text-lime-deep' : 'border-ember text-ember',
            )}
          >
            {verdict === 'termine' ? 'signé' : 'non conclu'}
          </span>
        </div>
      )}

      {/* Barre de commandes */}
      <footer className="border-t border-rule bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => decide('termine')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-lime-line bg-lime px-4 py-2.5 font-semibold text-on-lime transition hover:brightness-105 active:scale-[0.98]"
          >
            <Check className="size-4" /> Signé <Key>S</Key>
          </button>
          <button
            type="button"
            onClick={() => decide('perdu')}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-rule-strong px-4 py-2.5 font-medium transition hover:bg-card-2 active:scale-[0.98]"
          >
            <ThumbsDown className="size-4" /> Non conclu <Key>N</Key>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={index === 0}
              className="inline-flex size-10 items-center justify-center rounded-md border border-rule-strong transition hover:bg-card-2 disabled:opacity-30"
              title="Fiche précédente"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={index >= list.length - 1}
              className="inline-flex items-center gap-2 rounded-md border border-rule-strong px-3 py-2.5 font-medium transition hover:bg-card-2 disabled:opacity-30"
              title="Fiche suivante"
            >
              Passer <ArrowRight className="size-4" /> <Key>→</Key>
            </button>
          </div>
        </div>
        <p className="legend mt-2 text-center">
          {handled} fiche{handled > 1 ? 's' : ''} classée{handled > 1 ? 's' : ''} · <Key>F</Key> pour garder en
          favori
        </p>
      </footer>
    </div>
  );
}
