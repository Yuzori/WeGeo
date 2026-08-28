import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Command, Keyboard, Link2, Shield } from 'lucide-react';
import type { AccountStats } from '../../shared/types';
import { api } from '../api';
import { useAuth } from '../auth';
import { LangSwitch } from '../components/LangSwitch';
import { LogoutButton } from '../components/LogoutButton';
import { UserAvatar } from '../components/UserAvatar';
import { Button, ThemeToggle, cx } from '../components/ui';
import { useI18n } from '../i18n';
import { resizeAvatar } from '../lib/avatar';
import { rememberSettingsFrom, settingsBackPath } from '../lib/nav';

function formatSince(iso: string, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function SettingsPage() {
  const { user, setUser, refresh } = useAuth();
  const { locale, setLocale, m } = useI18n();
  const location = useLocation();
  const stateFrom = (location.state as { from?: string } | null)?.from;
  const backTo = settingsBackPath(stateFrom);
  const [username, setUsername] = useState(user?.username ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (stateFrom) rememberSettingsFrom(stateFrom);
  }, [stateFrom]);

  useEffect(() => {
    document.title = m.settings.docTitle;
    void refresh();
    api.accountStats().then(setStats).catch(() => {});
    api.authMethods().then((methods) => setGoogle(methods.google)).catch(() => {});
  }, [refresh, m.settings.docTitle]);

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);

  const backLabel = useMemo(() => {
    const base = backTo.split(/[?#]/)[0] ?? backTo;
    if (base === '/') return m.settings.backHome;
    if (base === '/app' || base === '/app/') return m.settings.backSessions;
    if (/^\/app\/s\/\d+/.test(base)) return m.settings.backSession;
    return m.settings.back;
  }, [backTo, m.settings.back, m.settings.backHome, m.settings.backSession, m.settings.backSessions]);

  if (!user) return null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const result = await api.updateProfile({
        username,
        password: password || undefined,
        currentPassword: currentPassword || undefined,
      });
      setUser(result.user);
      setPassword('');
      setCurrentPassword('');
      setInfo(m.settings.saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.settings.saveFail);
    } finally {
      setBusy(false);
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const avatar = await resizeAvatar(file);
      const result = await api.updateProfile({ avatar });
      setUser(result.user);
      setInfo(m.settings.photoUpdated);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.settings.photoFail);
    }
  };

  const removePhoto = async () => {
    try {
      const result = await api.updateProfile({ avatar: null });
      setUser(result.user);
      setInfo(m.settings.photoRemoved);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.settings.photoRemoveFail);
    }
  };

  const planLabel =
    user.subscriptionStatus === 'active' || user.subscriptionStatus === 'trialing'
      ? user.plan ?? m.settings.planActive
      : m.settings.planNone;

  const googleCopy = user.googleLinked
    ? user.canExportSheets
      ? m.settings.googleLinkedSheets
      : m.settings.googleLinkedRelink
    : m.settings.googleHint;

  const statsItems = stats
    ? [
        { k: m.settings.statsSessions, v: stats.sessions },
        { k: m.settings.statsSearches, v: stats.searches },
        { k: m.settings.statsLeads, v: stats.leads },
        { k: m.settings.statsSigned, v: stats.signed },
      ]
    : [];

  return (
    <div className="app-shell app-settings min-h-svh">
      <div className="settings-stage mx-auto max-w-3xl px-3 pb-20 pt-3 sm:px-8 sm:pt-6">
        <div className="settings-top">
          <Link to={backTo} className="settings-back settings-morph">
            <ArrowLeft className="size-3.5" />
            {backLabel}
          </Link>
          <div className="flex items-center gap-2">
            <LangSwitch compact />
            <LogoutButton />
          </div>
        </div>

        <header className="settings-hero">
          <p className="legend">{m.settings.kicker}</p>
          <h1>{m.settings.title}</h1>
          <p className="settings-copy">{m.settings.lead}</p>
        </header>

        <section className="settings-id">
          <div className="settings-id-avatar">
            <UserAvatar username={username || user.username} avatarUrl={user.avatarUrl} size={88} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="legend">{m.settings.identity}</p>
            <p className="settings-id-name">{user.username}</p>
            <p className="truncate text-[13px] text-faint">{user.email}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <label className="settings-photo-btn settings-morph">
                {m.settings.changePhoto}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    void pickPhoto(file);
                  }}
                />
              </label>
              {user.avatarUrl && (
                <Button type="button" size="sm" variant="ghost" className="settings-morph" onClick={() => void removePhoto()}>
                  {m.settings.useInitial}
                </Button>
              )}
            </div>
          </div>
        </section>

        {statsItems.length > 0 && (
          <section className="settings-stats">
            {statsItems.map((item) => (
              <div key={item.k} className="settings-stat">
                <p className="legend">{item.k}</p>
                <p className="settings-stat-n tnum">{item.v}</p>
              </div>
            ))}
          </section>
        )}

        <div className="settings-grid">
          <form onSubmit={(event) => void save(event)} className="settings-card space-y-4">
            <label className="block">
              <span className="legend mb-1.5 block">{m.settings.username}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                maxLength={24}
                required
                className="field h-11"
              />
            </label>
            <label className="block">
              <span className="legend mb-1.5 block">{m.settings.email}</span>
              <input value={user.email} readOnly className="field h-11 text-faint" />
            </label>
            {user.hasPassword && (
              <label className="block">
                <span className="legend mb-1.5 block">{m.settings.currentPassword}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  className="field h-11"
                />
              </label>
            )}
            <label className="block">
              <span className="legend mb-1.5 block">
                {user.hasPassword ? m.settings.newPassword : m.settings.addPassword}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field h-11"
                placeholder={user.hasPassword ? m.settings.passwordKeep : m.settings.passwordHint}
              />
            </label>
            {error && <p className="text-sm text-score-low">{error}</p>}
            {info && <p className="text-sm text-lime-deep">{info}</p>}
            <Button type="submit" variant="primary" loading={busy} className="settings-morph">
              {m.settings.save}
            </Button>
          </form>

          <div className="space-y-4">
            <section className="settings-card space-y-5">
              <p className="legend">{m.settings.prefs}</p>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.settings.appearance}</p>
                  <p className="legend mt-0.5">{m.settings.appearanceHint}</p>
                </div>
                <ThemeToggle />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.settings.language}</p>
                  <p className="legend mt-0.5">{m.settings.languageHint}</p>
                </div>
                <div className="settings-lang" role="group" aria-label={m.nav.lang}>
                  {(['fr', 'en'] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setLocale(code)}
                      className={cx('settings-lang-btn', locale === code && 'is-on')}
                    >
                      {code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="settings-card space-y-4">
              <div className="flex items-start gap-3">
                <span className="settings-ico">
                  <Link2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{m.settings.google}</p>
                  <p className="legend mt-0.5">{googleCopy}</p>
                  {!user.googleLinked && google && (
                    <a href={api.googleUrl('/app/compte', true)} className="settings-photo-btn settings-morph mt-3 inline-flex">
                      {m.settings.googleLink}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="settings-ico">
                  <Shield className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{m.settings.billing}</p>
                  <p className="legend mt-0.5 capitalize">{planLabel}</p>
                  <p className="legend">
                    {m.settings.memberSince.replace('{date}', formatSince(stats?.memberSince || user.createdAt, locale))}
                  </p>
                  <Link to="/abonnement" className="settings-morph mt-2 inline-block text-[12px] font-medium text-lime-deep">
                    {m.settings.manageBilling}
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className="settings-card mt-4 space-y-2">
          <div className="mb-3 flex items-center gap-2">
            <Keyboard className="size-4 text-lime-deep" />
            <p className="text-sm font-semibold">{m.settings.shortcuts}</p>
          </div>
          {[
            { keys: m.settings.shortcutCtrlK, label: m.settings.shortcutPalette },
            { keys: m.settings.shortcutEscKey, label: m.settings.shortcutEsc },
          ].map((row) => (
            <div key={row.keys} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">{row.label}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-rule px-2 py-0.5 font-mono text-[11px]">
                <Command className="size-3" />
                {row.keys}
              </span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
