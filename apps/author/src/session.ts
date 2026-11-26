import { create } from 'zustand';

interface SessionState {
  token: string;
  locale: 'pt-BR' | 'en';
  setToken: (token: string) => void;
  setLocale: (locale: 'pt-BR' | 'en') => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  token: sessionStorage.getItem('tscms.signed-in') === '1' ? '1' : '',
  locale: 'pt-BR',
  setToken: (token) => {
    localStorage.removeItem('tscms.token');
    if (token) sessionStorage.setItem('tscms.signed-in', '1');
    else sessionStorage.removeItem('tscms.signed-in');
    set({ token: token ? '1' : '' });
  },
  setLocale: (locale) => set({ locale }),
  clear: () => {
    localStorage.removeItem('tscms.token');
    sessionStorage.removeItem('tscms.signed-in');
    set({ token: '' });
  },
}));

function csrfToken(): string {
  const match = document.cookie.split('; ').find((part) => part.startsWith('tscms_csrf='));
  return match ? decodeURIComponent(match.slice('tscms_csrf='.length)) : '';
}

export async function api(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token && options.token.includes('.')) headers.authorization = `Bearer ${options.token}`;
  const csrf = csrfToken();
  if (csrf && method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrf;
  const response = await fetch(path, {
    method,
    headers,
    credentials: 'include',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Falha na API.');
  return payload;
}
