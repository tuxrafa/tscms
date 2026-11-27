import { beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createDatabase, migrateDatabase } from '@tscms/database';
import { IamService } from './iam.service.js';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://tscms:tscms@127.0.0.1:5432/tscms_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:3000';

const { createApp } = await import('./main.js');

describe('identidade, escopo e auditoria', () => {
  let app: NestFastifyApplication;
  let adminToken = '';
  let organizationId = '';
  let siteId = '';
  let newsId = '';
  let podcastsId = '';
  let authorToken = '';
  let authorId = '';
  let publisherToken = '';
  let podcastToken = '';
  let pageId = '';
  let serviceToken = '';
  let serviceUserId = '';
  let automatedPageId = '';

  beforeAll(async () => {
    const database = createDatabase(process.env.DATABASE_URL!);
    await migrateDatabase(database.db);
    await database.pool.query(`
      do $$ declare r record;
      begin
        for r in (select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations') loop
          execute 'truncate table ' || quote_ident(r.tablename) || ' cascade';
        end loop;
      end $$;
    `);
    await database.pool.end();
    app = await createApp();
  }, 120_000);

  it('percorre o fluxo editorial com permissões de pasta', async () => {
    const iam = app.get(IamService);
    const first = await iam.bootstrap({ email: 'admin@example.com', password: 'frase-longa-admin', login: 'admin', name: 'Admin' });
    const second = await iam.bootstrap({ email: 'admin@example.com', password: 'frase-longa-admin', login: 'admin', name: 'Admin' });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    await expect(iam.bootstrap({ email: 'outro@example.com', password: 'password12345', login: 'root' })).rejects.toThrow(/comum/);

    const login = await call('POST', '/v1/management/auth/login', { login: 'admin', password: 'frase-longa-admin' });
    expect(login.statusCode).toBe(201);
    adminToken = login.json().token;
    expect(await call('POST', '/v1/management/auth/login', { login: 'admin', password: 'senha-errada-123' })).toMatchObject({ statusCode: 401 });

    const organization = await asAdmin('POST', '/v1/management/organizations', { name: 'F2W' });
    expect(organization.statusCode).toBe(201);
    organizationId = organization.json().id;
    const workspaces = await asAdmin('GET', `/v1/management/organizations/${organizationId}/workspaces`);
    const workspaceId = workspaces.json().data[0].id;
    const site = await asAdmin('POST', `/v1/management/organizations/${organizationId}/workspaces/${workspaceId}/sites`, {
      name: '12 Pontos',
      key: 'doze-pontos',
      locales: ['pt-BR'],
    });
    expect(site.statusCode).toBe(201);
    siteId = site.json().id;
    newsId = (await asAdmin('POST', `/v1/management/sites/${siteId}/folders`, { name: 'Notícias' })).json().id;
    podcastsId = (await asAdmin('POST', `/v1/management/sites/${siteId}/folders`, { name: 'Podcasts' })).json().id;
    const gridInvite = await asAdmin('POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Grade',
      email: 'grade@example.com',
      grants: [
        { siteId, scopeType: 'page_folder', scopeId: newsId, includeDescendants: true, permissions: ['pages.read', 'pages.create'] },
        { siteId, scopeType: 'page_folder', scopeId: podcastsId, includeDescendants: true, permissions: ['pages.read'] },
      ],
    });
    expect(gridInvite.statusCode).toBe(201);
    const gridToken = (await call('POST', '/v1/management/auth/invitations/accept', { token: gridInvite.json().inviteToken, password: 'frase-longa-grade' })).json().token;
    expect((await asUser(gridToken, 'POST', `/v1/management/sites/${siteId}/pages`, { title: 'Na grade', folderId: newsId })).statusCode).toBe(201);
    expect((await asUser(gridToken, 'POST', `/v1/management/sites/${siteId}/pages`, { title: 'Só leitura', folderId: podcastsId })).statusCode).toBe(403);
    const eurovisionId = (await asAdmin('POST', `/v1/management/sites/${siteId}/folders`, { name: 'Eurovision', parentId: newsId })).json().id;

    const authors = await asAdmin('POST', `/v1/management/organizations/${organizationId}/groups`, {
      name: 'Autores de notícias',
      permissions: ['pages.read', 'pages.create', 'pages.edit', 'pages.move', 'pages.view_history'],
      siteId,
      scopeType: 'page_folder',
      scopeId: newsId,
      includeDescendants: true,
    });
    expect(authors.statusCode).toBe(201);
    const publishers = await asAdmin('POST', `/v1/management/organizations/${organizationId}/groups`, {
      name: 'Publicadores de notícias',
      permissions: ['pages.read', 'pages.create', 'pages.edit', 'pages.publish', 'pages.unpublish', 'pages.view_history'],
      siteId,
      scopeType: 'page_folder',
      scopeId: newsId,
      includeDescendants: true,
    });
    const podcastAdmins = await asAdmin('POST', `/v1/management/organizations/${organizationId}/groups`, {
      name: 'Administradores de podcasts',
      permissions: ['pages.read', 'pages.create', 'pages.edit', 'pages.publish', 'pages.view_history', 'users.invite', 'audit.read'],
      siteId,
      scopeType: 'page_folder',
      scopeId: podcastsId,
      includeDescendants: true,
      delegable: true,
    });
    expect(podcastAdmins.statusCode).toBe(201);

    const invited = await asAdmin('POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Autora',
      email: 'autora@example.com',
      groupIds: [authors.json().id],
    });
    expect(invited.statusCode).toBe(201);
    authorId = invited.json().user.id;
    const accepted = await call('POST', '/v1/management/auth/invitations/accept', { token: invited.json().inviteToken, password: 'frase-longa-autora' });
    expect(accepted.statusCode).toBe(201);
    authorToken = accepted.json().token;

    const created = await asUser(authorToken, 'POST', `/v1/management/sites/${siteId}/pages`, { title: 'Eurovision 2027', folderId: eurovisionId });
    expect(created.statusCode).toBe(201);
    pageId = created.json().id;
    const edited = await asUser(authorToken, 'PATCH', `/v1/management/sites/${siteId}/pages/${pageId}`, { title: 'Eurovision 2027 — final' });
    expect(edited.statusCode).toBe(200);
    expect(await asUser(authorToken, 'POST', `/v1/management/sites/${siteId}/pages/${pageId}/publish`)).toMatchObject({ statusCode: 403 });
    expect((await asUser(authorToken, 'POST', `/v1/management/sites/${siteId}/pages`, { title: 'Fora', folderId: podcastsId })).statusCode).toBe(403);
    expect((await asUser(authorToken, 'POST', `/v1/management/sites/${siteId}/pages/${pageId}/move`, { folderId: podcastsId })).statusCode).toBe(403);
    const listed = await asUser(authorToken, 'GET', `/v1/management/sites/${siteId}/pages`);
    expect(listed.json().data.map((page: { id: string }) => page.id)).toContain(pageId);
    expect((await asUser(authorToken, 'POST', `/v1/management/sites/${siteId}/media`)).statusCode).toBeGreaterThanOrEqual(400);

    const publisherInvite = await asAdmin('POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Publicador',
      email: 'publicador@example.com',
      groupIds: [publishers.json().id],
    });
    publisherToken = (await call('POST', '/v1/management/auth/invitations/accept', { token: publisherInvite.json().inviteToken, password: 'frase-longa-publicador' })).json().token;
    const published = await asUser(publisherToken, 'POST', `/v1/management/sites/${siteId}/pages/${pageId}/publish`);
    expect(published.statusCode).toBe(201);

    const denied = await asUser(authorToken, 'GET', `/v1/management/access/explain?siteId=${siteId}&permission=pages.publish&folderId=${eurovisionId}`);
    expect(denied.json().allowed).toBe(false);
    const allowed = await asUser(publisherToken, 'GET', `/v1/management/access/explain?siteId=${siteId}&permission=pages.publish&folderId=${eurovisionId}`);
    expect(allowed.json().allowed).toBe(true);

    const podcastInvite = await asAdmin('POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Podcasts',
      email: 'podcasts@example.com',
      groupIds: [podcastAdmins.json().id],
    });
    podcastToken = (await call('POST', '/v1/management/auth/invitations/accept', { token: podcastInvite.json().inviteToken, password: 'frase-longa-podcast' })).json().token;
    const localAuthor = await asUser(podcastToken, 'POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Autora de podcast',
      email: 'podcast-autora@example.com',
      grant: { siteId, scopeType: 'page_folder', scopeId: podcastsId, includeDescendants: true, permissions: ['pages.read', 'pages.create', 'pages.edit', 'pages.publish'] },
    });
    expect(localAuthor.statusCode).toBe(201);
    expect((await asUser(podcastToken, 'POST', `/v1/management/organizations/${organizationId}/users`, {
      name: 'Invasão',
      email: 'invasao@example.com',
      grant: { siteId, scopeType: 'page_folder', scopeId: newsId, includeDescendants: true, permissions: ['pages.read'] },
    })).statusCode).toBe(403);
    expect((await asUser(podcastToken, 'POST', `/v1/management/organizations/${organizationId}/groups`, {
      name: 'Administradores globais',
      permissions: ['platform.manage'],
    })).statusCode).toBe(403);
    expect((await asUser(podcastToken, 'POST', `/v1/management/users/${authorId}/platform-admin`, { currentPassword: 'frase-longa-podcast' })).statusCode).toBe(403);

    const automation = await asAdmin('POST', '/v1/management/service-accounts', {
      organizationId,
      name: '12 Pontos Automation',
      description: 'Automação editorial',
      grant: { siteId, scopeType: 'page_folder', scopeId: newsId, includeDescendants: true, permissions: ['pages.read', 'pages.create', 'pages.edit'] },
    });
    expect(automation.statusCode).toBe(201);
    serviceToken = automation.json().token;
    serviceUserId = automation.json().user.id;
    expect(serviceToken.startsWith('tscms_')).toBe(true);
    const automated = await asUser(serviceToken, 'POST', `/v1/management/sites/${siteId}/pages`, { title: 'Pauta automática', folderId: newsId });
    expect(automated.statusCode).toBe(201);
    automatedPageId = automated.json().id;
    expect((await asUser(serviceToken, 'POST', `/v1/management/sites/${siteId}/pages/${automatedPageId}/publish`)).statusCode).toBe(403);
    expect((await asUser(publisherToken, 'PATCH', `/v1/management/sites/${siteId}/pages/${automatedPageId}`, { title: 'Pauta revista' })).statusCode).toBe(200);
    expect((await asUser(publisherToken, 'POST', `/v1/management/sites/${siteId}/pages/${automatedPageId}/publish`)).statusCode).toBe(201);

    const history = await asUser(publisherToken, 'GET', `/v1/management/sites/${siteId}/pages/${automatedPageId}/history`);
    expect(history.statusCode).toBe(200);
    const actors = history.json().events.map((event: { actorKind: string; action: string }) => `${event.actorKind}:${event.action}`);
    expect(actors).toContain('service:page.created');
    expect(actors).toContain('human:page.updated');
    expect(actors).toContain('human:page.published');

    const audit = await asAdmin('GET', `/v1/management/audit?organizationId=${organizationId}&kind=service`);
    expect(audit.json().data.some((event: { actorId: string; action: string }) => event.actorId === serviceUserId && event.action === 'page.created')).toBe(true);
    const reset = await asAdmin('POST', `/v1/management/users/${authorId}/password-reset`);
    expect(reset.statusCode).toBe(201);
    const dumped = JSON.stringify((await asAdmin('GET', `/v1/management/audit?organizationId=${organizationId}`)).json());
    expect(dumped).not.toContain(reset.json().resetToken);
    expect(dumped).not.toContain('frase-longa');
    expect(dumped).not.toContain(serviceToken);

    expect((await asAdmin('POST', `/v1/management/users/${login.json().user.id}/disable`)).statusCode).toBe(409);
    expect((await asAdmin('POST', `/v1/management/users/${authorId}/disable`)).statusCode).toBe(201);
    expect((await asUser(authorToken, 'GET', '/v1/management/auth/me')).statusCode).toBe(401);
    const preserved = await asAdmin('GET', `/v1/management/audit?organizationId=${organizationId}&actorId=${authorId}`);
    expect(preserved.json().data.length).toBeGreaterThan(0);

    const outsider = await call('POST', '/v1/management/auth/register', {
      name: 'Outra',
      email: 'outra@example.com',
      password: 'frase-longa-outra',
      organizationName: 'Outra Editora',
    });
    expect((await asUser(outsider.json().token, 'GET', `/v1/management/sites/${siteId}/pages/${pageId}`)).statusCode).toBe(403);
    expect((await asAdmin('POST', `/v1/management/service-accounts/${serviceUserId}/revoke`)).statusCode).toBe(201);
    expect((await asUser(serviceToken, 'GET', `/v1/management/sites/${siteId}/pages/${automatedPageId}`)).statusCode).toBe(401);
  }, 120_000);

  async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) {
    return app.inject({ method, url, payload });
  }

  async function asAdmin(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) {
    return asUser(adminToken, method, url, payload);
  }

  async function asUser(token: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) {
    return app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  }
});
