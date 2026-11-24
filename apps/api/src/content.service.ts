import { Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, sql } from 'drizzle-orm';
import { contentEntries, contentRevisions, contentTypeVersions, contentTypes, searchDocuments } from '@tscms/database';
import { contentTypeCreateSchema, entryWriteSchema } from '@tscms/api-contracts';
import { assertTransition, diffContentType, slugify, validateEntryData } from '@tscms/core-domain';
import type { ContentTypeDefinition, EditorialStatus } from '@tscms/content-schema';
import { AccessService } from './access.service.js';
import { ApiException, isUniqueViolation, page, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class ContentService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async createType(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'site:manage');
    const body = parseInput(contentTypeCreateSchema, input);
    const definition: ContentTypeDefinition = { ...body, version: 1 };
    try {
      return await this.database.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(contentTypes)
          .values({ siteId, name: definition.name, label: definition.label, currentVersion: 1, definition })
          .returning();
        if (!created) throw new ApiException(500, 'internal', 'Falha ao criar o modelo.');
        await tx.insert(contentTypeVersions).values({ contentTypeId: created.id, version: 1, definition, breaking: false });
        await this.access.audit(tx, {
          organizationId: site.organizationId,
          siteId,
          actorId: user.id,
          action: 'content_type.created',
          entityType: 'content_type',
          entityId: created.id,
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'conflict', 'Já existe um modelo com esse nome.');
      throw error;
    }
  }

  async listTypes(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const data = await this.database.db
      .select()
      .from(contentTypes)
      .where(and(eq(contentTypes.siteId, siteId), isNull(contentTypes.deletedAt)));
    return { data };
  }

  async updateType(user: AuthUser, siteId: string, typeId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'site:manage');
    const body = parseInput(contentTypeCreateSchema, input);
    const allowBreaking = Boolean((input as { allowBreaking?: boolean }).allowBreaking);
    const [current] = await this.database.db
      .select()
      .from(contentTypes)
      .where(and(eq(contentTypes.id, typeId), eq(contentTypes.siteId, siteId)))
      .limit(1);
    if (!current) throw new ApiException(404, 'not_found', 'Modelo não encontrado.');
    const change = diffContentType(current.definition, { ...body, version: current.currentVersion });
    if (change.breaking && !allowBreaking) {
      throw new ApiException(409, 'breaking_change', 'A mudança exige uma nova versão explícita.', change.reasons.map((message) => ({ path: 'fields', message })));
    }
    const version = change.breaking ? current.currentVersion + 1 : current.currentVersion;
    const definition: ContentTypeDefinition = { ...body, version };
    const [updated] = await this.database.db.transaction(async (tx) => {
      if (change.breaking) {
        await tx.insert(contentTypeVersions).values({ contentTypeId: typeId, version, definition, breaking: true });
      }
      const rows = await tx
        .update(contentTypes)
        .set({ label: definition.label, currentVersion: version, definition, updatedAt: new Date() })
        .where(eq(contentTypes.id, typeId))
        .returning();
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'content_type.updated',
        entityType: 'content_type',
        entityId: typeId,
        metadata: { breaking: change.breaking, reasons: change.reasons },
      });
      return rows;
    });
    return updated;
  }

  async createEntry(user: AuthUser, siteId: string, contentTypeId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(entryWriteSchema, input);
    const contentType = await this.mustType(siteId, contentTypeId);
    const issues = validateEntryData(contentType.definition, body.data);
    if (issues.length > 0) throw new ApiException(400, 'validation_error', 'O conteúdo não atende ao modelo.', issues);
    const slug = body.slug ? slugify(body.slug) : slugify(String(body.data.title ?? contentType.name));
    try {
      const [created] = await this.database.db
        .insert(contentEntries)
        .values({
          siteId,
          contentTypeId,
          locale: body.locale,
          slug,
          data: body.data,
          status: 'draft',
        })
        .returning();
      await this.access.audit(this.database.db, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'content.created',
        entityType: 'content_entry',
        entityId: created?.id ?? '',
      });
      return created;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'conflict', 'Já existe conteúdo com esse slug.');
      throw error;
    }
  }

  async listEntries(user: AuthUser, siteId: string, query: { contentTypeId?: string; q?: string; limit?: number; offset?: number }) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const filters = [eq(contentEntries.siteId, siteId), isNull(contentEntries.deletedAt)];
    if (query.contentTypeId) filters.push(eq(contentEntries.contentTypeId, query.contentTypeId));
    if (query.q) filters.push(ilike(contentEntries.slug, `%${query.q}%`));
    const where = and(...filters);
    const data = await this.database.db.select().from(contentEntries).where(where).orderBy(desc(contentEntries.updatedAt)).limit(limit).offset(offset);
    const [{ total }] = await this.database.db.select({ total: sql<number>`count(*)::int` }).from(contentEntries).where(where);
    return page(data, total ?? 0, limit, offset);
  }

  async getEntry(user: AuthUser, siteId: string, entryId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const [entry] = await this.database.db
      .select()
      .from(contentEntries)
      .where(and(eq(contentEntries.id, entryId), eq(contentEntries.siteId, siteId), isNull(contentEntries.deletedAt)))
      .limit(1);
    if (!entry) throw new ApiException(404, 'not_found', 'Conteúdo não encontrado.');
    return entry;
  }

  async updateEntry(user: AuthUser, siteId: string, entryId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(entryWriteSchema, input);
    const current = await this.getEntry(user, siteId, entryId);
    if (body.expectedVersion && body.expectedVersion !== current.version) {
      throw new ApiException(409, 'conflict', 'O conteúdo foi alterado por outra pessoa.');
    }
    const contentType = await this.mustType(siteId, current.contentTypeId);
    const issues = validateEntryData(contentType.definition, body.data);
    if (issues.length > 0) throw new ApiException(400, 'validation_error', 'O conteúdo não atende ao modelo.', issues);
    const [updated] = await this.database.db
      .update(contentEntries)
      .set({ data: body.data, version: current.version + 1, updatedAt: new Date(), slug: body.slug ? slugify(body.slug) : current.slug })
      .where(and(eq(contentEntries.id, entryId), eq(contentEntries.version, current.version)))
      .returning();
    if (!updated) throw new ApiException(409, 'conflict', 'O conteúdo foi alterado por outra pessoa.');
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'content.updated',
      entityType: 'content_entry',
      entityId: entryId,
    });
    return updated;
  }

  async publishEntry(user: AuthUser, siteId: string, entryId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    return this.database.db.transaction(async (tx) => {
      const [current] = await tx.select().from(contentEntries).where(eq(contentEntries.id, entryId)).for('update');
      if (!current || current.siteId !== siteId || current.deletedAt) throw new ApiException(404, 'not_found', 'Conteúdo não encontrado.');
      try {
        assertTransition(current.status as EditorialStatus, 'published');
      } catch (error) {
        throw new ApiException(409, 'invalid_transition', error instanceof Error ? error.message : 'Transição inválida.');
      }
      const [revision] = await tx
        .insert(contentRevisions)
        .values({ entryId, version: current.version, data: current.data, status: 'published', createdBy: user.id })
        .returning();
      if (!revision) throw new ApiException(500, 'internal', 'Falha ao gravar a revisão.');
      const [updated] = await tx
        .update(contentEntries)
        .set({ status: 'published', publishedRevisionId: revision.id, updatedAt: new Date() })
        .where(eq(contentEntries.id, entryId))
        .returning();
      const contentType = await this.mustType(siteId, current.contentTypeId);
      await tx
        .insert(searchDocuments)
        .values({
          siteId,
          locale: current.locale,
          kind: contentType.name,
          refId: entryId,
          title: String(current.data.title ?? current.slug),
          body: JSON.stringify(current.data),
          slug: current.slug,
          status: 'published',
        })
        .onConflictDoUpdate({
          target: [searchDocuments.siteId, searchDocuments.kind, searchDocuments.refId],
          set: { title: String(current.data.title ?? current.slug), body: JSON.stringify(current.data), status: 'published', updatedAt: new Date() },
        });
      await this.access.audit(tx, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'content.published',
        entityType: 'content_entry',
        entityId: entryId,
        metadata: { revisionId: revision.id },
      });
      return { entry: updated, revision };
    });
  }

  async unpublishEntry(user: AuthUser, siteId: string, entryId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    const [updated] = await this.database.db
      .update(contentEntries)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(and(eq(contentEntries.id, entryId), eq(contentEntries.siteId, siteId)))
      .returning();
    if (!updated) throw new ApiException(404, 'not_found', 'Conteúdo não encontrado.');
    await this.database.db.update(searchDocuments).set({ status: 'draft' }).where(eq(searchDocuments.refId, entryId));
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'content.unpublished',
      entityType: 'content_entry',
      entityId: entryId,
    });
    return updated;
  }

  async rollbackEntry(user: AuthUser, siteId: string, entryId: string, revisionId: string) {
    await this.access.requireSite(user.id, siteId, 'content:publish');
    const [revision] = await this.database.db.select().from(contentRevisions).where(and(eq(contentRevisions.id, revisionId), eq(contentRevisions.entryId, entryId))).limit(1);
    if (!revision) throw new ApiException(404, 'not_found', 'Revisão não encontrada.');
    await this.updateEntry(user, siteId, entryId, { data: revision.data, locale: 'pt-BR' });
    return this.publishEntry(user, siteId, entryId);
  }

  private async mustType(siteId: string, contentTypeId: string) {
    const [contentType] = await this.database.db
      .select()
      .from(contentTypes)
      .where(and(eq(contentTypes.id, contentTypeId), eq(contentTypes.siteId, siteId), isNull(contentTypes.deletedAt)))
      .limit(1);
    if (!contentType) throw new ApiException(404, 'not_found', 'Modelo não encontrado.');
    return contentType;
  }
}
