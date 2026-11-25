import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import {
  assetCollectionItems,
  assetCollections,
  assetFolders,
  assetVariants,
  assetVersions,
  assets,
  sites,
} from '@tscms/database';
import { createImageRenditions, createStorage, detectMedia, sha256, type StorageProvider } from '@tscms/media';
import { z } from 'zod';
import { AccessService } from './access.service.js';
import { ApiException, isUniqueViolation, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

const folderSchema = z.object({ name: z.string().min(1).max(120), parentId: z.string().uuid().nullable().optional() });
const metadataSchema = z.object({
  title: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  alt: z.string().max(500).optional(),
  copyright: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(60)).max(40).optional(),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable().optional(),
  folderId: z.string().uuid().nullable().optional(),
});

@Injectable()
export class DamService {
  private readonly storage: StorageProvider = createStorage();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async listFolders(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const data = await this.database.db
      .select()
      .from(assetFolders)
      .where(and(eq(assetFolders.siteId, siteId), isNull(assetFolders.deletedAt)))
      .orderBy(asc(assetFolders.path));
    return { data };
  }

  async createFolder(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'media:manage');
    const body = parseInput(folderSchema, input);
    const slug = body.name
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw new ApiException(400, 'validation_error', 'Não foi possível gerar o caminho da pasta.');
    let path = `/${slug}`;
    if (body.parentId) {
      const parent = await this.mustFolder(siteId, body.parentId);
      path = `${parent.path}/${slug}`;
    }
    try {
      const [folder] = await this.database.db
        .insert(assetFolders)
        .values({ siteId, parentId: body.parentId ?? null, name: body.name.trim(), path })
        .returning();
      await this.access.audit(this.database.db, {
        organizationId: site.organizationId,
        siteId,
        actorId: user.id,
        action: 'asset.folder_created',
        entityType: 'asset_folder',
        entityId: folder?.id ?? '',
      });
      return folder;
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'conflict', 'Já existe uma pasta nesse caminho.');
      throw error;
    }
  }

  async listAssets(user: AuthUser, siteId: string, query: { folderId?: string; q?: string }) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const filters = [eq(assets.siteId, siteId), isNull(assets.deletedAt)];
    if (query.folderId) filters.push(eq(assets.folderId, query.folderId));
    if (query.q?.trim()) {
      const pattern = `%${query.q.trim()}%`;
      filters.push(or(ilike(assets.filename, pattern), ilike(assets.title, pattern), ilike(assets.description, pattern))!);
    }
    const rows = await this.database.db.select().from(assets).where(and(...filters)).orderBy(desc(assets.updatedAt));
    return { data: rows.map((asset) => this.summary(asset)) };
  }

  async getAsset(user: AuthUser, siteId: string, assetId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const asset = await this.mustAsset(siteId, assetId);
    const versions = await this.database.db.select().from(assetVersions).where(eq(assetVersions.assetId, assetId)).orderBy(desc(assetVersions.version));
    const renditions = await this.database.db.select().from(assetVariants).where(eq(assetVariants.assetId, assetId)).orderBy(asc(assetVariants.width));
    return { ...this.summary(asset), versions, renditions: renditions.filter((item) => item.versionId === versions[0]?.id || versions.length === 0) };
  }

  async upload(user: AuthUser, siteId: string, file: { filename: string; buffer: Buffer }, options: { folderId?: string | null; force?: boolean } = {}) {
    const site = await this.access.requireSite(user.id, siteId, 'media:manage');
    this.assertSize(file.buffer);
    const detected = this.detect(file.buffer);
    const checksum = sha256(file.buffer);
    if (!options.force) {
      const [existing] = await this.database.db
        .select()
        .from(assets)
        .where(and(eq(assets.siteId, siteId), eq(assets.checksum, checksum), isNull(assets.deletedAt)))
        .limit(1);
      if (existing) return { duplicate: true, asset: this.summary(existing) };
    }
    const folder = options.folderId ? await this.mustFolder(siteId, options.folderId) : null;
    const safeName = file.filename.split(/[/\\]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, '-') || 'arquivo';
    const [asset] = await this.database.db
      .insert(assets)
      .values({
        siteId,
        folderId: folder?.id ?? null,
        folder: folder?.path ?? '/',
        filename: safeName,
        title: safeName.replace(/\.[^.]+$/, ''),
        contentType: detected.mime,
        mediaType: detected.mediaType,
        byteSize: file.buffer.length,
        storageKey: 'pending',
        checksum,
        status: 'processing',
        createdBy: user.id,
      })
      .returning();
    if (!asset) throw new ApiException(500, 'internal', 'Falha ao registrar o asset.');
    const stored = await this.storeVersion(asset.id, siteId, 1, detected.mime, checksum, file.buffer, user.id);
    const [updated] = await this.database.db
      .update(assets)
      .set({
        storageKey: stored.storageKey,
        width: stored.width,
        height: stored.height,
        status: 'ready',
        version: 1,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id))
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'asset.created',
      entityType: 'asset',
      entityId: asset.id,
    });
    return { duplicate: false, asset: this.summary(updated ?? asset) };
  }

  async addVersion(user: AuthUser, siteId: string, assetId: string, file: { buffer: Buffer }) {
    const site = await this.access.requireSite(user.id, siteId, 'media:manage');
    const asset = await this.mustAsset(siteId, assetId);
    this.assertSize(file.buffer);
    const detected = this.detect(file.buffer);
    const checksum = sha256(file.buffer);
    const nextVersion = asset.version + 1;
    const stored = await this.storeVersion(asset.id, siteId, nextVersion, detected.mime, checksum, file.buffer, user.id);
    const [updated] = await this.database.db
      .update(assets)
      .set({
        storageKey: stored.storageKey,
        contentType: detected.mime,
        mediaType: detected.mediaType,
        byteSize: file.buffer.length,
        checksum,
        width: stored.width,
        height: stored.height,
        version: nextVersion,
        status: asset.status === 'published' ? 'published' : 'ready',
        updatedAt: new Date(),
      })
      .where(eq(assets.id, asset.id))
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'asset.version_created',
      entityType: 'asset',
      entityId: asset.id,
      metadata: { version: nextVersion },
    });
    return this.summary(updated ?? asset);
  }

  async updateMetadata(user: AuthUser, siteId: string, assetId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'media:manage');
    const body = parseInput(metadataSchema, input);
    await this.mustAsset(siteId, assetId);
    const folder = body.folderId ? await this.mustFolder(siteId, body.folderId) : body.folderId === null ? null : undefined;
    const [updated] = await this.database.db
      .update(assets)
      .set({
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.alt !== undefined ? { alt: body.alt } : {}),
        ...(body.copyright !== undefined ? { copyright: body.copyright } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.focalPoint !== undefined ? { focalPoint: body.focalPoint } : {}),
        ...(folder !== undefined ? { folderId: folder?.id ?? null, folder: folder?.path ?? '/' } : {}),
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'asset.metadata_updated',
      entityType: 'asset',
      entityId: assetId,
    });
    return this.summary(updated!);
  }

  async setStatus(user: AuthUser, siteId: string, assetId: string, status: 'published' | 'ready' | 'archived') {
    const site = await this.access.requireSite(user.id, siteId, status === 'published' ? 'content:publish' : 'media:manage');
    const asset = await this.mustAsset(siteId, assetId);
    if (asset.status === 'processing' || asset.status === 'failed') throw new ApiException(409, 'invalid_transition', 'O arquivo ainda não está pronto.');
    const [updated] = await this.database.db.update(assets).set({ status, updatedAt: new Date() }).where(eq(assets.id, assetId)).returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: status === 'published' ? 'asset.published' : status === 'archived' ? 'asset.archived' : 'asset.unpublished',
      entityType: 'asset',
      entityId: assetId,
    });
    return this.summary(updated!);
  }

  async createCollection(user: AuthUser, siteId: string, input: unknown) {
    await this.access.requireSite(user.id, siteId, 'media:manage');
    const body = parseInput(z.object({ name: z.string().min(1).max(160), description: z.string().max(500).optional() }), input);
    const [collection] = await this.database.db.insert(assetCollections).values({ siteId, name: body.name, description: body.description ?? '' }).returning();
    return collection;
  }

  async listCollections(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(assetCollections).where(eq(assetCollections.siteId, siteId)).orderBy(asc(assetCollections.name)) };
  }

  async addToCollection(user: AuthUser, siteId: string, collectionId: string, assetId: string) {
    await this.access.requireSite(user.id, siteId, 'media:manage');
    const [collection] = await this.database.db.select().from(assetCollections).where(and(eq(assetCollections.id, collectionId), eq(assetCollections.siteId, siteId))).limit(1);
    if (!collection) throw new ApiException(404, 'not_found', 'Coleção não encontrada.');
    await this.mustAsset(siteId, assetId);
    await this.database.db.insert(assetCollectionItems).values({ collectionId, assetId }).onConflictDoNothing();
    return { collectionId, assetId };
  }

  async readRendition(siteKey: string, assetId: string, preset: string, options: { publicOnly: boolean; version?: number }) {
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.key, siteKey), isNull(sites.deletedAt))).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    const [asset] = await this.database.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.siteId, site.id), isNull(assets.deletedAt))).limit(1);
    if (!asset) throw new ApiException(404, 'not_found', 'Asset não encontrado.');
    if (options.publicOnly && asset.status !== 'published') throw new ApiException(404, 'not_found', 'Asset não publicado.');
    const versionNumber = options.version ?? asset.version;
    const [version] = await this.database.db.select().from(assetVersions).where(and(eq(assetVersions.assetId, assetId), eq(assetVersions.version, versionNumber))).limit(1);
    const [rendition] = await this.database.db
      .select()
      .from(assetVariants)
      .where(and(eq(assetVariants.assetId, assetId), eq(assetVariants.preset, preset), version ? eq(assetVariants.versionId, version.id) : eq(assetVariants.assetId, assetId)))
      .limit(1);
    const key = rendition?.storageKey ?? (preset === 'original' ? asset.storageKey : null);
    if (!key) throw new ApiException(404, 'not_found', 'Rendition não encontrada.');
    const body = await this.storage.get(key);
    return { contentType: rendition ? 'image/webp' : asset.contentType, body, version: asset.version };
  }

  async publicAsset(siteKey: string, assetId: string, version?: number) {
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.key, siteKey), isNull(sites.deletedAt))).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    const [asset] = await this.database.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.siteId, site.id), eq(assets.status, 'published'), isNull(assets.deletedAt))).limit(1);
    if (!asset) throw new ApiException(404, 'not_found', 'Asset não publicado.');
    const resolvedVersion = version ?? asset.version;
    const renditions = await this.renditionMap(site.key, asset, resolvedVersion, version !== undefined);
    return {
      id: asset.id,
      type: asset.mediaType,
      title: asset.title || asset.filename,
      description: asset.description,
      alt: asset.alt,
      version: resolvedVersion,
      width: asset.width,
      height: asset.height,
      renditions,
    };
  }

  async renditionMap(siteKey: string, asset: typeof assets.$inferSelect, version = asset.version, pinned = false) {
    const [versionRow] = await this.database.db.select().from(assetVersions).where(and(eq(assetVersions.assetId, asset.id), eq(assetVersions.version, version))).limit(1);
    const rows = await this.database.db.select().from(assetVariants).where(eq(assetVariants.assetId, asset.id));
    const current = rows.filter((row) => !versionRow || row.versionId === versionRow.id);
    const renditions: Record<string, { url: string; width: number; height: number | null }> = {};
    for (const row of current) {
      if (!row.preset) continue;
      const path = pinned
        ? `/v1/delivery/sites/${siteKey}/assets/${asset.id}/versions/${version}/renditions/${row.preset}`
        : `/v1/delivery/sites/${siteKey}/assets/${asset.id}/renditions/${row.preset}`;
      renditions[row.preset] = { url: path, width: row.width, height: row.height };
    }
    return renditions;
  }

  private async storeVersion(assetId: string, siteId: string, version: number, mime: string, checksum: string, body: Buffer, userId: string) {
    const base = `${siteId}/${assetId}/v${version}`;
    const originalKey = `${base}/original`;
    await this.storage.put(originalKey, body);
    let width: number | null = null;
    let height: number | null = null;
    const [versionRow] = await this.database.db
      .insert(assetVersions)
      .values({ assetId, version, storageKey: originalKey, contentType: mime, checksum, byteSize: body.length, createdBy: userId })
      .returning();
    if (mime.startsWith('image/') && mime !== 'image/gif') {
      const processed = await createImageRenditions(body);
      width = processed.width;
      height = processed.height;
      for (const rendition of processed.renditions) {
        const key = `${base}/${rendition.preset}.webp`;
        await this.storage.put(key, rendition.body);
        await this.database.db.insert(assetVariants).values({
          assetId,
          versionId: versionRow?.id,
          preset: rendition.preset,
          width: rendition.width,
          height: rendition.height,
          format: rendition.format,
          storageKey: key,
          byteSize: rendition.body.length,
        });
      }
      if (versionRow) {
        await this.database.db.update(assetVersions).set({ width, height }).where(eq(assetVersions.id, versionRow.id));
      }
    }
    return { storageKey: originalKey, width, height };
  }

  async readManagedRendition(user: AuthUser, siteId: string, assetId: string, preset: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    const asset = await this.mustAsset(siteId, assetId);
    const [site] = await this.database.db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    return this.readRendition(site.key, asset.id, preset, { publicOnly: false });
  }

  private assertSize(body: Buffer) {
    if (body.length <= 0 || body.length > 20 * 1024 * 1024) throw new ApiException(400, 'validation_error', 'Arquivo fora do limite de 20 MB.');
  }

  private detect(body: Buffer) {
    try {
      return detectMedia(body);
    } catch (error) {
      throw new ApiException(400, 'validation_error', error instanceof Error ? error.message : 'Arquivo inválido.');
    }
  }

  private summary(asset: typeof assets.$inferSelect) {
    return {
      id: asset.id,
      siteId: asset.siteId,
      folderId: asset.folderId,
      folder: asset.folder,
      filename: asset.filename,
      title: asset.title || asset.filename,
      description: asset.description,
      alt: asset.alt,
      contentType: asset.contentType,
      mediaType: asset.mediaType,
      byteSize: asset.byteSize,
      checksum: asset.checksum,
      width: asset.width,
      height: asset.height,
      focalPoint: asset.focalPoint,
      tags: asset.tags,
      copyright: asset.copyright,
      status: asset.status,
      version: asset.version,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  }

  private async mustAsset(siteId: string, assetId: string) {
    const [asset] = await this.database.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.siteId, siteId), isNull(assets.deletedAt))).limit(1);
    if (!asset) throw new ApiException(404, 'not_found', 'Asset não encontrado.');
    return asset;
  }

  private async mustFolder(siteId: string, folderId: string) {
    const [folder] = await this.database.db.select().from(assetFolders).where(and(eq(assetFolders.id, folderId), eq(assetFolders.siteId, siteId), isNull(assetFolders.deletedAt))).limit(1);
    if (!folder) throw new ApiException(404, 'not_found', 'Pasta não encontrada.');
    return folder;
  }
}
