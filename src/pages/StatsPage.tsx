import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Globe2,
  Lock,
  MapPin,
  Radio,
  RefreshCw,
  TrendingDown,
  Users,
} from 'lucide-react';
import { BrandMark } from '../components/BrandMark';
import { StatsWorldMap } from '../components/StatsWorldMap';
import { UserAvatar } from '../components/UserAvatar';
import { cx } from '../components/ui';
import { api, type SiteStats, type StatsAccount } from '../api';

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <article className={cx('stats-card', accent && 'stats-card--accent')}>
      <p className="stats-card-label">{label}</p>
      <p className="stats-card-value">{value}</p>
      {hint && <p className="stats-card-hint">{hint}</p>}
    </article>
  );
}

function planLabel(plan: string | null): string {
  if (!plan) return '—';
  if (plan === 'agence') return 'Agence';
  if (plan === 'pro') return 'Pro';
  if (plan === 'starter') return 'Starter';
  return plan;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    active: 'Actif',
    trialing: 'Essai',
    incomplete: 'Incomplet',
    past_due: 'Impayé',
    canceled: 'Annulé',
    none: 'Aucun',
  };
  return map[status] ?? status;
}

function AccountRow({ account }: { account: StatsAccount }) {
  return (
    <tr>
      <td>
        <div className="stats-user-cell">
          <UserAvatar username={account.username} avatarUrl={account.avatarUrl} size={34} />
          <div>
            <strong>{account.username || '—'}</strong>
            <span>{account.email}</span>
          </div>
        </div>
      </td>
      <td>
        <span className="stats-pill">{planLabel(account.plan)}</span>
        <span className="stats-muted">{statusLabel(account.subscriptionStatus)}</span>
      </td>
      <td>
        {account.geo.label ? (
          <span className="stats-geo">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            {account.geo.label}
          </span>
        ) : (
          <span className="stats-muted">Inconnue</span>
        )}
      </td>
      <td>{new Date(account.createdAt).toLocaleDateString('fr-FR')}</td>
      <td>{account.lastSeenAt ? new Date(account.lastSeenAt).toLocaleString('fr-FR') : '—'}</td>
      <td>
        <div className="stats-tags">
          {account.emailVerified && <span className="stats-tag">Vérifié</span>}
          {account.googleLinked && <span className="stats-tag">Google</span>}
          {account.needsUsername && <span className="stats-tag stats-tag--warn">Pseudo</span>}
        </div>
      </td>
    </tr>
  );
}

