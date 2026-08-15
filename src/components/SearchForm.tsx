import { useEffect, useState, type KeyboardEvent } from 'react';
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

/** Confirme la commune retenue pour le quadrillage (plusieurs villes sont homonymes). */
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
    <p className="flex items-start gap-1.5 px-2 text-xs text-subtle sm:col-span-2">
      {state.loading ? (
        <>
          <Spinner className="mt-0.5 size-3" /> Localisation de la zone…
        </>
      ) : state.label ? (
        <>
          <MapPin className="mt-0.5 size-3 shrink-0 text-accent-text" />
          <span>
            Zone retenue : <strong className="font-medium text-muted">{state.label}</strong>
          </span>
        </>
      ) : (
        <>
          <MapPin className="mt-0.5 size-3 shrink-0" />
          Commune introuvable : la recherche se fera sans quadrillage. Précisez le département ou le code postal.
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

  const addDomain = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (!clean) return;
    if (!domains.includes(clean)) onDomains([...domains, clean]);
    setDraft('');
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
    <section className="relative">
      {/* Halo derrière le panneau de recherche */}
      <div
        className="absolute -inset-x-4 -top-6 -bottom-2 -z-10 rounded-[2rem] bg-accent-soft/60 blur-2xl"
        aria-hidden
      />

      <div className="card relative overflow-hidden p-5 shadow-[var(--shadow-lift)] sm:p-6">
        {/* Filet dégradé : signale le point de départ de l'application. */}
        <span
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400 to-transparent"
          aria-hidden
        />

        <div className="grid gap-4 lg:grid-cols-[minmax(0,17rem)_1fr_auto] lg:items-start">
          {/* Ville */}
          <div>
            <label className="label" htmlFor="ville">
              Ville ou zone
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
              <input
                id="ville"
                list="villes-connues"
                value={city}
                onChange={(e) => onCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !running && onStart()}
                placeholder="Annecy, 74000…"
                autoComplete="off"
                className="input h-11 pl-10"
              />
              <datalist id="villes-connues">
                {knownCities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Métiers */}
          <div>
            <label className="label" htmlFor="metier">
              Métiers à rechercher
              {domains.length > 0 && (
                <span className="ml-1 text-accent-text normal-case">· {domains.length} sélectionné{domains.length > 1 ? 's' : ''}</span>
              )}
            </label>
            <div
              className={cx(
                'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-surface p-1.5',
                'transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_14%,transparent)]',
              )}
            >
              {domains.map((domain) => (
                <span
                  key={domain}
                  className="animate-pop inline-flex items-center gap-1 rounded-lg bg-accent-soft py-1 pr-1 pl-2.5 text-xs font-medium text-accent-text"
                >
                  {domain}
                  <button
                    type="button"
                    onClick={() => onDomains(domains.filter((d) => d !== domain))}
                    aria-label={`Retirer ${domain}`}
                    className="rounded-md p-0.5 opacity-60 transition hover:bg-accent-line hover:opacity-100"
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
                placeholder={domains.length ? 'Ajouter…' : 'coiffeur, plombier, restaurant…'}
                autoComplete="off"
                className="min-w-[9rem] flex-1 bg-transparent px-2 py-1 text-sm text-text outline-none placeholder:text-subtle"
              />
            </div>
          </div>

          {/* Lancement */}
          <div className="flex gap-2 lg:pt-[1.65rem]">
            {running ? (
              <Button
                variant="secondary"
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
                Rechercher
              </Button>
            )}
          </div>
        </div>

        {/* Suggestions de métiers */}
        {available.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-xs font-medium text-subtle">Suggestions</span>
            {available.slice(0, 10).map((domain) => (
              <button
                key={domain}
                type="button"
                onClick={() => addDomain(domain)}
                className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-muted transition-all duration-150 hover:-translate-y-px hover:border-accent-line hover:bg-accent-soft hover:text-accent-text"
              >
                <Plus className="size-3 opacity-60" />
                {domain}
              </button>
            ))}
          </div>
        )}

        {/* Options avancées */}
        <div className="mt-5 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-accent-text"
          >
            <SlidersHorizontal className="size-3.5" />
            Options de recherche
            <span className="tnum rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-subtle">{activeCount}</span>
            <ChevronDown className={cx('size-3.5 transition-transform duration-300', showOptions && 'rotate-180')} />
          </button>

          {showOptions && (
            <div className="animate-in mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
              <Toggle
                checked={options.onlyWithoutWebsite}
                onChange={(v) => set('onlyWithoutWebsite', v)}
                label="Uniquement sans site web"
                hint="Le cœur de WeGeo : on écarte les entreprises déjà équipées."
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
                <>
                  <label className="flex items-center gap-3 px-2 py-2 text-sm text-muted">
                    <span className="shrink-0">Secteurs</span>
                    <select
                      value={options.gridSize}
                      onChange={(e) => set('gridSize', Number(e.target.value))}
                      className="input h-9 w-auto py-1"
                    >
                      <option value={2}>4 (2×2)</option>
                      <option value={3}>9 (3×3)</option>
                      <option value={4}>16 (4×4)</option>
                    </select>
                  </label>
                  <ResolvedZone city={city} />
                </>
              )}

              <label className="flex items-center gap-3 px-2 py-2 text-sm text-muted">
                <span className="shrink-0">Limite par métier</span>
                <select
                  value={options.maxPerDomain}
                  onChange={(e) => set('maxPerDomain', Number(e.target.value))}
                  className="input h-9 w-auto py-1"
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
      </div>
    </section>
  );
}
