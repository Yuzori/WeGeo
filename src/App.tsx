import { useCallback, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { Check, History, Inbox, Menu, Radar, Star, ThumbsDown, X } from 'lucide-react';
import type { SearchRecord } from '../shared/types';
import { MetaContext, useMetaState, useStored } from './hooks';
import { ThemeToggle, ToastProvider, cx } from './components/ui';
import { SearchPage } from './pages/SearchPage';
import { PipelinePage } from './pages/PipelinePage';
import { HistoryPage } from './pages/HistoryPage';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Radar;
  count?: number;
  hint: string;
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="brand-gradient relative flex size-9 items-center justify-center rounded-2xl text-white shadow-[var(--shadow-soft)]">
        <svg viewBox="0 0 32 32" className="size-5" aria-hidden>
          <path
            d="M16 5.5c-4.1 0-7.5 3.3-7.5 7.4C8.5 18.6 16 27 16 27s7.5-8.4 7.5-14.1c0-4.1-3.4-7.4-7.5-7.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="12.8" r="2.5" fill="currentColor" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] leading-tight font-semibold tracking-tight text-text">WeGeo</span>
        <span className="block text-[11px] leading-tight text-subtle">Prospection locale</span>
      </span>
    </div>
  );
}

function Sidebar({ items, open, onClose }: { items: NavItem[]; open: boolean; onClose: () => void }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[hsl(var(--shadow-color)/0.4)] backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-line bg-surface',
          'transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[4.5rem] items-center px-5">
          <Wordmark />
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="ml-auto rounded-lg p-1.5 text-subtle transition hover:bg-surface-3 hover:text-text lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="scroll-slim flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map(({ to, label, icon: Icon, count, hint }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              title={hint}
              className={({ isActive }) =>
                cx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                  'transition-all duration-200',
                  isActive
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-muted hover:bg-surface-3 hover:text-text',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Repère latéral de l'onglet actif */}
                  <span
                    className={cx(
                      'absolute top-1/2 -left-3 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent transition-all duration-300',
                      isActive ? 'opacity-100' : 'scale-y-0 opacity-0',
                    )}
                    aria-hidden
                  />
                  <Icon
                    className={cx(
                      'size-[1.05rem] shrink-0 transition-colors',
                      isActive ? 'text-accent-text' : 'text-subtle group-hover:text-muted',
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={cx(
                        'tnum rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors',
                        isActive ? 'bg-accent text-accent-contrast' : 'bg-surface-3 text-subtle',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 border-t border-line px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted">Apparence</span>
            <ThemeToggle />
          </div>
          <p className="text-[11px] leading-relaxed text-subtle">
            Vos données restent sur cet ordinateur. Aucune clé d’API n’est nécessaire.
          </p>
        </div>
      </aside>
    </>
  );
}

function AppShell() {
  const metaState = useMetaState();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  const [, setCity] = useStored('wegeo.city', '');
  const [, setDomains] = useStored<string[]>('wegeo.domains', []);
  const [, setOptions] = useStored('wegeo.options', {});

  /** Rejouer une recherche depuis l'historique : on préremplit le formulaire. */
  const replay = useCallback(
    (search: SearchRecord) => {
      setCity(search.city);
      setDomains(search.domains);
      setOptions(search.options);
      navigate('/');
    },
    [navigate, setCity, setDomains, setOptions],
  );

  const stats = metaState.meta?.stats;
  const items: NavItem[] = [
    { to: '/', label: 'Recherche', icon: Radar, hint: 'Lancer une nouvelle prospection' },
    {
      to: '/a-trier',
      label: 'À trier',
      icon: Inbox,
      count: stats?.nouveau,
      hint: 'Entreprises trouvées, pas encore classées',
    },
    { to: '/favoris', label: 'Favoris', icon: Star, count: stats?.favori, hint: 'À appeler' },
    { to: '/signes', label: 'Signés', icon: Check, count: stats?.termine, hint: 'Clients conclus' },
    {
      to: '/non-conclus',
      label: 'Non conclus',
      icon: ThumbsDown,
      count: stats?.perdu,
      hint: 'Écartés des prochaines recherches',
    },
    { to: '/historique', label: 'Historique', icon: History, count: stats?.searches, hint: 'Recherches passées' },
  ];

  return (
    <MetaContext.Provider value={metaState}>
      <Sidebar items={items} open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="lg:pl-[17rem]">
        <header className="surface-blur sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line px-4 lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Ouvrir le menu"
            className="rounded-lg p-2 text-muted transition hover:bg-surface-3"
          >
            <Menu className="size-5" />
          </button>
          <Wordmark />
        </header>

        <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-12">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route
              path="/a-trier"
              element={
                <PipelinePage
                  status="nouveau"
                  title="À trier"
                  description="Toutes les entreprises trouvées lors de vos recherches, en attente de tri."
                  icon={<Inbox className="size-7" />}
                  emptyTitle="Rien à trier"
                  emptyDescription="Les entreprises trouvées pendant une recherche arrivent ici jusqu’à ce que vous les mettiez en favori ou que vous les écartiez."
                />
              }
            />
            <Route
              path="/favoris"
              element={
                <PipelinePage
                  status="favori"
                  title="Favoris"
                  description="Votre liste d’appels. Appelez, puis classez chaque fiche en « signé » ou « non conclu »."
                  icon={<Star className="size-7" />}
                  emptyTitle="Aucun favori pour l’instant"
                  emptyDescription="Pendant une recherche, cliquez sur l’étoile des entreprises intéressantes : elles arrivent ici, prêtes à être appelées."
                />
              }
            />
            <Route
              path="/signes"
              element={
                <PipelinePage
                  status="termine"
                  title="Signés"
                  description="Les affaires conclues. Elles ne réapparaîtront plus dans vos recherches."
                  icon={<Check className="size-7" />}
                  emptyTitle="Aucun client signé"
                  emptyDescription="Marquez une fiche comme signée depuis vos favoris et elle se rangera ici."
                  restoreMode
                />
              }
            />
            <Route
              path="/non-conclus"
              element={
                <PipelinePage
                  status="perdu"
                  title="Non conclus"
                  description="Les entreprises contactées sans succès. Elles sont exclues des prochaines recherches."
                  icon={<ThumbsDown className="size-7" />}
                  emptyTitle="Aucune fiche écartée"
                  emptyDescription="Après un appel infructueux, marquez la fiche « non conclu » : elle ne polluera plus vos résultats."
                  restoreMode
                />
              }
            />
            <Route path="/historique" element={<HistoryPage onReplay={replay} />} />
          </Routes>
        </main>
      </div>
    </MetaContext.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}
