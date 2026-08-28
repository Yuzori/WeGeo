import { ExternalLink, UserRound } from 'lucide-react';
import type { Lead } from '../../shared/types';

function sourceUrl(lead: Lead): string {
  if (lead.dirigeantSource) return lead.dirigeantSource;
  const terme = [lead.name, lead.city].filter(Boolean).join(' ');
  return `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(terme)}`;
}

/**
 * Qui appeler : distinct du téléphone. Compact sur une fiche, grand en session d'appels.
 */
export function DirigeantLine({ lead, large = false }: { lead: Lead; large?: boolean }) {
  const name = lead.dirigeant?.trim() || null;
  const missing = !name && lead.dirigeantStatus === 'missing';
  if (!name && !missing) return null;

  const source = (
    <a
      href={sourceUrl(lead)}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className="relative z-20 inline-flex items-center gap-0.5 text-[11px] text-faint underline decoration-rule-strong underline-offset-2 hover:text-ink"
    >
      Source
      <ExternalLink className="size-2.5" />
    </a>
  );

  if (large) {
    return (
      <div className="mt-1 min-w-0">
        <p className="legend">dirigeant</p>
        {name ? (
          <p className="mt-1 font-[family-name:var(--font-display)] text-3xl leading-[1.05] font-extrabold tracking-tight sm:text-4xl">
            {name}
          </p>
        ) : (
          <p className="mt-1 text-lg italic text-muted">Non trouvé</p>
        )}
        <div className="mt-1.5">{source}</div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="legend">à demander</p>
      <p className="mt-0.5 flex min-w-0 items-center gap-1.5">
        <UserRound className="size-3.5 shrink-0 text-ember" aria-hidden />
        {name ? (
          <span className="truncate text-sm font-semibold text-ink" title={name}>
            {name}
          </span>
        ) : (
          <span className="truncate text-sm italic text-muted">Non trouvé</span>
        )}
      </p>
      <div className="mt-0.5 pl-5">{source}</div>
    </div>
  );
}
