import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  contentFragments,
  contentFragmentRevisions,
  experienceFragmentRevisions,
  experienceFragments,
  folders,
  pageRevisions,
  pages,
  templateRevisions,
  templates,
} from '@tscms/database';
import {
  canonicalDocumentSchema,
  editableTemplateSchema,
  emptyDocument,
  type CanonicalDocument,
  type ContentNode,
  type EditableTemplate,
  type EditorialStatus,
} from '@tscms/content-schema';
import { assertTransition, slugify } from '@tscms/core-domain';
import { blueprintTemplates } from '@tscms/template-engine';
import { z } from 'zod';
import { AccessService } from './access.service.js';
import { ApiException, isUniqueViolation, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

const pageWriteSchema = z.object({
  title: z.string().min(1),
  slug: z.string().optional(),
  /** Absolute site path (e.g. `/` or `/blog/slug`). When omitted, derived from folder + slug. */
  path: z.string().regex(/^\/[a-z0-9/-]*$/).optional(),
  locale: z.string().default('pt-BR'),
  folderId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  templateId: z.string().uuid().optional(),
  document: canonicalDocumentSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
});

@Injectable()
export class ExperienceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async ensureBlueprints(user: AuthUser, siteId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'template:manage');
    const created = [];
    for (const blueprint of blueprintTemplates()) {
      const [existing] = await this.database.db
        .select()
        .from(templates)
        .where(and(eq(templates.siteId, siteId), eq(templates.key, blueprint.key)))
        .limit(1);
      if (existing) {
        created.push(existing);
        continue;
      }
      const [template] = await this.database.db
        .insert(templates)
        .values({
          siteId,
          key: blueprint.key,
          name: blueprint.name,
          description: blueprint.description,
          definition: blueprint.template,
        })
        .returning();
      if (template) created.push(template);
    }
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'template.blueprints_ensured',
      entityType: 'site',
      entityId: siteId,
    });
    return { data: created };
  }

  async createTemplate(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'template:manage');
    const body = parseInput(
      z.object({ key: z.string(), name: z.string(), description: z.string().optional(), definition: editableTemplateSchema }),
      input,
    );
    const [template] = await this.database.db
      .insert(templates)
      .values({ siteId, key: body.key, name: body.name, description: body.description, definition: body.definition })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'template.created',
      entityType: 'template',
      entityId: template?.id ?? '',
    });
    return template;
  }

  async listTemplates(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(templates).where(and(eq(templates.siteId, siteId), isNull(templates.deletedAt))) };
  }

  async publishTemplate(user: AuthUser, siteId: string, templateId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.siteId, siteId))).limit(1);
      if (!current) throw new ApiException(404, 'not_found', 'Template não encontrado.');
      const [revision] = await tx
        .insert(templateRevisions)
        .values({ templateId, version: current.version, definition: current.definition, createdBy: user.id })
        .returning();
      const [updated] = await tx
        .update(templates)
        .set({ status: 'published', publishedRevisionId: revision?.id, updatedAt: new Date() })
        .where(eq(templates.id, templateId))
        .returning();
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'template.published',
        entityType: 'template',
        entityId: templateId,
        metadata: { revisionId: revision?.id },
      });
      return updated;
    });
  }

  async createFolder(user: AuthUser, siteId: string, input: unknown) {
    await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(z.object({ name: z.string().min(1), parentId: z.string().uuid().nullable().optional() }), input);
    const slug = slugify(body.name);
    let parentPath = '';
    if (body.parentId) {
      const [parent] = await this.database.db.select().from(folders).where(eq(folders.id, body.parentId)).limit(1);
      if (!parent || parent.siteId !== siteId) throw new ApiException(404, 'not_found', 'Pasta não encontrada.');
      parentPath = parent.path;
    }
    const [folder] = await this.database.db
      .insert(folders)
      .values({ siteId, parentId: body.parentId ?? null, name: body.name, slug, path: `${parentPath}/${slug}` })
      .returning();
    return folder;
  }

  async listPages(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const data = await this.database.db
      .select({
        id: pages.id,
        title: pages.title,
        path: pages.path,
        slug: pages.slug,
        status: pages.status,
        folderId: pages.folderId,
        version: pages.version,
        locale: pages.locale,
      })
      .from(pages)
      .where(and(eq(pages.siteId, siteId), isNull(pages.deletedAt)))
      .orderBy(asc(pages.path));
    return { data };
  }

  async getPage(user: AuthUser, siteId: string, pageId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return this.mustPage(siteId, pageId);
  }

  async tree(user: AuthUser, siteId: string, parentFolderId?: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const folderFilter = parentFolderId ? eq(folders.parentId, parentFolderId) : isNull(folders.parentId);
    const pageFilter = parentFolderId ? eq(pages.folderId, parentFolderId) : isNull(pages.folderId);
    const folderRows = await this.database.db
      .select()
      .from(folders)
      .where(and(eq(folders.siteId, siteId), folderFilter, isNull(folders.deletedAt)))
      .orderBy(asc(folders.name));
    const pageRows = await this.database.db
      .select()
      .from(pages)
      .where(and(eq(pages.siteId, siteId), pageFilter, isNull(pages.deletedAt)))
      .orderBy(asc(pages.title));
    return { folders: folderRows, pages: pageRows };
  }

  async createPage(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(pageWriteSchema, input);
    const slug = body.path === '/' ? 'home' : slugify(body.slug ?? body.title);
    const path = body.path ?? (await this.pathFor(siteId, body.folderId ?? null, slug));
    let template: EditableTemplate | undefined;
    if (body.templateId) {
      const record = await this.mustTemplate(siteId, body.templateId);
      template = record.definition;
    }
    const document = body.document ?? this.initialPageDocument(slug, body.title, body.locale ?? 'pt-BR', body.templateId, template);
    try {
      const [page] = await this.database.db
        .insert(pages)
        .values({
          siteId,
          folderId: body.folderId ?? null,
          parentId: body.parentId ?? null,
          templateId: body.templateId,
          locale: body.locale,
          title: body.title,
          slug,
          path,
          document,
        })
        .returning();
      await this.access.audit(this.database.db, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'page.created',
        entityType: 'page',
        entityId: page?.id ?? '',
      });
      return page;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'conflict', 'Já existe uma página nesse caminho.');
      throw error;
    }
  }

  async updatePage(user: AuthUser, siteId: string, pageId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(pageWriteSchema.partial(), input);
    const current = await this.mustPage(siteId, pageId);
    if (body.expectedVersion && body.expectedVersion !== current.version) {
      throw new ApiException(409, 'conflict', 'A página foi alterada por outra pessoa.');
    }
    const [updated] = await this.database.db
      .update(pages)
      .set({
        title: body.title ?? current.title,
        document: body.document ?? current.document,
        templateId: body.templateId ?? current.templateId,
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(pages.id, pageId), eq(pages.version, current.version)))
      .returning();
    if (!updated) throw new ApiException(409, 'conflict', 'A página foi alterada por outra pessoa.');
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'page.updated',
      entityType: 'page',
      entityId: pageId,
    });
    return updated;
  }

  async publishPage(user: AuthUser, siteId: string, pageId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(pages).where(eq(pages.id, pageId)).for('update');
      if (!current || current.siteId !== siteId) throw new ApiException(404, 'not_found', 'Página não encontrada.');
      try {
        assertTransition(current.status as EditorialStatus, 'published');
      } catch (error) {
        throw new ApiException(409, 'invalid_transition', error instanceof Error ? error.message : 'Transição inválida.');
      }
      let templateRevisionId: string | undefined;
      if (current.templateId) {
        const [template] = await tx.select().from(templates).where(eq(templates.id, current.templateId)).limit(1);
        templateRevisionId = template?.publishedRevisionId ?? undefined;
        if (!templateRevisionId) throw new ApiException(409, 'dependency', 'O template vinculado ainda não foi publicado.');
      }
      const [revision] = await tx
        .insert(pageRevisions)
        .values({
          pageId,
          version: current.version,
          document: current.document,
          templateRevisionId,
          dependencies: { templateRevisionId },
          createdBy: user.id,
        })
        .returning();
      const [updated] = await tx
        .update(pages)
        .set({ status: 'published', publishedRevisionId: revision?.id, updatedAt: new Date() })
        .where(eq(pages.id, pageId))
        .returning();
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'page.published',
        entityType: 'page',
        entityId: pageId,
        metadata: { revisionId: revision?.id, templateRevisionId },
      });
      return { page: updated, revision };
    });
  }

  async unpublishPage(user: AuthUser, siteId: string, pageId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    const [updated] = await this.database.db
      .update(pages)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(and(eq(pages.id, pageId), eq(pages.siteId, siteId)))
      .returning();
    if (!updated) throw new ApiException(404, 'not_found', 'Página não encontrada.');
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'page.unpublished',
      entityType: 'page',
      entityId: pageId,
    });
    return updated;
  }

  async rollbackPage(user: AuthUser, siteId: string, pageId: string, revisionId: string) {
    const [revision] = await this.database.db.select().from(pageRevisions).where(and(eq(pageRevisions.id, revisionId), eq(pageRevisions.pageId, pageId))).limit(1);
    if (!revision) throw new ApiException(404, 'not_found', 'Revisão não encontrada.');
    await this.updatePage(user, siteId, pageId, { document: revision.document, title: revision.document.metadata.title });
    return this.publishPage(user, siteId, pageId);
  }

  async movePage(user: AuthUser, siteId: string, pageId: string, folderId: string | null) {
    await this.access.requireSite(user.id, siteId, 'content:write');
    const current = await this.mustPage(siteId, pageId);
    const path = await this.pathFor(siteId, folderId, current.slug);
    const [updated] = await this.database.db
      .update(pages)
      .set({ folderId, path, version: current.version + 1, updatedAt: new Date() })
      .where(eq(pages.id, pageId))
      .returning();
    return updated;
  }

  async copyPage(user: AuthUser, siteId: string, pageId: string) {
    const current = await this.mustPage(siteId, pageId);
    return this.createPage(user, siteId, {
      title: `${current.title} cópia`,
      slug: `${current.slug}-copia`,
      locale: current.locale,
      folderId: current.folderId,
      templateId: current.templateId ?? undefined,
      document: current.document,
    });
  }

  async deletePage(user: AuthUser, siteId: string, pageId: string) {
    await this.access.requireSite(user.id, siteId, 'content:write');
    const current = await this.mustPage(siteId, pageId);
    const [updated] = await this.database.db
      .update(pages)
      .set({ deletedAt: new Date(), path: `${current.path}--deleted-${current.id}`, status: 'archived' })
      .where(eq(pages.id, pageId))
      .returning();
    return updated;
  }

  async createContentFragment(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(
      z.object({
        title: z.string(),
        slug: z.string().optional(),
        locale: z.string().default('pt-BR'),
        contentTypeId: z.string().uuid().optional(),
        data: z.record(z.unknown()),
      }),
      input,
    );
    const [fragment] = await this.database.db
      .insert(contentFragments)
      .values({ siteId, title: body.title, slug: slugify(body.slug ?? body.title), locale: body.locale, contentTypeId: body.contentTypeId, data: body.data })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'content_fragment.created',
      entityType: 'content_fragment',
      entityId: fragment?.id ?? '',
    });
    return fragment;
  }

  async publishContentFragment(user: AuthUser, siteId: string, fragmentId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(contentFragments).where(and(eq(contentFragments.id, fragmentId), eq(contentFragments.siteId, siteId))).limit(1);
      if (!current) throw new ApiException(404, 'not_found', 'Fragmento não encontrado.');
      const [revision] = await tx
        .insert(contentFragmentRevisions)
        .values({ fragmentId, version: current.version, data: current.data, createdBy: user.id })
        .returning();
      const [updated] = await tx
        .update(contentFragments)
        .set({ status: 'published', publishedRevisionId: revision?.id, updatedAt: new Date() })
        .where(eq(contentFragments.id, fragmentId))
        .returning();
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'fragment.published',
        entityType: 'content_fragment',
        entityId: fragmentId,
      });
      return updated;
    });
  }

  async listContentFragments(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(contentFragments).where(and(eq(contentFragments.siteId, siteId), isNull(contentFragments.deletedAt))) };
  }

  async createExperienceFragment(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(
      z.object({
        title: z.string(),
        slug: z.string().optional(),
        path: z.string().optional(),
        locale: z.string().default('pt-BR'),
        variation: z.string().default('default'),
        document: canonicalDocumentSchema.optional(),
      }),
      input,
    );
    const slug = slugify(body.slug ?? body.title);
    const path = body.path ?? `/fragments/${slug}`;
    const document = body.document ?? emptyDocument({ id: slug, type: 'experienceFragment', title: body.title, locale: body.locale });
    const [fragment] = await this.database.db
      .insert(experienceFragments)
      .values({ siteId, title: body.title, slug, path, locale: body.locale, variation: body.variation, document })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'experience_fragment.created',
      entityType: 'experience_fragment',
      entityId: fragment?.id ?? '',
    });
    return fragment;
  }

  async publishExperienceFragment(user: AuthUser, siteId: string, fragmentId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(experienceFragments).where(and(eq(experienceFragments.id, fragmentId), eq(experienceFragments.siteId, siteId))).limit(1);
      if (!current) throw new ApiException(404, 'not_found', 'Fragmento de experiência não encontrado.');
      const [revision] = await tx
        .insert(experienceFragmentRevisions)
        .values({ fragmentId, version: current.version, document: current.document, createdBy: user.id })
        .returning();
      const [updated] = await tx
        .update(experienceFragments)
        .set({ status: 'published', publishedRevisionId: revision?.id, updatedAt: new Date() })
        .where(eq(experienceFragments.id, fragmentId))
        .returning();
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'fragment.published',
        entityType: 'experience_fragment',
        entityId: fragmentId,
        metadata: { revisionId: revision?.id },
      });
      return updated;
    });
  }

  async listExperienceFragments(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(experienceFragments).where(and(eq(experienceFragments.siteId, siteId), isNull(experienceFragments.deletedAt))) };
  }

  async saveSelectionAsFragment(user: AuthUser, siteId: string, input: unknown) {
    await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(z.object({ pageId: z.string().uuid(), nodeIds: z.array(z.string()).min(1), title: z.string().min(1) }), input);
    const page = await this.mustPage(siteId, body.pageId);
    const selected: ContentNode[] = [];
    const document = structuredClone(page.document);
    for (const slot of Object.values(document.slots)) {
      for (const section of slot.sections) {
        section.children = section.children.filter((node) => {
          if (!body.nodeIds.includes(node.id)) return true;
          selected.push(node);
          return false;
        });
      }
    }
    if (selected.length !== body.nodeIds.length) throw new ApiException(400, 'validation_error', 'Algum bloco selecionado não está na página.');
    return this.database.db.transaction(async (tx) => {
      const slug = slugify(body.title);
      const fragmentDocument = emptyDocument({ id: slug, type: 'experienceFragment', title: body.title, locale: page.locale });
      const section = fragmentDocument.slots.main?.sections[0];
      if (section) section.children = selected;
      const [fragment] = await tx
        .insert(experienceFragments)
        .values({ siteId, title: body.title, slug, path: `/fragments/${slug}`, locale: page.locale, document: fragmentDocument })
        .returning();
      if (!fragment) throw new ApiException(500, 'internal', 'Falha ao criar o fragmento.');
      const reference: ContentNode = {
        id: `ref-${fragment.id}`,
        type: 'fragmentReference',
        fragmentId: fragment.id,
        mode: 'linked',
        path: fragment.path,
      };
      const main = document.slots.main?.sections[0];
      main?.children.push(reference);
      await tx.update(pages).set({ document, version: page.version + 1, updatedAt: new Date() }).where(and(eq(pages.id, page.id), eq(pages.version, page.version)));
      return { fragment, pageId: page.id };
    });
  }

  private initialPageDocument(
    id: string,
    title: string,
    locale: string,
    templateId: string | undefined,
    template: EditableTemplate | undefined,
  ): CanonicalDocument {
    const document = emptyDocument({ id, type: 'page', title, locale, templateId });
    if (!template) return document;
    for (const policy of template.policies) {
      if (policy.policy === 'locked' || policy.policy === 'shared') continue;
      const initial = template.initial.slots[policy.id];
      if (initial) document.slots[policy.id] = structuredClone(initial);
    }
    return document;
  }

  private async pathFor(siteId: string, folderId: string | null, slug: string): Promise<string> {
    if (!folderId) return `/${slug}`;
    const [folder] = await this.database.db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.siteId, siteId))).limit(1);
    if (!folder) throw new ApiException(404, 'not_found', 'Pasta não encontrada.');
    return `${folder.path}/${slug}`;
  }

  private async mustPage(siteId: string, pageId: string) {
    const [page] = await this.database.db.select().from(pages).where(and(eq(pages.id, pageId), eq(pages.siteId, siteId), isNull(pages.deletedAt))).limit(1);
    if (!page) throw new ApiException(404, 'not_found', 'Página não encontrada.');
    return page;
  }

  private async mustTemplate(siteId: string, templateId: string) {
    const [template] = await this.database.db.select().from(templates).where(and(eq(templates.id, templateId), eq(templates.siteId, siteId))).limit(1);
    if (!template) throw new ApiException(404, 'not_found', 'Template não encontrado.');
    return template;
  }
}
