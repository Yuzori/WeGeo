import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, History, Inbox, Menu, Radar, Star, ThumbsDown, X } from 'lucide-react';
import type { SearchRecord } from '../shared/types';
import { api } from './api';
import { RequireAuth, useAuth } from './auth';
import { MetaContext, useMetaState, useStored } from './hooks';
import { CommandPalette } from './components/CommandPalette';
import { LogoFlight } from './components/LogoFlight';
import { GUIDE_STEPS, GUIDE_STORAGE_KEY, MascotGuide, type GuideStep } from './components/MascotGuide';
import { ThemeToggle, ToastProvider, cx } from './components/ui';
import { AuthPage } from './pages/AuthPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HistoryPage } from './pages/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { PipelinePage } from './pages/PipelinePage';
import { SearchPage } from './pages/SearchPage';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Radar;
  count?: number;
  hint: string;
}

function Wordmark({
  markRef,
  mobile,
}: {
  markRef?: RefObject<HTMLAnchorElement | null>;
  mobile?: boolean;
}) {
  return (
    <Link
      to="/app"
      ref={markRef}
      aria-label="Prospy"
      className={cx('app-logo-slot', mobile && 'app-logo-slot-mobile')}
    >
      <img src="/prospy.png" alt="" className="h-full w-full object-contain" />
    </Link>
  );
}

