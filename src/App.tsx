import { useCallback, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, NavLink, Outlet, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, History, Inbox, Layers, Menu, PhoneCall, Search, Settings, Star, ThumbsDown, ArrowRight, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { PeopleMatch, SearchRecord, Workspace } from '../shared/types';
import { api, setApiWorkspace } from './api';
import { RequireAuth, useAuth } from './auth';
import { MetaContext, useMetaState, useStored } from './hooks';
import { CommandPalette } from './components/CommandPalette';
import { InviteInbox } from './components/InviteInbox';
import { BrandMark } from './components/BrandMark';
import { LogoFlight } from './components/LogoFlight';
import { LogoutButton } from './components/LogoutButton';
import { GUIDE_STEPS, GUIDE_STORAGE_KEY, MascotGuide, type GuideStep } from './components/MascotGuide';
import { SettingsLink } from './components/SettingsLink';
import { UserAvatar } from './components/UserAvatar';
import { ThemeToggle, ToastProvider, cx } from './components/ui';
import { AuthPage } from './pages/AuthPage';
import { CallsPage } from './pages/CallsPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HistoryPage } from './pages/HistoryPage';
import { LandingPage } from './pages/LandingPage';
import { LegalPage } from './pages/LegalPage';
import { PipelinePage } from './pages/PipelinePage';
import { SearchPage } from './pages/SearchPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsernamePage } from './pages/UsernamePage';
import { sessionPath } from './workspace';
import { useAppEnter } from './lib/nav';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  hint: string;
  end?: boolean;
}

