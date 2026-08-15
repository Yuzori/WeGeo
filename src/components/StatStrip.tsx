import { Link } from 'react-router-dom';
import { Check, Inbox, Star, TrendingUp } from 'lucide-react';
import type { Stats } from '../../shared/types';
import { cx } from './ui';

/** Bandeau de chiffres clés, cliquable pour aller directement au bon onglet. */
export function StatStrip({ stats }: { stats: Stats }) {
  const signable = stats.termine + stats.perdu;
  const rate = signable ? Math.round((stats.termine / signable) * 100) : null;

  const tiles = [
    { to: '/a-trier', label: 'À trier', value: stats.nouveau, icon: Inbox },
    { to: '/favoris', label: 'À appeler', value: stats.favori, icon: Star },
    { to: '/signes', label: 'Signés', value: stats.termine, icon: Check },
    {
      to: '/signes',
      label: 'Taux de signature',
      value: rate === null ? '—' : `${rate}%`,
      icon: TrendingUp,
      accent: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {tiles.map(({ to, label, value, icon: Icon, accent }, index) => (
        <Link
          key={label}
          to={to}
          style={{ animationDelay: `${index * 45}ms` }}
          className={cx(
            'card animate-in group flex items-center gap-3 px-3.5 py-3 transition-all duration-200',
            'hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[var(--shadow-lift)]',
          )}
        >
          <span
            className={cx(
              'flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors',
              accent ? 'bg-accent text-accent-contrast' : 'bg-accent-soft text-accent-text',
            )}
          >
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="tnum block text-xl leading-none font-semibold text-text">{value}</span>
            <span className="mt-1 block truncate text-[11px] text-subtle">{label}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
