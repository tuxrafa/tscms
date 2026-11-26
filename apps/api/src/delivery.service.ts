import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, like, sql } from 'drizzle-orm';
import {
  assets,
  contentEntries,
  contentFragmentRevisions,
  contentFragments,
  contentRevisions,
  contentTypes,
  experienceFragmentRevisions,
  experienceFragments,
  pageRevisions,
  pages,
  redirects,
  rssFeeds,
  sites,
  templateRevisions,
  templates,
} from '@tscms/database';
import { applySiteChrome, compose, type SiteChrome } from '@tscms/content-composer';
import type { CanonicalDocument } from '@tscms/content-schema';
import type { FragmentLookup } from '@tscms/fragment-resolver';
import { renderPageHtml, renderPlainMain } from '@tscms/eds-compat';
import { renderRobots, renderRss, renderSitemap, writePublishedFiles, type FeedItem } from '@tscms/publishing';
import { createHash } from 'node:crypto';
import { ApiException } from './common.js';
import { DamService } from './dam.service.js';
import { DatabaseService } from './database.service.js';

function siteChrome(config: Record<string, unknown>): SiteChrome | undefined {
  const chrome = config.chrome;
  if (!chrome || typeof chrome !== 'object') return undefined;
  const { headerFragmentId, footerFragmentId } = chrome as Record<string, unknown>;
  return {
    headerFragmentId: typeof headerFragmentId === 'string' ? headerFragmentId : undefined,
    footerFragmentId: typeof footerFragmentId === 'string' ? footerFragmentId : undefined,
  };
}