function InviteField({
  workspaceId,
  onInvited,
}: {
  workspaceId: number;
  onInvited?: (workspace: Workspace) => void;
}) {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [matches, setMatches] = useState<PeopleMatch[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .searchPeople(term)
        .then((data) => setMatches(data.people))
        .catch(() => setMatches([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setInfo(null);
    try {
      const looked = await api.lookupPerson(query);
      const invited = await api.inviteToWorkspace(workspaceId, looked.email);
      setQuery('');
      setMatches([]);
      setOpen(false);
      onInvited?.(invited.workspace);
      setInfo(looked.found ? 'Invitation envoyée dans l’app.' : 'Pas encore de compte : l’invitation l’attendra.');
    } catch (err) {
      setInfo(err instanceof Error ? err.message : 'Invitation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form ref={boxRef} onSubmit={(event) => void send(event)} className="space-y-1.5" data-guide="invite">
      <div className="relative">
        <input
          type="text"
          required
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Inviter (e-mail ou pseudo)"
          className="field h-8 pr-8 text-[11px]"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={busy}
          aria-label={busy ? 'Envoi…' : 'Inviter'}
          className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-1 text-lime-deep disabled:opacity-40"
        >
          <ArrowRight className="size-3.5" />
        </button>
        {open && matches.length > 0 && (
          <ul className="absolute right-0 bottom-[calc(100%+4px)] left-0 z-20 overflow-hidden rounded-lg border border-rule bg-card shadow-[var(--shadow-float)]">
            {matches.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-card-2"
                  onClick={() => {
                    setQuery(person.username);
                    setOpen(false);
                  }}
                >
                  <UserAvatar username={person.username} avatarUrl={person.avatarUrl} size={22} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-semibold">{person.username}</span>
                    <span className="block truncate text-[10px] text-faint">{person.email}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {info && <p className="text-[10px] leading-snug text-faint">{info}</p>}
    </form>
  );
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
      <BrandMark alt="" className="h-full w-full" />
    </Link>
  );
}

function Sidebar({
  items,
  open,
  onClose,
  onCommand,
  logoRef,
  sessionName,
  workspaceId,
  onWorkspaceChange,
}: {
  items: NavItem[];
  open: boolean;
  onClose: () => void;
  onCommand: () => void;
  logoRef: RefObject<HTMLAnchorElement | null>;
  sessionName?: string;
  workspaceId?: number;
  onWorkspaceChange?: (workspace: Workspace) => void;
}) {
  const { user } = useAuth();

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
          'app-sidebar fixed inset-y-0 left-0 z-40 flex w-[min(16.5rem,100vw)] flex-col',
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
          {items.map(({ to, label, icon: Icon, count, hint, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={hint}
              data-guide={to.endsWith('/a-trier') ? 'pipeline' : undefined}
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
            <Search className="size-3.5" />
            Aller à…
            <span className="ml-auto font-mono text-[10px] tracking-wider">Ctrl K</span>
          </button>

          <div className="flex items-center justify-between gap-2">
            <span className="legend">apparence</span>
            <ThemeToggle compact />
          </div>

          {user && (
            <div className="space-y-2">
              {sessionName && <p className="truncate text-[11px] font-semibold text-ink">{sessionName}</p>}
              {workspaceId ? <InviteField workspaceId={workspaceId} onInvited={onWorkspaceChange} /> : null}
              <div className="min-w-0 space-y-1">
                <SettingsLink
                  className="flex min-w-0 items-center gap-2 rounded-lg px-0.5 py-0.5 hover:bg-card-2"
                  title="Réglages du compte"
                >
                  <UserAvatar username={user.username} avatarUrl={user.avatarUrl} size={24} />
                  <span className="truncate text-[11px] text-faint">{user.username || user.email}</span>
                  <Settings className="size-3 shrink-0 text-faint" />
                </SettingsLink>
                <LogoutButton className="block w-full px-0.5 text-left" />
              </div>
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
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const id = Number(workspaceId);
  if (Number.isInteger(id) && id > 0) setApiWorkspace(id);
  const metaState = useMetaState();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
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
      if (upcoming === 'pipeline' || upcoming === 'invite') setMenuOpen(true);
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
      navigate(sessionPath(id));
    }
    if (guideTarget === 'pipeline' || guideTarget === 'invite') setMenuOpen(true);
  }, [guideTarget, navigate, id]);

  useEffect(() => {
    setApiWorkspace(id);
    if (!Number.isInteger(id) || id <= 0) return;
    metaState.refreshMeta();
    api
      .workspace(id)
      .then((data) => setWorkspace(data.workspace))
      .catch(() => navigate('/app', { replace: true }));
  }, [id, navigate, metaState.refreshMeta]);

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
    { to: '/app', label: 'Sessions', icon: Layers, hint: 'Changer de session', end: true },
    { to: sessionPath(id), label: 'Recherche', icon: Search, hint: 'Lancer une nouvelle prospection', end: true },
    {
      to: sessionPath(id, '/a-trier'),
      label: 'À trier',
      icon: Inbox,
      count: stats?.nouveau,
      hint: 'Entreprises trouvées, pas encore classées',
    },
    {
      to: sessionPath(id, '/appels'),
      label: 'Appels',
      icon: PhoneCall,
      count: (stats?.favori ?? 0) + (stats?.nouveau ?? 0),
      hint: 'Session d’appels, une fiche à la fois',
    },
    { to: sessionPath(id, '/favoris'), label: 'Favoris', icon: Star, count: stats?.favori, hint: 'À appeler' },
    { to: sessionPath(id, '/signes'), label: 'Signés', icon: Check, count: stats?.termine, hint: 'Clients conclus' },
    {
      to: sessionPath(id, '/non-conclus'),
      label: 'Non conclus',
      icon: ThumbsDown,
      count: stats?.perdu,
      hint: 'Écartés des prochaines recherches',
    },
    { to: sessionPath(id, '/historique'), label: 'Historique', icon: History, count: stats?.searches, hint: 'Recherches passées' },
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
          sessionName={workspace?.name}
          workspaceId={id}
          onWorkspaceChange={setWorkspace}
        />
        <LogoFlight sourceRef={logoRef} guideTarget={guideTarget} />
        <MascotGuide step={guideTarget} onNext={nextGuide} onSkip={finishGuide} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} workspaceId={id} />

        <div className="relative z-[1] lg:pl-[16.5rem]">
          <header className="app-mobile-bar sticky top-0 z-20 flex min-h-16 items-center gap-3 px-3 lg:hidden">
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

          <main className="mx-auto max-w-5xl px-3 py-5 sm:px-8 lg:py-12">
            <Outlet />
          </main>
        </div>
      </div>
    </MetaContext.Provider>
  );
}

function HistoryOutlet() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const [, setCity] = useStored('wegeo.city', '');
  const [, setDomains] = useStored<string[]>('wegeo.domains', []);
  const [, setOptions] = useStored('wegeo.options', {});

  const replay = useCallback(
    (search: SearchRecord) => {
      setCity(search.city);
      setDomains(search.domains);
      setOptions(search.options);
      navigate(sessionPath(workspaceId ?? ''));
    },
    [navigate, setCity, setDomains, setOptions, workspaceId],
  );

  return <HistoryPage onReplay={replay} />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/confidentialite" element={<LegalPage kind="privacy" />} />
      <Route path="/cgu" element={<LegalPage kind="terms" />} />
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
        path="/app/pseudo"
        element={
          <RequireAuth>
            <UsernamePage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/compte"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <SessionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/app/s/:workspaceId"
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
        <Route path="appels" element={<CallsPage />} />
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
  useAppEnter();
  return (
    <ToastProvider>
      <InviteInbox />
      <AppRoutes />
    </ToastProvider>
  );
}
