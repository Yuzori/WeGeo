import { Radar } from 'lucide-react';
import { cx } from './ui';

export interface ScanProgress {
  message: string;
  scanned: number;
  found: number;
  ratio: number;
}

/** Panneau affiché pendant une recherche : radar animé, journal et compteurs. */
export function ScanPanel({ progress, log }: { progress: ScanProgress; log: string[] }) {
  const percent = Math.round(Math.min(1, progress.ratio) * 100);

  return (
    <section className="card animate-in overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        {/* Radar */}
        <span className="relative flex size-11 shrink-0 items-center justify-center">
          <span className="sonar-ring absolute inset-0 rounded-full bg-accent/25" aria-hidden />
          <span
            className="sonar-ring absolute inset-0 rounded-full bg-accent/20"
            style={{ animationDelay: '0.7s' }}
            aria-hidden
          />
          <span className="relative flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent-text">
            <Radar className="size-5 animate-pulse" />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">{progress.message}</p>
          <p className="mt-0.5 text-xs text-subtle">Recherche en cours — vous pouvez déjà trier les résultats.</p>
        </div>

        <div className="flex gap-6">
          <Counter value={progress.scanned} label="inspectées" />
          <Counter value={progress.found} label="retenues" accent />
        </div>
      </div>

      {/* Journal des dernières étapes */}
      {log.length > 1 && (
        <ul className="scroll-slim max-h-24 overflow-hidden border-t border-line px-5 py-2">
          {log.slice(-3).map((line, index, all) => (
            <li
              key={`${line}-${index}`}
              className={cx(
                'truncate py-0.5 text-xs transition-opacity',
                index === all.length - 1 ? 'text-muted' : 'text-subtle opacity-60',
              )}
            >
              {line}
            </li>
          ))}
        </ul>
      )}

      <div className="h-1 overflow-hidden bg-surface-3">
        {progress.ratio > 0 ? (
          <div
            className="h-full rounded-r-full bg-accent transition-all duration-700 ease-[var(--ease-out-quint)]"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="bar-indeterminate h-full" />
        )}
      </div>
    </section>
  );
}

function Counter({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className={cx('tnum text-xl leading-none font-semibold', accent ? 'text-accent-text' : 'text-text')}>
        {value}
      </div>
      <div className="mt-1 text-[11px] text-subtle">{label}</div>
    </div>
  );
}
