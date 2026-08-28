import { useEffect, useState } from 'react';
import { Radio, Square } from 'lucide-react';
import type { Lead } from '../../shared/types';
import { MiniMap } from './MapView';
import { Button, Counter, cx } from './ui';

export interface ScanProgress {
  message: string;
  scanned: number;
  found: number;
  ratio: number;
}

/** Chronomètre de la recherche en cours. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="tnum">
      {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

/**
 * Poste de commandement d'une recherche : radar des positions trouvées,
 * compteurs, journal des étapes et barre d'avancement.
 */
export function ScanPanel({
  progress,
  log,
  leads,
  startedAt,
  onStop,
  onExpandMap,
  showMap = true,
}: {
  progress: ScanProgress;
  log: string[];
  leads: Lead[];
  startedAt: number;
  onStop?: () => void;
  onExpandMap?: () => void;
  showMap?: boolean;
}) {
  const percent = Math.round(Math.min(1, progress.ratio) * 100);

  return (
    <section className="sheet-raised overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-rule px-4 py-2.5">
        <span className="relative flex size-2 shrink-0" aria-hidden>
          <span className="ping-ring absolute inset-0 rounded-full bg-lime-deep" />
          <span className="relative size-2 rounded-full bg-lime-deep" />
        </span>
        <span className="legend text-lime-deep">balayage en cours</span>
        <span className="legend ml-auto">
          <Elapsed since={startedAt} />
        </span>
        {onStop && (
          <Button size="sm" variant="ghost" icon={<Square className="size-3.5" />} onClick={onStop}>
            Arrêter
          </Button>
        )}
      </header>

      <div className={cx('grid gap-5 p-4', showMap && 'sm:grid-cols-[minmax(0,200px)_1fr]')}>
        {showMap && <MiniMap leads={leads} onExpand={onExpandMap} className="mx-auto w-full max-w-[220px]" />}

        <div className="flex min-w-0 flex-col">
          <div className="grid grid-cols-2 gap-3">
            <Readout value={progress.scanned} label="fiches inspectées" />
            <Readout value={progress.found} label="sans site web" accent />
          </div>

          <p className="mt-4 truncate text-sm font-medium">{progress.message}</p>

          {/* Journal : les lignes remontent au fil des étapes. */}
          <ul className="mt-2 min-h-14 flex-1 space-y-0.5 overflow-hidden">
            {log.slice(-3).map((line, index, all) => (
              <li
                key={`${line}-${index}`}
                className={cx(
                  'tick-in truncate font-mono text-[11px]',
                  index === all.length - 1 ? 'text-muted' : 'text-faint opacity-55',
                )}
              >
                <Radio className="mr-1 inline size-2.5" aria-hidden /> {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="h-[3px] overflow-hidden bg-card-3">
        {progress.ratio > 0 ? (
          <div
            className="h-full bg-lime-deep transition-all duration-700 ease-[var(--ease-out-quint)]"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="bar-indeterminate h-full" />
        )}
      </div>
    </section>
  );
}

function Readout({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div
      className={cx(
        'rounded-md border px-3 py-2',
        accent ? 'border-lime-line bg-lime-soft' : 'border-rule bg-card-2',
      )}
    >
      <Counter
        value={value}
        className={cx('block text-2xl leading-none font-semibold', accent && 'text-lime-deep')}
      />
      <div className="legend mt-1.5">{label}</div>
    </div>
  );
}
