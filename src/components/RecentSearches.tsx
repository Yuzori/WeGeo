import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, RotateCcw } from 'lucide-react';
import type { SearchRecord } from '../../shared/types';
import { api } from '../api';

/** Rappel des dernières recherches, rejouables en un clic. */
export function RecentSearches({
  onReplay,
  historyTo = '/app/historique',
}: {
  onReplay: (search: SearchRecord) => void;
  historyTo?: string;
}) {
  const [searches, setSearches] = useState<SearchRecord[]>([]);

  useEffect(() => {
    let alive = true;
    api
      .searches()
      .then((list) => alive && setSearches(list.filter((s) => s.status !== 'en_cours').slice(0, 3)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!searches.length) return null;

  return (
    <section className="rise-in">
      <div className="mb-2 flex items-center justify-between border-b border-rule pb-1.5">
        <h2 className="legend">relevés précédents</h2>
        <Link
          to={historyTo}
          className="inline-flex items-center gap-1 text-xs font-medium text-faint transition hover:text-lime-deep"
        >
          tout l’historique <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {searches.map((search, index) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onReplay(search)}
            style={{ animationDelay: `${index * 40}ms` }}
            className="sheet deal-in group flex flex-col items-start gap-1 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-rule-strong hover:shadow-[var(--shadow-raised)]"
          >
            <span className="flex w-full items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-lime-deep" />
              <span className="truncate text-sm font-semibold">{search.city}</span>
              <RotateCcw className="ml-auto size-3.5 shrink-0 text-faint opacity-0 transition-all duration-300 group-hover:-rotate-45 group-hover:opacity-100" />
            </span>
            <span className="line-clamp-1 font-mono text-[10px] tracking-wide text-faint">
              {search.domains.join(' · ')}
            </span>
            <span className="tnum mt-1 text-xs text-muted">
              <strong className="font-semibold text-lime-deep">{search.found}</strong> / {search.scanned} fiches
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
