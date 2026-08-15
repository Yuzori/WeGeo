import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MapPin, RotateCcw } from 'lucide-react';
import type { SearchRecord } from '../../shared/types';
import { api } from '../api';

/** Rappel des dernières recherches, rejouables en un clic. */
export function RecentSearches({ onReplay }: { onReplay: (search: SearchRecord) => void }) {
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
    <section className="animate-in">
      <div className="mb-2 flex items-center justify-between px-1.5">
        <h2 className="text-sm font-semibold text-text">Reprendre une recherche</h2>
        <Link
          to="/historique"
          className="inline-flex items-center gap-1 text-xs font-medium text-subtle transition hover:text-accent-text"
        >
          Tout l’historique <ArrowRight className="size-3" />
        </Link>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {searches.map((search, index) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onReplay(search)}
            style={{ animationDelay: `${index * 45}ms` }}
            className="card animate-in group flex flex-col items-start gap-1 p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-accent-line hover:shadow-[var(--shadow-lift)]"
          >
            <span className="flex w-full items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0 text-accent-text" />
              <span className="truncate text-sm font-semibold text-text">{search.city}</span>
              <RotateCcw className="ml-auto size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="line-clamp-1 text-xs text-subtle">{search.domains.join(' · ')}</span>
            <span className="tnum mt-1 text-xs text-muted">
              <strong className="font-semibold text-accent-text">{search.found}</strong> trouvée
              {search.found > 1 ? 's' : ''} sur {search.scanned}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
