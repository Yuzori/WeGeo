import { Link } from 'react-router-dom';
import { Check, Inbox, Star, TrendingUp } from 'lucide-react';
import type { Stats } from '../../shared/types';
import { Counter, cx } from './ui';

/** Bandeau de chiffres clés, cliquable pour aller directement au bon onglet. */
export function StatStrip({ stats, base = '/app' }: { stats: Stats; base?: string }) {
  const decided = stats.termine + stats.perdu;
  const rate = decided ? Math.round((stats.termine / decided) * 100) : null;

  const tiles = [
    { to: `${base}/a-trier`, label: 'à trier', value: stats.nouveau, icon: Inbox },
    { to: `${base}/favoris`, label: 'à appeler', value: stats.favori, icon: Star },
    { to: `${base}/signes`, label: 'signés', value: stats.termine, icon: Check },
    {
      to: `${base}/signes`,
      label: 'taux de signature',
      value: rate,
      suffix: '%',
      icon: TrendingUp,
      accent: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {tiles.map(({ to, label, value, suffix, icon: Icon, accent }, index) => (
        <Link
          key={label}
          to={to}
          style={{ animationDelay: `${index * 40}ms` }}
          className={cx(
            'sheet rise-in group relative overflow-hidden px-3 py-2.5 transition-all duration-200',
            'hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-[var(--shadow-raised)]',
          )}
        >
          {/* Graduation d'échelle, en haut de la tuile. */}
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5 opacity-40"
            style={{
              backgroundImage: 'repeating-linear-gradient(90deg, var(--rule-strong) 0 1px, transparent 1px 6px)',
            }}
          />

          <div className="flex items-baseline gap-1.5">
            {value === null ? (
              <span className="tnum text-2xl leading-none font-semibold text-faint">-</span>
            ) : (
              <Counter
                value={value}
                className={cx('text-2xl leading-none font-semibold', accent && 'text-lime-deep')}
              />
            )}
            {suffix && value !== null && (
              <span className={cx('text-sm font-medium', accent ? 'text-lime-deep' : 'text-faint')}>{suffix}</span>
            )}
            <Icon
              className={cx(
                'ml-auto size-3.5 transition-all duration-300 group-hover:-rotate-12',
                accent ? 'text-lime-deep' : 'text-faint',
              )}
            />
          </div>
          <span className="legend mt-1.5 block truncate">{label}</span>
        </Link>
      ))}
    </div>
  );
}