function Sidebar({
  items,
  open,
  onClose,
  onCommand,
  logoRef,
}: {
  items: NavItem[];
  open: boolean;
  onClose: () => void;
  onCommand: () => void;
  logoRef: RefObject<HTMLAnchorElement | null>;
}) {
  const { user, setUser } = useAuth();

  const logout = async () => {
    await api.logout().catch(() => {});
    setUser(null);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-[hsl(var(--shade)/0.45)] backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cx(
          'app-sidebar fixed inset-y-0 left-0 z-40 flex w-[16.5rem] flex-col',
          'transition-transform duration-300 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-[4.25rem] items-center px-4">
          <Wordmark markRef={logoRef} />
          <button
            onClick={onClose}
            aria-label="Fermer le menu"
            className="ml-auto rounded-full p-1.5 text-faint transition hover:bg-card-2 hover:text-ink lg:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {items.map(({ to, label, icon: Icon, count, hint }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/app'}
              onClick={onClose}
              title={hint}
              data-guide={to === '/app/a-trier' ? 'pipeline' : undefined}
              className={({ isActive }) =>
                cx(
                  'app-nav-link group relative flex items-center gap-2.5 px-2.5 py-2',
                  isActive && 'is-active',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cx(
                      'size-4 shrink-0',
                      isActive ? 'text-lime-deep' : 'text-faint group-hover:text-ink',
                    )}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  {count !== undefined && count > 0 && (
                    <span
                      className={cx(
                        'tnum rounded border px-1 py-px text-[11px] font-semibold transition-colors',
                        isActive
                          ? 'border-lime-line bg-card text-lime-deep'
                          : 'border-transparent bg-card-2 text-faint',
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

        <div className="space-y-3 border-t border-[var(--lp-line)] px-4 py-3.5">
          <button
            type="button"
            onClick={onCommand}
            className="flex w-full items-center gap-2 rounded-full border border-[var(--lp-line)] bg-[color-mix(in_oklab,var(--lp-surface)_70%,transparent)] px-2.5 py-1.5 text-xs text-faint transition hover:border-lime-line hover:text-ink"
          >
            <Radar className="size-3.5" />
            Aller à…
            <span className="ml-auto font-mono text-[10px] tracking-wider">Ctrl K</span>
          </button>

          <div className="flex items-center justify-between gap-2">
            <span className="legend">apparence</span>
            <ThemeToggle compact />
          </div>

          {user && (
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] text-faint" title={user.email}>
                {user.email}
              </span>
              <button type="button" onClick={() => void logout()} className="text-[11px] font-medium text-muted hover:text-ink">
                Sortir
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function CheckoutReturn() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();

  useEffect(() => {
    const sessionId = params.get('session_id');
    if (params.get('checkout') !== 'success' || !sessionId) return;
    api
      .confirmCheckout(sessionId)
      .then(() => refresh())
      .catch(() => {});
  }, [params, refresh]);

  return null;
}

function SubscriptionBanner() {
  const { user } = useAuth();
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    api
      .billingConfig()
      .then((config) => setNeeded(config.configured))
      .catch(() => {});
  }, []);

  if (!needed || !user) return null;
  if (user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing') return null;

  return (
    <div className="border-b border-lime-line bg-lime-soft px-4 py-2 text-sm">
      Un abonnement actif est requis pour lancer un relevé.{' '}
      <Link to="/abonnement" className="font-semibold text-lime-deep">
        Choisir une offre
      </Link>
    </div>
  );
}

function AppShell() {
  const metaState = useMetaState();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const logoRef = useRef<HTMLAnchorElement>(null);
  const [guideIndex, setGuideIndex] = useState<number | null>(() => {
    try {
      return localStorage.getItem(GUIDE_STORAGE_KEY) ? null : 0;
    } catch {
      return 0;
    }
  });

  const guideTarget: GuideStep | null = guideIndex == null ? null : GUIDE_STEPS[guideIndex];

  const finishGuide = useCallback(() => {
    try {
      localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    } catch {
      /* ignore quota / private mode */
    }
    setGuideIndex(null);
    setMenuOpen(false);
  }, []);

  const nextGuide = useCallback(() => {
    setGuideIndex((current) => {
      if (current == null) return null;
      const upcoming = GUIDE_STEPS[current + 1];
      if (upcoming === 'pipeline') setMenuOpen(true);
      if (current >= GUIDE_STEPS.length - 1) {
        try {
          localStorage.setItem(GUIDE_STORAGE_KEY, '1');
        } catch {
          /* ignore */
        }
        setMenuOpen(false);
        return null;
      }
      return current + 1;
    });
  }, []);

  useEffect(() => {
    if (!guideTarget) return;
    if (guideTarget === 'search' || guideTarget === 'launch' || guideTarget === 'results') {
      navigate('/app');
    }
    if (guideTarget === 'pipeline') setMenuOpen(true);
  }, [guideTarget, navigate]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === 'Escape' && guideTarget) {
        event.preventDefault();
        finishGuide();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [guideTarget, finishGuide]);

  const stats = metaState.meta?.stats;
  const items: NavItem[] = [
    { to: '/app', label: 'Recherche', icon: Radar, hint: 'Lancer une nouvelle prospection' },
    {
      to: '/app/a-trier',
      label: 'À trier',
      icon: Inbox,
      count: stats?.nouveau,
      hint: 'Entreprises trouvées, pas encore classées',
    },
    { to: '/app/favoris', label: 'Favoris', icon: Star, count: stats?.favori, hint: 'À appeler' },
    { to: '/app/signes', label: 'Signés', icon: Check, count: stats?.termine, hint: 'Clients conclus' },
    {
      to: '/app/non-conclus',
      label: 'Non conclus',
      icon: ThumbsDown,
      count: stats?.perdu,
      hint: 'Écartés des prochaines recherches',
    },
    { to: '/app/historique', label: 'Historique', icon: History, count: stats?.searches, hint: 'Recherches passées' },
  ];

  return (
    <MetaContext.Provider value={metaState}>
      <div className="app-shell">
        <CheckoutReturn />
        <Sidebar
          items={items}
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onCommand={() => setPaletteOpen(true)}
          logoRef={logoRef}
        />
        <LogoFlight sourceRef={logoRef} guideTarget={guideTarget} />
        <MascotGuide step={guideTarget} onNext={nextGuide} onSkip={finishGuide} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

        <div className="relative z-[1] lg:pl-[16.5rem]">
          <header className="app-mobile-bar sticky top-0 z-20 flex h-16 items-center gap-3 px-4 lg:hidden">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              className="rounded-full p-2 text-muted transition hover:bg-card-2"
            >
              <Menu className="size-5" />
            </button>
            <Wordmark mobile />
          </header>

          <SubscriptionBanner />

          <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:py-12">
            <Outlet />
          </main>
        </div>
      </div>
    </MetaContext.Provider>
  );
}

function HistoryOutlet() {
  const navigate = useNavigate();
  const [, setCity] = useStored('wegeo.city', '');
  const [, setDomains] = useStored<string[]>('wegeo.domains', []);
  const [, setOptions] = useStored('wegeo.options', {});

  const replay = useCallback(
    (search: SearchRecord) => {
      setCity(search.city);
      setDomains(search.domains);
      setOptions(search.options);
      navigate('/app');
    },
    [navigate, setCity, setDomains, setOptions],
  );

  return <HistoryPage onReplay={replay} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/connexion" element={<AuthPage mode="login" />} />
      <Route path="/inscription" element={<AuthPage mode="register" />} />
      <Route path="/mot-de-passe-oublie" element={<AuthPage mode="forgot" />} />
      <Route
        path="/abonnement"
        element={
          <RequireAuth>
            <CheckoutPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<SearchPage />} />
        <Route
          path="a-trier"
          element={
            <PipelinePage
              status="nouveau"
              title="À trier"
              description="Toutes les entreprises trouvées lors de vos recherches, en attente de tri."
              icon={<Inbox className="size-6" />}
              emptyTitle="Rien à trier"
              emptyDescription="Les entreprises trouvées pendant une recherche arrivent ici jusqu’à ce que vous les mettiez en favori ou que vous les écartiez."
            />
          }
        />
        <Route
          path="favoris"
          element={
            <PipelinePage
              status="favori"
              title="Favoris"
              description="Votre liste d’appels. Appelez, puis classez chaque fiche en « signé » ou « non conclu »."
              icon={<Star className="size-6" />}
              emptyTitle="Aucun favori pour l’instant"
              emptyDescription="Pendant une recherche, cliquez sur l’étoile des entreprises intéressantes : elles arrivent ici, prêtes à être appelées."
            />
          }
        />
        <Route
          path="signes"
          element={
            <PipelinePage
              status="termine"
              title="Signés"
              description="Les affaires conclues. Elles ne réapparaîtront plus dans vos recherches."
              icon={<Check className="size-6" />}
              emptyTitle="Aucun client signé"
              emptyDescription="Marquez une fiche comme signée depuis vos favoris et elle se rangera ici."
              restoreMode
            />
          }
        />
        <Route
          path="non-conclus"
          element={
            <PipelinePage
              status="perdu"
              title="Non conclus"
              description="Les entreprises contactées sans succès. Elles sont exclues des prochaines recherches."
              icon={<ThumbsDown className="size-6" />}
              emptyTitle="Aucune fiche écartée"
              emptyDescription="Après un appel infructueux, marquez la fiche « non conclu » : elle ne polluera plus vos résultats."
              restoreMode
            />
          }
        />
        <Route path="historique" element={<HistoryOutlet />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppRoutes />
    </ToastProvider>
  );
}
