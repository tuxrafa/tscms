import { create } from 'zustand';

interface SessionState {
  token: string;
  locale: 'pt-BR' | 'en';
  setToken: (token: string) => void;
  setLocale: (locale: 'pt-BR' | 'en') => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  token: localStorage.getItem('tscms.token') ?? '',
  locale: 'pt-BR',
  setToken: (token) => {
    localStorage.setItem('tscms.token', token);
    set({ token });
  },
  setLocale: (locale) => set({ locale }),
  clear: () => {
    localStorage.removeItem('tscms.token');
    set({ token: '' });
  },
}));

export async function api(path: string, options: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Falha na API.');
  return payload;
}
