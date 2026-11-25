import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, migrateDatabase } from '@tscms/database';
import { DeliveryClient } from '@tscms/delivery-sdk';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://tscms:tscms@127.0.0.1:5432/tscms_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.PUBLIC_BASE_URL = 'http://127.0.0.1:3000';
process.env.MEDIA_ROOT = path.join(tmpdir(), 'tscms-media-test');
process.env.PUBLISH_ROOT = path.join(tmpdir(), 'tscms-publish-test');

const { createApp } = await import('./main.js');

describe('fluxo editorial de ponta a ponta', () => {
  let app: NestFastifyApplication;
  let token = '';
  let organizationId = '';
  let workspaceId = '';
  let siteId = '';
  let siteKey = '';
  let typeId = '';
  let entryId = '';
  let revisionId = '';
  let pageId = '';
  let pollId = '';

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
  });

  it('cria organização, site, artigo, página, publicação e consumo externo', async () => {
    const registered = await inject('POST', '/v1/management/auth/register', {
      name: 'Ana Editora',
      email: 'ana@example.com',
      password: 'senha-segura-123',
      organizationName: 'Revista Norte',
    });
    if (registered.statusCode !== 201) throw new Error(registered.body);
    token = registered.json().token;
    organizationId = registered.json().organization.id;

    const workspaces = await inject('GET', `/v1/management/organizations/${organizationId}/workspaces`);
    workspaceId = workspaces.json().data[0].id;
    const site = await inject('POST', `/v1/management/organizations/${organizationId}/workspaces/${workspaceId}/sites`, {
      name: 'Revista Demonstração',
      key: 'revista-demonstracao',
      locales: ['pt-BR'],
    });
    expect(site.statusCode).toBe(201);
    siteId = site.json().id;
    siteKey = site.json().key;

    const type = await inject('POST', `/v1/management/sites/${siteId}/content-types`, {
      name: 'article',
      label: 'Artigo',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'excerpt', type: 'text' },
        { name: 'body', type: 'richtext', required: true },
      ],
    });
    expect(type.statusCode).toBe(201);
    typeId = type.json().id;

    const entry = await inject('POST', `/v1/management/sites/${siteId}/content-types/${typeId}/entries`, {
      data: {
        title: 'Primeira matéria',
        excerpt: 'Um resumo',
        body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Corpo da matéria.' }] }] },
      },
    });
    expect(entry.statusCode).toBe(201);
    entryId = entry.json().id;

    const conflict = await inject('PATCH', `/v1/management/sites/${siteId}/content/${entryId}`, {
      data: entry.json().data,
      expectedVersion: 99,
    });
    expect(conflict.statusCode).toBe(409);

    const published = await inject('POST', `/v1/management/sites/${siteId}/content/${entryId}/publish`);
    expect(published.statusCode).toBe(201);
    revisionId = published.json().revision.id;

    const client = new DeliveryClient({
      baseUrl: 'http://tscms.test',
      siteKey,
      fetchImpl: async (url, init) => {
        const target = new URL(String(url));
        const response = await app.inject({ method: 'GET', url: `${target.pathname}${target.search}`, headers: init?.headers as Record<string, string> });
        return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } });
      },
    });
    const article = await client.getContent(entryId);
    expect(article.data.title).toBe('Primeira matéria');
    const collection = await client.listCollection('article');
    expect(collection.data).toHaveLength(1);

    const fragment = await inject('POST', `/v1/management/sites/${siteId}/experience-fragments`, {
      title: 'Chamada de capa',
      document: {
        schemaVersion: 1,
        id: 'cta',
        type: 'experienceFragment',
        locale: 'pt-BR',
        metadata: { title: 'Chamada de capa' },
        slots: {
          main: {
            sections: [
              {
                id: 'section',
                children: [{ id: 'cta-1', type: 'block', name: 'cta', data: { title: 'Assine a revista', text: 'Semanal', label: 'Assinar', href: '/assinar' } }],
              },
            ],
          },
        },
      },
    });
    expect(fragment.statusCode).toBe(201);
    const fragmentPublished = await inject('POST', `/v1/management/sites/${siteId}/experience-fragments/${fragment.json().id}/publish`);
    expect(fragmentPublished.statusCode).toBe(201);

    const blueprints = await inject('POST', `/v1/management/sites/${siteId}/templates/blueprints`);
    const articleTemplate = blueprints.json().data.find((item: { key: string }) => item.key === 'article');
    expect(articleTemplate).toBeTruthy();
    expect((await inject('POST', `/v1/management/sites/${siteId}/templates/${articleTemplate.id}/publish`)).statusCode).toBe(201);

    const page = await inject('POST', `/v1/management/sites/${siteId}/pages`, {
      title: 'Capa',
      slug: 'capa',
      templateId: articleTemplate.id,
      document: {
        schemaVersion: 1,
        id: 'capa',
        type: 'page',
        locale: 'pt-BR',
        templateId: articleTemplate.id,
        metadata: { title: 'Capa da revista', description: 'Edição de demonstração', language: 'pt-BR' },
        slots: {
          main: {
            sections: [
              {
                id: 'section-main',
                metadata: { style: ['highlight'], anchorId: 'topo' },
                children: [{ id: 'heading-1', type: 'defaultContent', element: 'heading', data: { text: 'Bem-vindo', level: 1, anchor: 'topo' } }],
              },
            ],
          },
          body: {
            sections: [
              {
                id: 'section-body',
                children: [
                  {
                    id: 'hero-1',
                    type: 'block',
                    name: 'hero',
                    variant: 'centered',
                    data: {
                      eyebrow: 'Edição',
                      title: 'Revista Norte',
                      description: 'Conteúdo de exemplo',
                      image: { src: '/media/hero.webp', alt: 'Capa' },
                      primaryLabel: 'Ler matéria',
                      primaryHref: '/capa',
                    },
                  },
                  {
                    id: 'cards-1',
                    type: 'block',
                    name: 'cards',
                    data: { cards: [{ title: 'Card A', text: 'Descrição do card.', href: '/a', image: { src: '/media/a.webp', alt: 'Card' } }] },
                  },
                  { id: 'ref-1', type: 'fragmentReference', fragmentId: fragment.json().id, mode: 'linked', path: fragment.json().path },
                ],
              },
            ],
          },
        },
      },
    });
    expect(page.statusCode).toBe(201);
    pageId = page.json().id;
    const opened = await inject('GET', `/v1/management/sites/${siteId}/pages/${pageId}`);
    expect(opened.statusCode).toBe(200);
    expect(opened.json().path).toBe('/capa');
    const folder = await inject('POST', `/v1/management/sites/${siteId}/folders`, { name: 'Blog' });
    expect(folder.statusCode).toBe(201);
    const nested = await inject('POST', `/v1/management/sites/${siteId}/pages`, {
      title: 'Artigo interno',
      folderId: folder.json().id,
    });
    expect(nested.statusCode).toBe(201);
    expect(nested.json().path).toBe('/blog/artigo-interno');
    const nestedOpen = await inject('GET', `/v1/management/sites/${siteId}/pages/${nested.json().id}`);
    expect(nestedOpen.statusCode).toBe(200);
    expect(nestedOpen.json().document.metadata.title).toBe('Artigo interno');
    const listed = await inject('GET', `/v1/management/sites/${siteId}/pages`);
    expect(listed.json().data.some((item: { id: string; path: string }) => item.id === nested.json().id && item.path === '/blog/artigo-interno')).toBe(true);
    const rootOnly = await inject('GET', `/v1/management/sites/${siteId}/tree`);
    expect(rootOnly.json().pages.some((item: { id: string }) => item.id === nested.json().id)).toBe(false);
    const folders = await inject('GET', `/v1/management/sites/${siteId}/folders`);
    expect(folders.json().data.some((item: { id: string; path: string }) => item.id === folder.json().id && item.path === '/blog')).toBe(true);
    const edited = await inject('PATCH', `/v1/management/sites/${siteId}/pages/${nested.json().id}`, {
      title: 'Artigo interno',
      slug: 'artigo-interno',
      path: '/blog/artigo-interno',
      locale: 'pt-BR',
      folderId: folder.json().id,
      expectedVersion: nested.json().version,
      document: {
        ...nested.json().document,
        metadata: {
          ...nested.json().document.metadata,
          description: 'Resumo do artigo',
          canonical: 'https://revista.example/blog/artigo-interno',
          robots: 'index,follow',
          openGraph: { title: 'OG do artigo', image: 'https://revista.example/capa.jpg' },
        },
      },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().document.metadata.description).toBe('Resumo do artigo');
    expect(edited.json().document.metadata.openGraph.title).toBe('OG do artigo');
    expect(edited.json().path).toBe('/blog/artigo-interno');
    const moved = await inject('PATCH', `/v1/management/sites/${siteId}/pages/${nested.json().id}`, {
      title: 'Artigo interno',
      slug: 'artigo-movido',
      path: '/artigo-movido',
      folderId: null,
      document: edited.json().document,
      expectedVersion: edited.json().version,
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().path).toBe('/artigo-movido');
    expect(moved.json().folderId).toBeNull();
    const invalidSlug = await inject('PATCH', `/v1/management/sites/${siteId}/pages/${nested.json().id}`, {
      slug: 'Artigo Interno',
      expectedVersion: moved.json().version,
    });
    expect(invalidSlug.statusCode).toBe(400);
    const pagePublished = await inject('POST', `/v1/management/sites/${siteId}/pages/${pageId}/publish`);
    expect(pagePublished.statusCode).toBe(201);

    const html = await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/pages/by-path?path=/capa&format=html` });
    expect(html.statusCode).toBe(200);
    expect(html.body).toContain('class="hero centered"');
    expect(html.body).toContain('Revista Norte');
    expect(html.body).toContain('class="cards"');
    expect(html.body).toContain('Assine a revista');
    expect(html.body).toContain('<h1');
    expect(html.body).not.toContain('data-reactroot');
    const publishedPages = await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/pages` });
    expect(publishedPages.statusCode).toBe(200);
    expect(publishedPages.json().data.some((item: { path: string }) => item.path === '/capa')).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/pages?pathPrefix=/blog/` })).json().data.some((item: { path: string }) => item.path === '/capa')).toBe(false);
    expect((await inject('POST', `/v1/management/sites/${siteId}/pages/${pageId}/unpublish`)).statusCode).toBe(201);
    const afterUnpublish = await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/pages` });
    expect(afterUnpublish.json().data.some((item: { path: string }) => item.path === '/capa')).toBe(false);
    expect((await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/pages/by-path?path=/capa` })).statusCode).toBe(404);

    const draft = await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/content/${entryId}` });
    expect(draft.statusCode).toBe(200);

    const poll = await inject('POST', `/v1/management/sites/${siteId}/polls`, {
      title: 'Pauta',
      question: 'Qual assunto?',
      options: [
        { id: 'cidade', label: 'Cidade' },
        { id: 'cultura', label: 'Cultura' },
      ],
      visibility: 'hidden',
    });
    pollId = poll.json().id;
    expect((await inject('POST', `/v1/management/sites/${siteId}/polls/${pollId}/publish`)).statusCode).toBe(201);
    const vote = await app.inject({ method: 'POST', url: `/v1/public/polls/${pollId}/votes`, payload: { choices: ['cidade'] } });
    expect(vote.statusCode).toBe(201);
    const hidden = await app.inject({ method: 'GET', url: `/v1/public/polls/${pollId}/results` });
    expect(hidden.statusCode).toBe(403);

    await inject('POST', `/v1/management/sites/${siteId}/feeds`, { title: 'Revista', slug: 'feed', contentTypeNames: ['article'] });
    const rss = await app.inject({ method: 'GET', url: `/v1/delivery/sites/${siteKey}/feed.xml` });
    expect(rss.statusCode).toBe(200);
    expect(rss.body).toContain('Primeira matéria');
    expect(rss.body).not.toContain('rascunho');

    const rolled = await inject('POST', `/v1/management/sites/${siteId}/content/${entryId}/rollback`, { revisionId });
    expect(rolled.statusCode).toBe(201);

    const tree = await inject('GET', `/v1/management/sites/${siteId}/tree`);
    expect(tree.json().pages.some((item: { id: string }) => item.id === pageId)).toBe(true);

    const outsider = await app.inject({
      method: 'GET',
      url: `/v1/management/sites/${siteId}`,
      headers: { authorization: 'Bearer invalido' },
    });
    expect(outsider.statusCode).toBe(401);
  });

  async function inject(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) {
    return app.inject({
      method,
      url,
      payload,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }
});

describe('arquivos publicados', () => {
  it('reserva o diretório de publicação fora do código do site', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tscms-static-'));
    expect(root).not.toContain('/styles/styles.css');
    await expect(readFile(new URL('./main.ts', import.meta.url), 'utf8')).resolves.toContain('createApp');
  });
});