export function StatsPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [globeMode, setGlobeMode] = useState<'live' | 'all'>('live');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const loadStats = () => {
    setLoading(true);
    setError(null);
    api
      .siteStats()
      .then((data) => {
        setStats(data);
        setAuthed(true);
      })
      .catch((err) => {
        setAuthed(false);
        setError(err instanceof Error ? err.message : 'Impossible de charger les stats.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    if (!authed || !autoRefresh) return;
    const timer = window.setInterval(loadStats, 15000);
    return () => window.clearInterval(timer);
  }, [authed, autoRefresh]);

  const globePoints = useMemo(() => {
    if (!stats) return [];
    return globeMode === 'live' ? stats.globe.live : stats.globe.all;
  }, [stats, globeMode]);

  const funnelMax = useMemo(() => {
    if (!stats?.funnel.length) return 1;
    return Math.max(1, ...stats.funnel.map((row) => row.visitors));
  }, [stats]);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setLoginError(null);
    try {
      await api.statsLogin(password);
      setAuthed(true);
      loadStats();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Mot de passe incorrect.');
    }
  };

  if (authed === null && loading) {
    return (
      <div className="stats-page">
        <p className="stats-loading">Chargement…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="stats-page stats-page--gate">
        <div className="stats-gate">
          <Link to="/" className="stats-back">
            <ArrowLeft className="size-4" aria-hidden />
            Accueil
          </Link>
          <BrandMark alt="Prospy" className="stats-logo" />
          <h1 className="stats-gate-title">Statistiques Prospy</h1>
          <p className="stats-gate-lead">Accès réservé.</p>
          <form className="stats-gate-form" onSubmit={(event) => void onLogin(event)}>
            <label className="stats-gate-label">
              Mot de passe
              <input
                type="password"
                className="field"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {loginError && <p className="stats-error">{loginError}</p>}
            <button type="submit" className="stats-gate-btn">
              <Lock className="size-4" aria-hidden />
              Entrer
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-page">
      <div className="stats-shell">
        <header className="stats-header">
          <div>
            <Link to="/" className="stats-back">
              <ArrowLeft className="size-4" aria-hidden />
              Accueil
            </Link>
            <h1 className="stats-title">Tableau de bord Prospy</h1>
            {stats && (
              <p className="stats-updated">
                Mis à jour {new Date(stats.generatedAt).toLocaleString('fr-FR')}
                {autoRefresh && <span className="stats-live-dot"> · live</span>}
              </p>
            )}
          </div>
          <div className="stats-header-actions">
            <label className="stats-toggle">
              <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
              Auto 15s
            </label>
            <button type="button" className="stats-refresh" onClick={loadStats} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Actualiser
            </button>
          </div>
        </header>

        {error && <p className="stats-error">{error}</p>}

        {stats && (
          <>
            <section className="stats-hero">
              <div className="stats-hero-copy">
                <p className="stats-kicker">
                  <Radio className="size-4" aria-hidden />
                  {stats.visits.liveNow} en ligne · {stats.visits.uniqueVisitors} visiteurs uniques
                </p>
                <h2 className="stats-hero-title">Connexions sur la carte</h2>
                <p className="stats-hero-lead">
                  Carte OpenStreetMap réelle — zoomez jusqu&apos;à la rue. Chaque point lime est une visite géolocalisée.
                </p>
                <div className="stats-globe-tabs" role="tablist" aria-label="Mode globe">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globeMode === 'live'}
                    className={cx('stats-globe-tab', globeMode === 'live' && 'is-on')}
                    onClick={() => setGlobeMode('live')}
                  >
                    <Radio className="size-4" aria-hidden />
                    En direct ({stats.globe.live.length})
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={globeMode === 'all'}
                    className={cx('stats-globe-tab', globeMode === 'all' && 'is-on')}
                    onClick={() => setGlobeMode('all')}
                  >
                    <Globe2 className="size-4" aria-hidden />
                    Tout ({stats.globe.all.length})
                  </button>
                </div>
                <div className="stats-cards stats-cards--compact">
                  <StatCard label="Pages vues" value={stats.visits.pageviews} accent />
                  <StatCard label="Aujourd'hui" value={stats.visits.pageviewsToday} />
                  <StatCard label="7 jours" value={stats.visits.pageviewsWeek} />
                </div>
              </div>
              <div className="stats-hero-globe">
                <StatsWorldMap points={globePoints} live={globeMode === 'live'} fitKey={globeMode} />
              </div>
            </section>

            <section className="stats-section stats-section--wide">
              <h2 className="stats-section-title">
                <Users className="size-5" aria-hidden />
                Comptes créés ({stats.accounts.length})
              </h2>
              <div className="stats-table-wrap">
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th>Utilisateur</th>
                      <th>Abonnement</th>
                      <th>Zone</th>
                      <th>Inscription</th>
                      <th>Dernière visite</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.accounts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="stats-empty">
                          Aucun compte pour l&apos;instant.
                        </td>
                      </tr>
                    ) : (
                      stats.accounts.map((account) => <AccountRow key={account.id} account={account} />)
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="stats-grid">
              <section className="stats-section">
                <h2 className="stats-section-title">Entonnoir</h2>
                <p className="stats-section-lead">Nombre de visiteurs uniques à chaque étape — pas un pourcentage global.</p>
                <div className="stats-funnel">
                  {stats.funnel.map((row, index) => (
                    <div className="stats-funnel-row" key={row.step}>
                      <div className="stats-funnel-head">
                        <span className="stats-funnel-step">
                          {index + 1}. {row.label}
                        </span>
                        <span className="stats-funnel-meta">
                          {row.visitors} visiteurs
                          {row.dropFromPrevious != null && row.dropFromPrevious > 0 && (
                            <span className="stats-drop">
                              <TrendingDown className="size-3.5" aria-hidden /> −{row.dropFromPrevious}%
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="stats-funnel-track">
                        <div
                          className="stats-funnel-fill"
                          style={{ width: `${Math.max(6, (row.visitors / funnelMax) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="stats-section">
                <h2 className="stats-section-title">Abonnements & produit</h2>
                <div className="stats-cards">
                  <StatCard label="Abonnements actifs" value={stats.subscriptions.active} hint={`+${stats.subscriptions.newWeek} cette semaine`} />
                  <StatCard label="Comptes vérifiés" value={stats.users.verified} hint={`${stats.users.total} au total`} />
                  <StatCard label="Relevés" value={stats.product.searches} hint={`${stats.product.searchesWeek} cette semaine`} />
                  <StatCard label="Fiches" value={stats.product.leads} />
                </div>
                {stats.subscriptions.byPlan.length > 0 && (
                  <ul className="stats-breakdown">
                    {stats.subscriptions.byPlan.map((row) => (
                      <li key={row.plan}>
                        <span>{planLabel(row.plan)}</span>
                        <strong>{row.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="stats-section">
                <h2 className="stats-section-title">Pages les plus vues</h2>
                <ul className="stats-pages">
                  {stats.topPages.map((row) => (
                    <li key={row.path}>
                      <code>{row.path}</code>
                      <span>{row.views}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="stats-section stats-section--wide">
                <h2 className="stats-section-title">Activité récente</h2>
                <ul className="stats-recent">
                  {stats.recent.map((row, index) => (
                    <li key={`${row.at}-${index}`}>
                      <time>{new Date(row.at).toLocaleString('fr-FR')}</time>
                      <span className="stats-recent-event">{row.event}</span>
                      <span className="stats-recent-path">{row.path ?? '—'}</span>
                      <span className="stats-recent-geo">{row.geo ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <p className="stats-footnote">Base : {stats.dbPath}</p>
          </>
        )}
      </div>
    </div>
  );
}
