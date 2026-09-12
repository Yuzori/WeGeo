import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Lead, LeadStatus } from '../shared/types';
import { api, type LeadQuery, type Meta } from './api';

/* ------------------------------------------------- compteurs de la barre latérale */

interface MetaValue {
  meta: Meta | null;
  refreshMeta: () => void;
}

export const MetaContext = createContext<MetaValue>({ meta: null, refreshMeta: () => {} });
export const useMeta = () => useContext(MetaContext);

export function useMetaState(): MetaValue {
  const [meta, setMeta] = useState<Meta | null>(null);

  const refreshMeta = useCallback(() => {
    api.meta().then(setMeta).catch(() => {});
  }, []);

  useEffect(refreshMeta, [refreshMeta]);
  return { meta, refreshMeta };
}

/* --------------------------------------------------------- collection de prospects */

export interface LeadCollection {
  leads: Lead[];
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  setStatus: (lead: Lead, status: LeadStatus) => Promise<void>;
  setNotes: (lead: Lead, notes: string) => Promise<void>;
  remove: (lead: Lead) => Promise<void>;
  bulk: (ids: number[], action: LeadStatus | 'delete') => Promise<number>;
}

/**
 * Gère une liste de prospects : chargement, mises à jour optimistes et
 * retrait automatique des fiches qui quittent le filtre courant.
 *
 * `query` à `null` = liste alimentée manuellement (résultats en direct).
 */
export function useLeadCollection(query: LeadQuery | null, onChange?: () => void): LeadCollection {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(!!query);
  const [error, setError] = useState<string | null>(null);

  const key = query ? JSON.stringify(query) : null;
  const changed = useRef(onChange);
  changed.current = onChange;

  const refresh = useCallback(() => {
    if (!key) return;
    setLoading(true);
    api
      .leads(JSON.parse(key) as LeadQuery)
      .then((rows) => {
        setLeads(rows);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [key]);

  useEffect(refresh, [refresh]);

  /** Retire la fiche si elle ne correspond plus au filtre affiché. */
  const applyLocal = useCallback(
    (updated: Lead) => {
      const filter = key ? (JSON.parse(key) as LeadQuery) : null;
      setLeads((list) => {
        if (filter?.status && updated.status !== filter.status) {
          return list.filter((l) => l.id !== updated.id);
        }
        return list.map((l) => (l.id === updated.id ? updated : l));
      });
    },
    [key],
  );

  const setStatus = useCallback(
    async (lead: Lead, status: LeadStatus) => {
      applyLocal({ ...lead, status });
      try {
        const saved = await api.updateLead(lead.id, { status });
        applyLocal(saved);
      } catch {
        applyLocal(lead);
      }
      changed.current?.();
    },
    [applyLocal],
  );

  const setNotes = useCallback(
    async (lead: Lead, notes: string) => {
      applyLocal({ ...lead, notes });
      const saved = await api.updateLead(lead.id, { notes }).catch(() => lead);
      applyLocal(saved);
    },
    [applyLocal],
  );

  const remove = useCallback(
    async (lead: Lead) => {
      setLeads((list) => list.filter((l) => l.id !== lead.id));
      await api.deleteLead(lead.id).catch(() => {});
      changed.current?.();
    },
    [],
  );

  const bulk = useCallback(
    async (ids: number[], action: LeadStatus | 'delete') => {
      const set = new Set(ids);
      const filter = key ? (JSON.parse(key) as LeadQuery) : null;

      setLeads((list) =>
        action === 'delete' || (filter?.status && filter.status !== action)
          ? list.filter((l) => !set.has(l.id))
          : list.map((l) => (set.has(l.id) ? { ...l, status: action } : l)),
      );

      const { changed: n } = await api.bulk(ids, action);
      changed.current?.();
      return n;
    },
    [key],
  );

  return { leads, setLeads, loading, error, refresh, setStatus, setNotes, remove, bulk };
}

/** Identifiant du relevé en cours de session, partagé entre les écrans. */
export const SESSION_KEY = 'wegeo.session';

export function searchSessionKey(workspaceId: number | string): string {
  return `${SESSION_KEY}.${workspaceId}`;
}

export const LEGACY_SEARCH_CITY_KEY = 'wegeo.city';
export const LEGACY_SEARCH_DOMAINS_KEY = 'wegeo.domains';
export const LEGACY_SEARCH_OPTIONS_KEY = 'wegeo.options';

export function searchCityKey(workspaceId: number | string): string {
  return `wegeo.city.${workspaceId}`;
}

export function searchDomainsKey(workspaceId: number | string): string {
  return `wegeo.domains.${workspaceId}`;
}

export function searchOptionsKey(workspaceId: number | string): string {
  return `wegeo.options.${workspaceId}`;
}

function parseStored<T>(raw: string, initial: T): T {
  const parsed = JSON.parse(raw) as T;
  const mergeable =
    parsed && initial && typeof parsed === 'object' && typeof initial === 'object' && !Array.isArray(initial);
  return mergeable ? { ...initial, ...parsed } : parsed;
}

function readStored<T>(key: string, initial: T, legacyKey?: string): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return parseStored(raw, initial);
    if (legacyKey) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (legacyRaw) {
        const value = parseStored(legacyRaw, initial);
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* stockage indisponible */
        }
        return value;
      }
    }
    return initial;
  } catch {
    return initial;
  }
}

/** Persiste une préférence dans le navigateur (options de recherche, ville…). */
export function useStored<T>(key: string, initial: T, legacyKey?: string): [T, Dispatch<SetStateAction<T>>] {
  const keyRef = useRef(key);
  const [value, setValue] = useState<T>(() => readStored(key, initial, legacyKey));

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      setValue(readStored(key, initial, legacyKey));
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
  }, [key, value, initial, legacyKey]);

  return [value, setValue];
}