@Injectable()
export class DeliveryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly dam: DamService,
  ) {}

  async pageByPath(siteKey: string, path: string, format: 'json' | 'html' | 'plain') {
    const site = await this.mustSite(siteKey);
    const [redirect] = await this.database.db
      .select()
      .from(redirects)
      .where(and(eq(redirects.siteId, site.id), eq(redirects.fromPath, path)))
      .limit(1);
    if (redirect) return { redirect };
    const [page] = await this.database.db
      .select()
      .from(pages)
      .where(and(eq(pages.siteId, site.id), eq(pages.path, path), eq(pages.status, 'published'), isNull(pages.deletedAt)))
      .limit(1);
    if (!page || !page.publishedRevisionId) throw new ApiException(404, 'not_found', 'Página publicada não encontrada.');
    const [revision] = await this.database.db.select().from(pageRevisions).where(eq(pageRevisions.id, page.publishedRevisionId)).limit(1);
    if (!revision) throw new ApiException(404, 'not_found', 'Revisão publicada não encontrada.');
    const templateDefinition = page.templateId ? await this.publishedTemplate(page.templateId) : undefined;
    const chrome = siteChrome((site.config ?? {}) as Record<string, unknown>);
    const hydrated = await this.hydrateAssets(site.key, revision.document);
    const composed = this.composePage(site.id, applySiteChrome(hydrated, chrome), templateDefinition);
    if (composed.issues.length > 0) {
      throw new ApiException(409, 'composition', 'A página publicada não pôde ser composta.', composed.issues.map((message) => ({ path: 'document', message })));
    }
    const base = { id: page.id, path: page.path, locale: page.locale, revisionId: revision.id, document: composed.document };
    if (format === 'json') return base;
    const config = (site.config ?? {}) as Record<string, unknown>;
    const html = format === 'plain'
      ? renderPlainMain(composed.document, this.renderContext(site.key, config))
      : renderPageHtml(composed.document, this.renderContext(site.key, config));
    return { ...base, html, etag: this.etag(html) };
  }

  async publishedPages(siteKey: string, pathPrefix?: string) {
    if (pathPrefix !== undefined && !/^\/[a-z0-9/-]*$/.test(pathPrefix)) {
      throw new ApiException(400, 'validation_error', 'O prefixo do caminho é inválido.');
    }
    const site = await this.siteByKey(siteKey);
    const filters = [eq(pages.siteId, site.id), eq(pages.status, 'published'), isNull(pages.deletedAt)];
    if (pathPrefix) filters.push(like(pages.path, `${pathPrefix}%`));
    const rows = await this.database.db
      .select({
        id: pages.id,
        title: pages.title,
        path: pages.path,
        slug: pages.slug,
        locale: pages.locale,
        updatedAt: pages.updatedAt,
        document: pages.document,
      })
      .from(pages)
      .where(and(...filters))
      .orderBy(desc(pages.updatedAt));
    return {
      data: rows.map((row) => ({
        id: row.id,
        title: row.document.metadata.title || row.title,
        path: row.path,
        slug: row.slug,
        locale: row.locale,
        description: row.document.metadata.description ?? row.document.metadata.openGraph?.description ?? '',
        image: row.document.metadata.openGraph?.image ?? '',
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  private async hydrateAssets(siteKey: string, document: CanonicalDocument): Promise<CanonicalDocument> {
    const clone = structuredClone(document);
    const visit = async (value: unknown): Promise<void> => {
      if (Array.isArray(value)) {
        for (const item of value) await visit(item);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      if (typeof record.assetId === 'string') {
        try {
          const pinned = record.versionPolicy === 'pinned' && typeof record.version === 'number' ? record.version : undefined;
          const published = await this.dam.publicAsset(siteKey, record.assetId, pinned);
          const preferred = published.renditions.large ?? published.renditions.medium ?? published.renditions.small ?? published.renditions.thumbnail;
          if (preferred) record.src = preferred.url;
          const srcset = ['thumbnail', 'small', 'medium', 'large', 'xlarge']
            .map((name) => published.renditions[name])
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
            .map((item) => `${item.url} ${item.width}w`)
            .join(', ');
          if (srcset) record.srcset = srcset;
          if (typeof record.alt !== 'string' && published.alt) record.alt = published.alt;
        } catch {
          // Uma referência a asset indisponível mantém o endereço já gravado no documento.
        }
      }
      for (const child of Object.values(record)) await visit(child);
    };
    await visit(clone);
    return clone;
  }

  async contentById(siteKey: string, id: string) {
    const site = await this.mustSite(siteKey);
    const [entry] = await this.database.db
      .select({ entry: contentEntries, typeName: contentTypes.name })
      .from(contentEntries)
      .innerJoin(contentTypes, eq(contentTypes.id, contentEntries.contentTypeId))
      .where(and(eq(contentEntries.siteId, site.id), eq(contentEntries.id, id), eq(contentEntries.status, 'published'), isNull(contentEntries.deletedAt)))
      .limit(1);
    if (!entry?.entry.publishedRevisionId) throw new ApiException(404, 'not_found', 'Conteúdo publicado não encontrado.');
    const [revision] = await this.database.db.select().from(contentRevisions).where(eq(contentRevisions.id, entry.entry.publishedRevisionId)).limit(1);
    if (!revision) throw new ApiException(404, 'not_found', 'Revisão publicada não encontrada.');
    return {
      id: entry.entry.id,
      type: entry.typeName,
      locale: entry.entry.locale,
      slug: entry.entry.slug,
      revisionId: revision.id,
      data: revision.data,
    };
  }

  async collection(siteKey: string, name: string, query: { locale?: string; limit?: number; offset?: number }) {
    const site = await this.mustSite(siteKey);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const filters = [eq(contentEntries.siteId, site.id), eq(contentTypes.name, name), eq(contentEntries.status, 'published'), isNull(contentEntries.deletedAt)];
    if (query.locale) filters.push(eq(contentEntries.locale, query.locale));
    const rows = await this.database.db
      .select({ entry: contentEntries, typeName: contentTypes.name })
      .from(contentEntries)
      .innerJoin(contentTypes, eq(contentTypes.id, contentEntries.contentTypeId))
      .where(and(...filters))
      .orderBy(desc(contentEntries.updatedAt))
      .limit(limit)
      .offset(offset);
    const data = [];
    for (const row of rows) {
      if (!row.entry.publishedRevisionId) continue;
      const [revision] = await this.database.db.select().from(contentRevisions).where(eq(contentRevisions.id, row.entry.publishedRevisionId)).limit(1);
      if (!revision) continue;
      data.push({ id: row.entry.id, type: row.typeName, locale: row.entry.locale, slug: row.entry.slug, revisionId: revision.id, data: revision.data });
    }
    return { data };
  }

  async fragment(siteKey: string, id: string) {
    const site = await this.mustSite(siteKey);
    const [fragment] = await this.database.db
      .select()
      .from(contentFragments)
      .where(and(eq(contentFragments.siteId, site.id), eq(contentFragments.id, id), eq(contentFragments.status, 'published')))
      .limit(1);
    if (fragment?.publishedRevisionId) {
      const [revision] = await this.database.db.select().from(contentFragmentRevisions).where(eq(contentFragmentRevisions.id, fragment.publishedRevisionId)).limit(1);
      return { id: fragment.id, kind: 'content', locale: fragment.locale, slug: fragment.slug, revisionId: revision?.id, data: revision?.data };
    }
    const [experience] = await this.database.db
      .select()
      .from(experienceFragments)
      .where(and(eq(experienceFragments.siteId, site.id), eq(experienceFragments.id, id), eq(experienceFragments.status, 'published')))
      .limit(1);
    if (!experience?.publishedRevisionId) throw new ApiException(404, 'not_found', 'Fragmento publicado não encontrado.');
    const [revision] = await this.database.db.select().from(experienceFragmentRevisions).where(eq(experienceFragmentRevisions.id, experience.publishedRevisionId)).limit(1);
    return { id: experience.id, kind: 'experience', locale: experience.locale, path: experience.path, revisionId: revision?.id, document: revision?.document };
  }

  async search(siteKey: string, q: string, locale?: string) {
    const site = await this.mustSite(siteKey);
    if (!q.trim()) return { data: [] };
    const localeFilter = locale ? sql`and locale = ${locale}` : sql``;
    const rows = await this.database.db.execute<{
      ref_id: string;
      kind: string;
      title: string;
      slug: string | null;
      locale: string;
    }>(sql`
      select ref_id, kind, title, slug, locale
      from search_documents
      where site_id = ${site.id}
        and status = 'published'
        and to_tsvector('simple', title || ' ' || body) @@ plainto_tsquery('simple', ${q})
        ${localeFilter}
      limit 20
    `);
    return { data: rows.rows };
  }

  async media(siteKey: string, id: string) {
    const site = await this.mustSite(siteKey);
    const [asset] = await this.database.db.select().from(assets).where(and(eq(assets.siteId, site.id), eq(assets.id, id), isNull(assets.deletedAt))).limit(1);
    if (!asset) throw new ApiException(404, 'not_found', 'Mídia não encontrada.');
    return {
      id: asset.id,
      filename: asset.filename,
      contentType: asset.contentType,
      alt: asset.alt,
      url: `/v1/delivery/sites/${site.key}/media/${asset.id}/file`,
    };
  }

  async feed(siteKey: string, slug = 'feed') {
    const site = await this.mustSite(siteKey);
    const [feed] = await this.database.db.select().from(rssFeeds).where(and(eq(rssFeeds.siteId, site.id), eq(rssFeeds.slug, slug), eq(rssFeeds.enabled, true))).limit(1);
    const typeName = feed?.contentTypeNames[0] ?? 'article';
    const collection = await this.collection(siteKey, typeName, { limit: feed?.limit ?? 20 });
    const base = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000';
    const items: FeedItem[] = collection.data.map((entry) => ({
      title: String(entry.data.title ?? entry.slug),
      link: `${base}/v1/delivery/sites/${site.key}/content/${entry.id}`,
      description: String(entry.data.excerpt ?? entry.data.description ?? ''),
      guid: entry.revisionId,
      pubDate: new Date().toUTCString(),
      categories: [],
      author: typeof entry.data.authorName === 'string' ? entry.data.authorName : undefined,
    }));
    return renderRss({
      title: feed?.title ?? site.name,
      link: base,
      description: feed?.description ?? site.name,
      language: feed?.language ?? 'pt-BR',
      items,
    });
  }

  async sitemap(siteKey: string) {
    const site = await this.mustSite(siteKey);
    const published = await this.database.db.select().from(pages).where(and(eq(pages.siteId, site.id), eq(pages.status, 'published'), isNull(pages.deletedAt)));
    const base = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000';
    return renderSitemap(published.map((page) => ({ loc: `${base}${page.path}`, lastmod: page.updatedAt.toISOString() })));
  }

  async robots(siteKey: string) {
    const base = process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000';
    return renderRobots(`${base}/v1/delivery/sites/${siteKey}/sitemap.xml`);
  }

  async writeStatic(siteKey: string, path: string) {
    const rendered = await this.pageByPath(siteKey, path, 'html');
    const plain = await this.pageByPath(siteKey, path, 'plain');
    if (!('html' in rendered) || !('html' in plain)) return;
    await writePublishedFiles({
      root: process.env.PUBLISH_ROOT ?? './data/published',
      siteKey,
      path,
      html: rendered.html,
      plain: plain.html,
    });
  }

  private composePage(
    siteId: string,
    document: CanonicalDocument,
    templateDefinition: import('@tscms/content-schema').EditableTemplate | undefined,
  ) {
    const lookup: FragmentLookup = {
      getPublished: (id) => this.fragmentCache.get(`${siteId}:${id}`),
      getRevision: () => undefined,
    };
    return compose({ page: document, template: templateDefinition, fragments: lookup });
  }

  private async publishedTemplate(templateId: string) {
    const [template] = await this.database.db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
    if (!template?.publishedRevisionId) return undefined;
    const [revision] = await this.database.db.select().from(templateRevisions).where(eq(templateRevisions.id, template.publishedRevisionId)).limit(1);
    return revision?.definition;
  }

  private fragmentCache = new Map<string, { id: string; revisionId: string; variation: string; path: string; document: CanonicalDocument }>();

  async warmFragments(siteId: string) {
    const rows = await this.database.db
      .select()
      .from(experienceFragments)
      .where(and(eq(experienceFragments.siteId, siteId), eq(experienceFragments.status, 'published')));
    for (const row of rows) {
      if (!row.publishedRevisionId) continue;
      const [revision] = await this.database.db.select().from(experienceFragmentRevisions).where(eq(experienceFragmentRevisions.id, row.publishedRevisionId)).limit(1);
      if (!revision) continue;
      this.fragmentCache.set(`${siteId}:${row.id}`, {
        id: row.id,
        revisionId: revision.id,
        variation: row.variation,
        path: row.path,
        document: revision.document,
      });
    }
  }

  private renderContext(siteKey: string, siteConfig: Record<string, unknown> = {}) {
    const basePath = typeof siteConfig.basePath === 'string' ? siteConfig.basePath : '';
    return {
      siteKey,
      publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000',
      runtime: 'tscms' as const,
      basePath,
    };
  }

  private etag(body: string) {
    return `"${createHash('sha256').update(body).digest('hex')}"`;
  }

  private async siteByKey(siteKey: string) {
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.key, siteKey), isNull(sites.deletedAt))).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    return site;
  }

  private async mustSite(siteKey: string) {
    const site = await this.siteByKey(siteKey);
    await this.warmFragments(site.id);
    return site;
  }
}
