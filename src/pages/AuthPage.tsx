import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { UserAvatar } from '../components/UserAvatar';
import { BrandMark } from '../components/BrandMark';
import { LangSwitch } from '../components/LangSwitch';
import { cx } from '../components/ui';
import { useI18n } from '../i18n';
import { resizeAvatar } from '../lib/avatar';
import { markAppEnter } from '../lib/nav';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function passwordScore(password: string): number {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  return Math.min(4, score);
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  showStrength,
  strengthLabels,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  showStrength?: boolean;
  strengthLabels: [string, string, string, string];
}) {
  const [visible, setVisible] = useState(false);
  const score = passwordScore(value);
  const tone =
    score <= 1 ? 'bg-score-low' : score === 2 ? 'bg-score-mid' : score === 3 ? 'bg-score-good' : 'bg-score-high';

  return (
    <label className="block">
      <span className="legend mb-1.5 block">{label}</span>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={8}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="field h-11 pr-11"
        />
        <button
          type="button"
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-faint hover:text-ink"
          onClick={() => setVisible((open) => !open)}
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {showStrength && value.length > 0 && (
        <div className="mt-2 space-y-1">
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={cx('h-1 rounded-full', score >= step ? tone : 'bg-card-3')}
              />
            ))}
          </div>
          <p className="text-[11px] text-faint">{strengthLabels[Math.max(0, score - 1)]}</p>
        </div>
      )}
    </label>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' }) {
  const { user, setUser } = useAuth();
  const { locale, m } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [purpose, setPurpose] = useState<'login' | 'verify' | 'reset'>(mode === 'forgot' ? 'reset' : 'login');
  const [error, setError] = useState<string | null>(params.get('error'));
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [google, setGoogle] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);

  const strengthLabels: [string, string, string, string] = [
    m.auth.strengthWeak,
    m.auth.strengthFair,
    m.auth.strengthGood,
    m.auth.strengthStrong,
  ];

  useEffect(() => {
    const title = mode === 'login' ? m.auth.loginTitle : mode === 'register' ? m.auth.registerTitle : m.auth.forgotTitle;
    document.title = `${title}. Prospy`;
  }, [mode, m]);

  useEffect(() => {
    api.authMethods().then((methods) => setGoogle(methods.google)).catch(() => setGoogle(false));
  }, []);

  if (user && mode !== 'forgot') {
    if (user.needsUsername) return <Navigate to="/app/pseudo" replace />;
    return <Navigate to={from.startsWith('/app') ? from : '/app'} replace />;
  }

  const goApp = (nextUser: typeof user) => {
    if (!nextUser) return;
    setUser(nextUser);
    if (nextUser.needsUsername) {
      navigate('/app/pseudo', { replace: true });
      return;
    }
    markAppEnter();
    navigate(from.startsWith('/app') || from === '/abonnement' ? from : '/app', { replace: true });
  };

  const submitForm = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        await api.forgot(email, locale);
        setPurpose('reset');
        setStep('code');
        setInfo(m.auth.forgotSent);
      } else if (mode === 'login') {
        const result = await api.login(identifier, password, locale);
        if ('user' in result) {
          goApp(result.user);
        } else {
          setPurpose(result.purpose);
          if (result.email) setEmail(result.email);
          setStep('code');
        }
      } else {
        await api.register(email, password, locale, username, avatar);
        setPurpose('verify');
        setStep('code');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : m.auth.fail);
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (purpose === 'reset') {
        goApp((await api.resetPassword(email, code, password)).user);
      } else {
        goApp((await api.verify(email, code, purpose)).user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : m.auth.fail);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.resendCode(email, purpose, locale);
      setInfo(m.auth.resent);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.auth.fail);
    } finally {
      setLoading(false);
    }
  };

  const title =
    step === 'code' ? m.auth.codeTitle : mode === 'login' ? m.auth.loginTitle : mode === 'register' ? m.auth.registerTitle : m.auth.forgotTitle;
  const lead =
    step === 'code'
      ? `${m.auth.codeLead} ${email}`
      : mode === 'login'
        ? m.auth.loginLead
        : mode === 'register'
          ? m.auth.registerLead
          : m.auth.forgotLead;

  return (
    <div className="landing auth-page">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-3 py-10 sm:px-4 sm:py-12">
        <div className="mb-8 flex items-center justify-between">
          <BrandMark alt="Prospy" className="h-10 w-10" />
          <LangSwitch />
        </div>
        <h1 className="auth-title text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="auth-lead mt-2 text-sm text-muted">{lead}</p>

        {google && step === 'form' && mode !== 'forgot' && (
          <>
            <a
              href={api.googleUrl(from.startsWith('/app') || from === '/abonnement' ? from : '/app')}
              className="mt-8 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--lp-line)] bg-[color-mix(in_oklab,var(--lp-surface)_82%,transparent)] text-sm font-semibold"
            >
              <GoogleMark />
              {m.auth.google}
            </a>
            <p className="legend my-4 text-center">{m.auth.orEmail}</p>
          </>
        )}

        {step === 'form' ? (
          <form onSubmit={(e) => void submitForm(e)} className={cx('glass space-y-3 rounded-[10px] p-5', !(google && mode !== 'forgot') && 'mt-8')}>
            {mode === 'login' ? (
              <label className="block">
                <span className="legend mb-1.5 block">{m.auth.identifier}</span>
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="field h-11"
                />
              </label>
            ) : (
              <label className="block">
                <span className="legend mb-1.5 block">{m.auth.email}</span>
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field h-11"
                />
              </label>
            )}
            {mode === 'register' && (
              <>
                <label className="block">
                  <span className="legend mb-1.5 block">{m.auth.username}</span>
                  <input
                    type="text"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="field h-11"
                  />
                </label>
                <div className="flex items-center gap-3">
                  <UserAvatar username={username || '?'} avatarUrl={avatar} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="legend">{m.auth.photo}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-faint">{m.auth.photoHint}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <label className="inline-flex h-8 cursor-pointer items-center rounded-full border border-rule px-3 text-[12px] font-medium hover:bg-card-2">
                        {m.auth.photoChoose}
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = '';
                            if (!file) return;
                            void resizeAvatar(file)
                              .then(setAvatar)
                              .catch((err: Error) => setError(err.message));
                          }}
                        />
                      </label>
                      {avatar && (
                        <button
                          type="button"
                          className="text-[12px] font-medium text-muted hover:text-ink"
                          onClick={() => setAvatar(null)}
                        >
                          {m.auth.photoRemove}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
            {mode !== 'forgot' && (
              <PasswordField
                label={m.auth.password}
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                showStrength={mode === 'register'}
                strengthLabels={strengthLabels}
              />
            )}
            {mode === 'login' && (
              <p className="text-right">
                <Link to="/mot-de-passe-oublie" className="text-[12px] font-medium text-lime-deep">
                  {m.auth.forgot}
                </Link>
              </p>
            )}
            {error && <p className="text-sm text-score-low">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-lime-line bg-lime text-sm font-semibold text-on-lime disabled:opacity-40"
            >
              {loading ? m.auth.wait : mode === 'login' ? m.auth.submitLogin : mode === 'register' ? m.auth.submitRegister : m.auth.forgotSubmit}
            </button>
            {mode !== 'forgot' && (
              <p className="text-[11px] leading-relaxed text-faint">
                {m.auth.termsPrefix}{' '}
                <Link to="/cgu" className="text-lime-deep">
                  {m.auth.terms}
                </Link>{' '}
                {m.auth.termsAnd}{' '}
                <Link to="/confidentialite" className="text-lime-deep">
                  {m.auth.privacy}
                </Link>
                .
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={(e) => void submitCode(e)} className="glass mt-8 space-y-3 rounded-[10px] p-5">
            <label className="block">
              <span className="legend mb-1.5 block">{m.auth.code}</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="field h-11 tracking-[0.4em]"
              />
            </label>
            {purpose === 'reset' && (
              <PasswordField
                label={m.auth.newPassword}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                showStrength
                strengthLabels={strengthLabels}
              />
            )}
            {info && <p className="text-sm text-lime-deep">{info}</p>}
            {error && <p className="text-sm text-score-low">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-lime-line bg-lime text-sm font-semibold text-on-lime disabled:opacity-40"
            >
              {loading ? m.auth.wait : purpose === 'reset' ? m.auth.resetSubmit : m.auth.codeSubmit}
            </button>
            <div className="flex items-center justify-between text-[12px]">
              <button type="button" className="text-muted hover:text-ink" onClick={() => setStep('form')}>
                {m.auth.back}
              </button>
              <button type="button" className="font-medium text-lime-deep" disabled={loading} onClick={() => void resend()}>
                {m.auth.resend}
              </button>
            </div>
          </form>
        )}

        {mode !== 'forgot' && (
          <p className="auth-switch mt-6 text-sm text-muted">
            {mode === 'login' ? (
              <>
                {m.auth.noAccount}{' '}
                <Link to="/inscription" className="font-medium text-lime-deep">
                  {m.auth.signup}
                </Link>
              </>
            ) : (
              <>
                {m.auth.hasAccount}{' '}
                <Link to="/connexion" className="font-medium text-lime-deep">
                  {m.auth.signin}
                </Link>
              </>
            )}
          </p>
        )}
        {mode === 'forgot' && (
          <p className="mt-6 text-sm text-muted">
            <Link to="/connexion" className="font-medium text-lime-deep">
              {m.auth.signin}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
