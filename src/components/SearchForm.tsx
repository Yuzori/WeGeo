import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ChevronDown, MapPin, Plus, Search, SlidersHorizontal, Square, X } from 'lucide-react';
import type { SearchOptions } from '../../shared/types';
import { Button, Spinner, Toggle, cx } from './ui';

/** Métiers les plus rentables à prospecter : peu digitalisés, à forte marge. */
export const SUGGESTED_DOMAINS = [
  'coiffeur',
  'restaurant',
  'plombier',
  'électricien',
  'garage automobile',
  'boulangerie',
  'institut de beauté',
  'maçon',
  'peintre en bâtiment',
  'menuisier',
  'fleuriste',
  'boucherie',
  'paysagiste',
  'taxi',
  'auto-école',
  'pizzeria',
  'toiletteur',
  'serrurier',
  'couvreur',
  'carreleur',
  'pressing',
  'chauffagiste',
  'traiteur',
  'ostéopathe',
  'bar',
  'opticien',
  'photographe',
  'déménageur',
];

/**
 * Lots de métiers proches, pour lancer une tournée complète d'un seul geste
 * plutôt que de saisir huit mots-clés à la main.
 */
export const DOMAIN_PACKS: Array<{ label: string; domains: string[] }> = [
  {
    label: 'Bâtiment',
    domains: ['plombier', 'électricien', 'maçon', 'couvreur', 'peintre en bâtiment', 'menuisier', 'chauffagiste', 'carreleur'],
  },
  {
    label: 'Beauté & soin',
    domains: ['coiffeur', 'institut de beauté', 'barbier', 'onglerie', 'salon de massage', 'toiletteur'],
  },
  {
    label: 'Bouche',
    domains: ['restaurant', 'pizzeria', 'boulangerie', 'boucherie', 'traiteur', 'bar', 'fromagerie'],
  },
  {
    label: 'Auto & mobilité',
    domains: ['garage automobile', 'carrosserie', 'auto-école', 'taxi', 'contrôle technique', 'dépannage automobile'],
  },
  {
    label: 'Maison & jardin',
    domains: ['paysagiste', 'serrurier', 'pisciniste', 'ramoneur', 'vitrier', 'entreprise de nettoyage'],
  },
];

