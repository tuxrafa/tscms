export interface AuthorClientOptions {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class AuthorClient {
  constructor(private readonly options: AuthorClientOptions) {}

  async login(email: string, password: string): Promise<{ token: string }> {
    return this.request('POST', '/v1/management/auth/login', { email, password }, false) as Promise<{ token: string }>;
  }

  async request(method: string, path: string, body?: unknown, auth = true): Promise<unknown> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth && this.options.token) headers.authorization = `Bearer ${this.options.token}`;
    const response = await (this.options.fetchImpl ?? fetch)(`${this.options.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = payload?.error?.message ?? `Management API respondeu ${response.status}.`;
      throw new Error(message);
    }
    return payload;
  }
}
