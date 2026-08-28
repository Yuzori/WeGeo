import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  History,
  Inbox,
  Layers,
  MapPin,
  Moon,
  Phone,
  Search,
  Settings,
  Star,
  ThumbsDown,
} from 'lucide-react';
import type { Lead } from '../../shared/types';
import { api } from '../api';
import { formatPhone } from '../lib/lead';
import { cx, useToast } from './ui';
import { sessionPath } from '../workspace';
import { rememberSettingsFrom } from '../lib/nav';

interface Action {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

/** Retire accents et casse, pour que « signes » trouve « Signés ». */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Palette de commandes (Ctrl/⌘ + K) : navigation, réglages, et recherche
 * directe dans les prospects déjà enregistrés.
 */
export function CommandPalette({
  open,
  onClose,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId?: number;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const notify = useToast();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Lead[]>([]);
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      setMatches([]);
      requestAnimationFrame(() => input.current?.focus());
    }
  }, [open]);

  // Recherche dans la base, à la frappe.
  useEffect(() => {
    if (!open || query.trim().length < 2) return setMatches([]);
    const timer = setTimeout(() => {
      api
        .leads({ q: query.trim() })
        .then((rows) => setMatches(rows.slice(0, 5)))
        .catch(() => setMatches([]));
    }, 180);
    return () => clearTimeout(timer);
  }, [query, open]);

  const commands = useMemo<Action[]>(() => {
    const goto = (path: string) => () => {
      navigate(path);
      onClose();
    };

    const base = workspaceId ? sessionPath(workspaceId) : '/app';
    return [
      { id: 'sessions', label: 'Mes sessions', hint: 'Changer d’espace', icon: <Layers className="size-4" />, run: goto('/app') },
      { id: 'search', label: 'Nouvelle recherche', hint: 'Lancer un balayage', icon: <Search className="size-4" />, run: goto(base) },
      { id: 'tri', label: 'À trier', hint: 'Prospects non classés', icon: <Inbox className="size-4" />, run: goto(`${base}/a-trier`) },
      { id: 'appels', label: 'Session d’appels', hint: 'Une fiche à la fois', icon: <Phone className="size-4" />, run: goto(`${base}/appels`) },
      { id: 'fav', label: 'Favoris', hint: 'À appeler', icon: <Star className="size-4" />, run: goto(`${base}/favoris`) },
      { id: 'signe', label: 'Signés', icon: <Check className="size-4" />, run: goto(`${base}/signes`) },
      { id: 'perdu', label: 'Non conclus', icon: <ThumbsDown className="size-4" />, run: goto(`${base}/non-conclus`) },
      { id: 'hist', label: 'Historique des recherches', icon: <History className="size-4" />, run: goto(`${base}/historique`) },
      {
        id: 'compte',
        label: 'Réglages du compte',
        hint: 'Photo, pseudo, mot de passe',
        icon: <Settings className="size-4" />,
        run: () => {
          rememberSettingsFrom(`${location.pathname}${location.search}${location.hash}`);
          goto('/app/compte')();
        },
      },
      {
        id: 'theme',
        label: 'Basculer jour / nuit',
        icon: <Moon className="size-4" />,
        run: () => {
          const dark = document.documentElement.classList.toggle('dark');
          localStorage.setItem('wegeo.theme', dark ? 'nuit' : 'jour');
          onClose();
        },
      },
    ];
  }, [location.hash, location.pathname, location.search, navigate, onClose, workspaceId]);

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return commands;
    return commands.filter((c) => fold(c.label).includes(q) || fold(c.hint ?? '').includes(q));
  }, [commands, query]);

  const rows = useMemo(
    () => [
      ...filtered.map((c) => ({ kind: 'command' as const, command: c })),
      ...matches.map((lead) => ({ kind: 'lead' as const, lead })),
    ],
    [filtered, matches],
  );

  useEffect(() => setCursor(0), [rows.length]);

  const activate = (row: (typeof rows)[number]) => {
    if (row.kind === 'command') return row.command.run();

    const { lead } = row;
    if (lead.phone) {
      navigator.clipboard.writeText(lead.phone).then(
        () => notify(`${lead.name} — numéro copié`, 'info'),
        () => window.open(lead.mapsUrl, '_blank'),
      );
    } else {
      window.open(lead.mapsUrl, '_blank');
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onClose();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setCursor((c) => (c + 1) % Math.max(1, rows.length));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setCursor((c) => (c - 1 + rows.length) % Math.max(1, rows.length));
      }
      if (event.key === 'Enter' && rows[cursor]) {
        event.preventDefault();
        activate(rows[cursor]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[max(4.5rem,env(safe-area-inset-top)+1rem)] sm:px-4 sm:pt-[12vh]">
      <div className="absolute inset-0 bg-[hsl(var(--shade)/0.45)] backdrop-blur-[3px]" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Palette de commandes"
        className="pop-in relative w-full max-w-lg overflow-hidden rounded-lg border border-rule bg-card shadow-[var(--shadow-float)]"
      >
        <div className="flex items-center gap-2.5 border-b border-rule px-3.5 py-3">
          <Search className="size-4 shrink-0 text-faint" aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Une commande, ou le nom d’une entreprise…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>

        <ul className="max-h-[54vh] overflow-auto py-1.5">
          {rows.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-faint">Aucun résultat.</li>
          )}

          {rows.map((row, i) => {
            const active = i === cursor;
            return (
              <li key={row.kind === 'command' ? row.command.id : `lead-${row.lead.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => activate(row)}
                  className={cx(
                    'flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors',
                    active ? 'bg-lime-soft text-ink' : 'hover:bg-card-2',
                  )}
                >
                  <span
                    className={cx(
                      'flex size-7 shrink-0 items-center justify-center rounded border',
                      active ? 'border-lime-line bg-card text-lime-deep' : 'border-rule text-faint',
                    )}
                  >
                    {row.kind === 'command' ? row.command.icon : <MapPin className="size-4" />}
                  </span>

                  {row.kind === 'command' ? (
                    <>
                      <span className="flex-1 truncate text-sm font-medium">{row.command.label}</span>
                      {row.command.hint && <span className="legend">{row.command.hint}</span>}
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{row.lead.name}</span>
                        <span className="legend">
                          {row.lead.dirigeant
                            ? `${row.lead.dirigeant} · ${row.lead.city}`
                            : row.lead.dirigeantStatus === 'missing'
                              ? `Dirigeant non trouvé · ${row.lead.city}`
                              : row.lead.city}
                        </span>
                      </span>
                      {row.lead.phone && (
                        <span className="tnum inline-flex items-center gap-1 text-xs text-muted">
                          <Phone className="size-3" /> {formatPhone(row.lead.phone)}
                        </span>
                      )}
                    </>
                  )}

                  {active && <ArrowRight className="size-3.5 shrink-0 text-lime-deep" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center gap-3 border-t border-rule bg-card-2 px-3.5 py-2">
          <span className="legend">↑↓ naviguer</span>
          <span className="legend">↵ ouvrir</span>
          <span className="legend ml-auto">échap fermer</span>
        </footer>
      </div>
    </div>
  );
}
