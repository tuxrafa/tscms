export {};

process.env.NODE_ENV = 'test';

const { createApp } = await import('./main.js');

const email = process.env.DEMO_EMAIL ?? 'editor@example.com';
const password = process.env.DEMO_PASSWORD ?? 'demo-password-change-me';
const siteKey = process.env.DEMO_SITE_KEY ?? 'revista-demonstracao';

const app = await createApp();

async function call(method: string, url: string, token?: string, payload?: Record<string, unknown>) {
  const response = await app.inject({
    method: method as 'GET' | 'POST',
    url,
    headers: {
      ...(payload ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    payload,
  });
  const body = response.body ? JSON.parse(response.body) : null;
  return { status: response.statusCode, body };
}

let registered = await call('POST', '/v1/management/auth/register', undefined, {
  name: 'Ana Editora',
  email,
  password,
  organizationName: 'Revista Norte',
});
if (registered.status === 409) {
  registered = await call('POST', '/v1/management/auth/login', undefined, { email, password });
}
if (registered.status !== 201 && registered.status !== 200) {
  throw new Error(`Não foi possível preparar a conta de demonstração: ${registered.status}`);
}
const token = registered.body.token as string;
const organizations = await call('GET', '/v1/management/organizations', token);
const organizationId = organizations.body.data[0].id as string;
const workspaces = await call('GET', `/v1/management/organizations/${organizationId}/workspaces`, token);
const workspaceId = workspaces.body.data[0].id as string;
const sites = await call('GET', '/v1/management/sites', token);
const existing = (sites.body.data as Array<{ key: string }>).find((site) => site.key === siteKey);
if (!existing) {
  const created = await call('POST', `/v1/management/organizations/${organizationId}/workspaces/${workspaceId}/sites`, token, {
    name: 'Revista Demonstração',
    key: siteKey,
    locales: ['pt-BR'],
  });
  if (created.status !== 201) throw new Error('Falha ao criar o site de demonstração.');
}

console.log(`Demonstração pronta para ${email}. Troque DEMO_PASSWORD antes de qualquer uso fora da máquina local.`);
await app.close();
