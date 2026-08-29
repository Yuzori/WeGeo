import type {
  AccountStats,
  BillingPublicConfig,
  Lead,
  LeadStatus,
  PeopleMatch,
  PublicUser,
  SearchOptions,
  SearchRecord,
  Stats,
  Workspace,
  WorkspaceInvite,
} from '../shared/types';

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

let workspaceId: number | null = null;

export function setApiWorkspace(id: number | null): void {
  workspaceId = id && Number.isInteger(id) && id > 0 ? id : null;
}

function scoped(url: string): string {
  if (!workspaceId) return url;
  return `${url}${url.includes('?') ? '&' : '?'}workspaceId=${workspaceId}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(scoped(url), {
    ...init,
    credentials: 'include',
    headers: {
      ...(workspaceId ? { 'X-Workspace-Id': String(workspaceId) } : {}),
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
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

export interface VisitorPlace {
  city: string;
  lat: number;
  lng: number;
}

export const api = {
  locate: () => request<VisitorPlace | null>('/api/locate'),

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

  resumeSearch: (id: number) => request<{ searchId: number }>(`/api/searches/${id}/resume`, { method: 'POST' }),

  search: (id: number) => request<SearchRecord>(`/api/searches/${id}`),

  searches: () => request<SearchRecord[]>('/api/searches'),

  searchLeads: (id: number) => request<Lead[]>(`/api/searches/${id}/leads`),

  deleteSearch: (id: number) => request<{ ok: true }>(`/api/searches/${id}`, { method: 'DELETE' }),

  preview: (query: LeadQuery = {}) =>
    request<{ headers: string[]; rows: string[][] }>(`/api/export/preview${qs(query)}`),

  /** Contenu TSV, prêt à être collé dans Google Sheets. */
  tsv: async (query: LeadQuery = {}): Promise<string> => {
    const res = await fetch(`/api/export/tsv${qs(query)}`, { credentials: 'include' });
    if (!res.ok) throw new Error("L'export a échoué.");
    return res.text();
  },

  downloadUrl: (format: 'csv' | 'xlsx', query: LeadQuery = {}) =>
    scoped(`/api/export/${format}${qs(query)}`),

  me: () => request<{ user: PublicUser | null }>('/api/auth/me'),
  authMethods: () => request<{ google: boolean; mail: boolean }>('/api/auth/methods'),
  login: (identifier: string, password: string, locale?: string) =>
    request<{ user: PublicUser } | { needsCode: true; purpose: 'verify'; email: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, email: identifier, password, locale }),
    }),
  register: (email: string, password: string, locale?: string, username?: string, avatar?: string | null) =>
    request<{ needsCode: true; purpose: 'verify' }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, locale, username, avatar: avatar || undefined }),
    }),
  verify: (email: string, code: string, purpose: string) =>
    request<{ user: PublicUser }>('/api/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code, purpose }),
    }),
  resendCode: (email: string, purpose: string, locale?: string) =>
    request<{ ok: true }>('/api/auth/resend', {
      method: 'POST',
      body: JSON.stringify({ email, purpose, locale }),
    }),
  forgot: (email: string, locale?: string) =>
    request<{ ok: true }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email, locale }) }),
  resetPassword: (email: string, code: string, password: string) =>
    request<{ user: PublicUser }>('/api/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    }),
  googleUrl: (next = '/app', link = false) =>
    `/api/auth/google?next=${encodeURIComponent(next)}${link ? '&link=1' : ''}`,
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  claimUsername: (username: string) =>
    request<{ user: PublicUser }>('/api/auth/username', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  updateProfile: (body: { username?: string; password?: string; currentPassword?: string; avatar?: string | null }) =>
    request<{ user: PublicUser }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  accountStats: () => request<AccountStats>('/api/auth/stats'),

  exportSheets: (query: LeadQuery = {}) =>
    request<{ url: string; id: string }>(`/api/export/sheets${qs(query)}`, { method: 'POST' }),

  billingConfig: () => request<BillingPublicConfig>('/api/billing/config'),
  checkout: (plan: string) =>
    request<{ clientSecret: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) }),
  billingPortal: () => request<{ url: string }>('/api/billing/portal', { method: 'POST' }),
  confirmCheckout: (sessionId: string) =>
    request<{ user: PublicUser }>('/api/billing/confirm', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }),

  workspaces: () => request<{ workspaces: Workspace[]; invites: WorkspaceInvite[] }>('/api/workspaces'),
  workspaceInvites: () => request<{ invites: WorkspaceInvite[] }>('/api/workspaces/invites'),
  workspace: (id: number) => request<{ workspace: Workspace }>(`/api/workspaces/${id}`),
  createWorkspace: (name: string) =>
    request<{ workspace: Workspace }>('/api/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  renameWorkspace: (id: number, name: string) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }),
  deleteWorkspace: (id: number) => request<{ ok: true }>(`/api/workspaces/${id}`, { method: 'DELETE' }),
  leaveWorkspace: (id: number) => request<{ ok: true }>(`/api/workspaces/${id}/leave`, { method: 'POST' }),
  lookupPerson: (query: string) =>
    request<{ found: boolean }>('/api/workspaces/lookup', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),
  searchPeople: (q: string) =>
    request<{ people: PeopleMatch[] }>(`/api/workspaces/people${qs({ q })}`),
  inviteToWorkspace: (id: number, query: string, locale?: string) =>
    request<{ ok: true; found: boolean; workspace: Workspace }>(`/api/workspaces/${id}/invites`, {
      method: 'POST',
      body: JSON.stringify({ query, email: query, locale }),
    }),
  acceptInvite: (id: number) =>
    request<{ workspace: Workspace }>(`/api/workspaces/invites/${id}/accept`, { method: 'POST' }),
  declineInvite: (id: number) => request<{ ok: true }>(`/api/workspaces/invites/${id}/decline`, { method: 'POST' }),
  removeMember: (workspaceId: number, userId: number) =>
    request<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}/members/${userId}`, { method: 'DELETE' }),
};

/** Ouvre le flux d'évènements d'une recherche en cours. */
export function openSearchStream(
  searchId: number,
  onEvent: (event: import('../shared/types').ScrapeEvent) => void,
  onClose?: () => void,
): () => void {
  const source = new EventSource(scoped(`/api/searches/${searchId}/stream`));

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
