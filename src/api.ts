import type { Lead, LeadStatus, SearchOptions, SearchRecord, Stats } from '../shared/types';

export interface LeadQuery {
  status?: LeadStatus;
  city?: string;
  domain?: string;
  q?: string;
  searchId?: number;
  website?: 'sans' | 'avec';
}

function qs(params: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erreur ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Meta {
  stats: Stats;
  cities: string[];
  domains: string[];
  activeSearches: number[];
}

export const api = {
  meta: () => request<Meta>('/api/meta'),

  leads: (query: LeadQuery = {}) => request<Lead[]>(`/api/leads${qs(query)}`),

  updateLead: (id: number, patch: { status?: LeadStatus; notes?: string }) =>
    request<Lead>(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),

  bulk: (ids: number[], action: LeadStatus | 'delete') =>
    request<{ changed: number }>('/api/leads/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids, action }),
    }),

  deleteLead: (id: number) => request<{ ok: true }>(`/api/leads/${id}`, { method: 'DELETE' }),

  startSearch: (city: string, domains: string[], options: SearchOptions) =>
    request<{ searchId: number }>('/api/searches', {
      method: 'POST',
      body: JSON.stringify({ city, domains, options }),
    }),

  cancelSearch: (id: number) => request<{ cancelled: boolean }>(`/api/searches/${id}/cancel`, { method: 'POST' }),

  searches: () => request<SearchRecord[]>('/api/searches'),

  searchLeads: (id: number) => request<Lead[]>(`/api/searches/${id}/leads`),

  deleteSearch: (id: number) => request<{ ok: true }>(`/api/searches/${id}`, { method: 'DELETE' }),

  preview: (query: LeadQuery = {}) =>
    request<{ headers: string[]; rows: string[][] }>(`/api/export/preview${qs(query)}`),

  /** Contenu TSV, prêt à être collé dans Google Sheets. */
  tsv: async (query: LeadQuery = {}): Promise<string> => {
    const res = await fetch(`/api/export/tsv${qs(query)}`);
    if (!res.ok) throw new Error("L'export a échoué.");
    return res.text();
  },

  downloadUrl: (format: 'csv' | 'xlsx', query: LeadQuery = {}) => `/api/export/${format}${qs(query)}`,
};

/** Ouvre le flux d'évènements d'une recherche en cours. */
export function openSearchStream(
  searchId: number,
  onEvent: (event: import('../shared/types').ScrapeEvent) => void,
  onClose?: () => void,
): () => void {
  const source = new EventSource(`/api/searches/${searchId}/stream`);

  source.onmessage = (message) => {
    try {
      onEvent(JSON.parse(message.data) as import('../shared/types').ScrapeEvent);
    } catch {
      /* ligne ignorée */
    }
  };

  source.onerror = () => {
    source.close();
    onClose?.();
  };

  return () => {
    source.close();
    onClose?.();
  };
}