/** Confirme la commune retenue : plusieurs villes françaises sont homonymes. */
function ResolvedZone({ city }: { city: string }) {
  const [state, setState] = useState<{ loading: boolean; label: string | null }>({ loading: false, label: null });

  useEffect(() => {
    const term = city.trim();
    if (!term) return setState({ loading: false, label: null });

    setState({ loading: true, label: null });
    const timer = setTimeout(() => {
      fetch(`/api/geocode?city=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((data: { displayName?: string } | null) =>
          setState({ loading: false, label: data?.displayName ?? null }),
        )
        .catch(() => setState({ loading: false, label: null }));
    }, 600);

    return () => clearTimeout(timer);
  }, [city]);

  if (!city.trim()) return null;

  return (
    <p className="mt-1.5 flex items-start gap-1.5 font-mono text-[10px] leading-relaxed tracking-wide text-faint">
      {state.loading ? (
        <>
          <Spinner className="mt-px size-2.5" /> localisation…
        </>
      ) : state.label ? (
        <>
          <MapPin className="mt-px size-2.5 shrink-0 text-lime-deep" />
          <span className="truncate">{state.label}</span>
        </>
      ) : (
        <>
          <MapPin className="mt-px size-2.5 shrink-0" />
          commune introuvable — précisez le département
        </>
      )}
    </p>
  );
}

interface SearchFormProps {
  city: string;
  onCity: (value: string) => void;
  domains: string[];
  onDomains: (value: string[]) => void;
  options: SearchOptions;
  onOptions: (value: SearchOptions) => void;
  running: boolean;
  onStart: () => void;
  onCancel: () => void;
  knownCities: string[];
}

export function SearchForm({
  city,
  onCity,
  domains,
  onDomains,
  options,
  onOptions,
  running,
  onStart,
  onCancel,
  knownCities,
}: SearchFormProps) {
  const [draft, setDraft] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const addDomain = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    if (!domains.includes(clean)) onDomains([...domains, clean]);
    setDraft('');
  };

  const addPack = (list: string[]) => {
    const merged = [...domains];
    for (const domain of list) if (!merged.includes(domain)) merged.push(domain);
    onDomains(merged);
  };

  const onDraftKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addDomain(draft);
    }
    if (event.key === 'Backspace' && !draft && domains.length) {
      onDomains(domains.slice(0, -1));
    }
  };

  /** Alimente le halo qui suit le curseur sur le panneau. */
  const trackPointer = (event: MouseEvent<HTMLDivElement>) => {
    const box = panel.current?.getBoundingClientRect();
    if (!box) return;
    panel.current!.style.setProperty('--mx', `${event.clientX - box.left}px`);
    panel.current!.style.setProperty('--my', `${event.clientY - box.top}px`);
  };

  const set = <K extends keyof SearchOptions>(key: K, value: SearchOptions[K]) =>
    onOptions({ ...options, [key]: value });

  const available = SUGGESTED_DOMAINS.filter((d) => !domains.includes(d));
  const activeCount = [
    options.onlyWithoutWebsite,
    options.socialCountsAsNoWebsite,
    options.deepCheck,
    options.excludeHandled,
    options.requirePhone,
    options.gridMode,
  ].filter(Boolean).length;

  return (
    <section
      ref={panel}
      onMouseMove={trackPointer}
      data-guide="search"
      className="sheet-raised spotlight relative overflow-hidden p-4 sm:p-5"
    >
      {/* Coin de carte replié : le détail qui signale un document de terrain. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-px -right-px size-8 border-b border-l border-rule bg-card-2"
        style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}
      />

      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr_auto] lg:items-start">
        {/* Ville */}
        <div>
          <label className="legend mb-1.5 block" htmlFor="ville">
            ville ou zone
          </label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              id="ville"
              list="villes-connues"
              value={city}
              onChange={(e) => onCity(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !running && onStart()}
              placeholder="Annecy, 74000…"
              autoComplete="off"
              className="field h-11 pl-9"
            />
            <datalist id="villes-connues">
              {knownCities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <ResolvedZone city={city} />
        </div>

        {/* Métiers */}
        <div>
          <label className="legend mb-1.5 block" htmlFor="metier">
            métiers à relever
            {domains.length > 0 && <span className="ml-1 text-lime-deep">· {domains.length}</span>}
          </label>
          <div
            className={cx(
              'flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-rule-strong bg-card p-1.5',
              'transition focus-within:border-lime-deep focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--lime)_40%,transparent)]',
            )}
          >
            {domains.map((domain) => (
              <span
                key={domain}
                className="pop-in inline-flex items-center gap-1 rounded border border-lime-line bg-lime-soft py-0.5 pr-0.5 pl-2 text-xs font-medium text-lime-deep"
              >
                {domain}
                <button
                  type="button"
                  onClick={() => onDomains(domains.filter((d) => d !== domain))}
                  aria-label={`Retirer ${domain}`}
                  className="rounded p-0.5 opacity-60 transition hover:bg-lime-line hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <input
              id="metier"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              onBlur={() => addDomain(draft)}
              placeholder={domains.length ? 'ajouter…' : 'coiffeur, plombier, restaurant…'}
              autoComplete="off"
              className="min-w-[9rem] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-faint"
            />
          </div>
        </div>

        {/* Lancement */}
        <div className="flex gap-2 lg:pt-[1.55rem]" data-guide="launch">
          {running ? (
            <Button
              variant="outline"
              size="lg"
              icon={<Square className="size-4" />}
              onClick={onCancel}
              className="w-full lg:w-auto"
            >
              Arrêter
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              icon={<Search className="size-4" />}
              onClick={onStart}
              disabled={!city.trim() || !domains.length}
              className="w-full lg:w-auto"
            >
              Lancer le relevé
            </Button>
          )}
        </div>
      </div>

      {/* Lots de métiers */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="legend mr-0.5">lots</span>
        {DOMAIN_PACKS.map((pack) => {
          const complete = pack.domains.every((d) => domains.includes(d));
          return (
            <button
              key={pack.label}
              type="button"
              onClick={() => addPack(pack.domains)}
              disabled={complete}
              title={pack.domains.join(', ')}
              className={cx(
                'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium transition-all duration-150',
                complete
                  ? 'border-lime-line bg-lime-soft text-lime-deep opacity-60'
                  : 'border-rule text-muted hover:-translate-y-px hover:border-lime-line hover:bg-lime-soft hover:text-lime-deep',
              )}
            >
              {pack.label}
              <span className="tnum text-[10px] opacity-60">{pack.domains.length}</span>
            </button>
          );
        })}
      </div>

      {/* Suggestions à l'unité */}
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="legend mr-0.5">à l’unité</span>
          {available.slice(0, 9).map((domain) => (
            <button
              key={domain}
              type="button"
              onClick={() => addDomain(domain)}
              className="inline-flex items-center gap-1 rounded border border-transparent px-1.5 py-0.5 text-xs text-faint transition-all duration-150 hover:border-rule hover:text-ink"
            >
              <Plus className="size-2.5 opacity-60" />
              {domain}
            </button>
          ))}
        </div>
      )}

      {/* Options avancées */}
      <div className="mt-4 border-t border-rule pt-3">
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-widest text-muted uppercase transition hover:text-lime-deep"
        >
          <SlidersHorizontal className="size-3.5" />
          réglages
          <span className="tnum rounded border border-rule px-1 text-[10px] text-faint">{activeCount}</span>
          <ChevronDown className={cx('size-3.5 transition-transform duration-300', showOptions && 'rotate-180')} />
        </button>

        {showOptions && (
          <div className="rise-in mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            <Toggle
              checked={options.onlyWithoutWebsite}
              onChange={(v) => set('onlyWithoutWebsite', v)}
              label="Uniquement sans site web"
              hint="Le cœur de Prospy : on écarte les entreprises déjà équipées."
            />
            <Toggle
              checked={options.socialCountsAsNoWebsite}
              onChange={(v) => set('socialCountsAsNoWebsite', v)}
              label="Compter les pages Facebook comme « sans site »"
              hint="Inclut aussi Planity, Doctolib et autres plateformes."
            />
            <Toggle
              checked={options.deepCheck}
              onChange={(v) => set('deepCheck', v)}
              label="Vérification approfondie"
              hint="Ouvre chaque fiche pour le téléphone et l'adresse exacts. À laisser activé."
            />
            <Toggle
              checked={options.excludeHandled}
              onChange={(v) => set('excludeHandled', v)}
              label="Masquer les fiches déjà traitées"
              hint="Les entreprises signées ou non conclues ne réapparaissent pas."
            />
            <Toggle
              checked={options.requirePhone}
              onChange={(v) => set('requirePhone', v)}
              label="Seulement avec un numéro"
              hint="Écarte les fiches impossibles à appeler."
            />
            <Toggle
              checked={options.gridMode}
              onChange={(v) => set('gridMode', v)}
              label="Quadrillage de la ville"
              hint="Découpe la zone en secteurs pour dépasser la limite d'environ 120 résultats. Utile sur les grandes villes."
            />

            {options.gridMode && (
              <label className="flex items-center gap-3 px-2 py-2 text-sm text-muted">
                <span className="shrink-0">Secteurs</span>
                <select
                  value={options.gridSize}
                  onChange={(e) => set('gridSize', Number(e.target.value))}
                  className="field h-9 w-auto py-1"
                >
                  <option value={2}>4 (2×2)</option>
                  <option value={3}>9 (3×3)</option>
                  <option value={4}>16 (4×4)</option>
                </select>
              </label>
            )}

            <label className="flex items-center gap-3 px-2 py-2 text-sm text-muted">
              <span className="shrink-0">Limite par métier</span>
              <select
                value={options.maxPerDomain}
                onChange={(e) => set('maxPerDomain', Number(e.target.value))}
                className="field h-9 w-auto py-1"
              >
                <option value={0}>Toutes les fiches</option>
                <option value={20}>20 fiches</option>
                <option value={50}>50 fiches</option>
                <option value={100}>100 fiches</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
