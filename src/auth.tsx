import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { PublicUser } from '../shared/types';
import { PLAN_LIMITS, type PlanLimits } from '../shared/plans';
import { api } from './api';

interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  setUser: () => {},
});

const USER_CACHE = 'prospy.user';

function readCachedUser(): PublicUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PublicUser;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedUser(user: PublicUser | null) {
  try {
    if (user) localStorage.setItem(USER_CACHE, JSON.stringify(user));
    else localStorage.removeItem(USER_CACHE);
  } catch {
    /* ignore */
  }
}

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<PublicUser | null>(() => readCachedUser());
  const [loading, setLoading] = useState(() => !readCachedUser());

  const setUser = useCallback((next: PublicUser | null) => {
    setUserState(next);
    writeCachedUser(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, setUser }}>{children}</AuthContext.Provider>;
}

export function userLimits(user: PublicUser | null | undefined): PlanLimits {
  return user?.limits ?? PLAN_LIMITS.starter;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-faint">Chargement…</div>;
  }
  if (!user) {
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  }
  if (user.needsUsername && location.pathname !== '/app/pseudo') {
    return <Navigate to="/app/pseudo" replace />;
  }
  return <>{children}</>;
}

export function RequirePaid({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && user.hasAccess === false) {
    return <Navigate to="/abonnement" replace />;
  }
  return <>{children}</>;
}
