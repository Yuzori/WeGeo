import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const SETTINGS_FROM_KEY = 'prospy.settings.from';
const APP_ENTER_KEY = 'prospy.app.enter';

let pendingAppEnter = false;

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* quota / private mode */
  }
}

function clearSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function isSafeReturn(path: string): boolean {
  const base = path.split(/[?#]/)[0] ?? path;
  if (base === '/' || base === '/abonnement') return true;
  if (base === '/app' || base.startsWith('/app/')) return true;
  return false;
}

export function rememberSettingsFrom(path: string) {
  const base = path.split(/[?#]/)[0] ?? path;
  if (!path || base.startsWith('/app/compte') || base.startsWith('/connexion') || base.startsWith('/inscription')) return;
  if (!isSafeReturn(path)) return;
  writeSession(SETTINGS_FROM_KEY, path);
}

export function settingsBackPath(stateFrom?: string | null): string {
  for (const candidate of [stateFrom, readSession(SETTINGS_FROM_KEY)]) {
    if (!candidate || !isSafeReturn(candidate)) continue;
    const base = candidate.split(/[?#]/)[0] ?? candidate;
    if (base.startsWith('/app/compte')) continue;
    return candidate;
  }
  return '/app';
}

export function markAppEnter() {
  pendingAppEnter = true;
  writeSession(APP_ENTER_KEY, '1');
}

/** Joue l’apparition de l’app après un login, y compris le retour Google. */
export function useAppEnter() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.pathname.startsWith('/app')) return;

    const params = new URLSearchParams(location.search);
    if (params.get('enter') === '1') {
      markAppEnter();
      params.delete('enter');
      navigate(
        { pathname: location.pathname, search: params.toString(), hash: location.hash },
        { replace: true },
      );
      return;
    }

    if (readSession(APP_ENTER_KEY) === '1') {
      pendingAppEnter = true;
      clearSession(APP_ENTER_KEY);
    }

    if (!pendingAppEnter) return;
    if (location.pathname.startsWith('/app/pseudo')) return;

    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      pendingAppEnter = false;
      return;
    }

    root.classList.add('is-app-enter');
    const timer = window.setTimeout(() => {
      root.classList.remove('is-app-enter');
      pendingAppEnter = false;
    }, 1600);
    return () => window.clearTimeout(timer);
  }, [location.hash, location.pathname, location.search, navigate]);
}
