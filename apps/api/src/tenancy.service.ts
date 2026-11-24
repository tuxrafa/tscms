import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { memberships, organizations, siteEnvironments, sites, workspaces } from '@tscms/database';
import { siteCreateSchema } from '@tscms/api-contracts';
import { slugify } from '@tscms/core-domain';
import { z } from 'zod';
import { AccessService } from './access.service.js';
import { ApiException, isUniqueViolation, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class TenancyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async listOrganizations(user: AuthUser) {
    const data = await this.database.db
      .select({ id: organizations.id, name: organizations.name, slug: organizations.slug, role: memberships.role })
      .from(organizations)
      .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
      .where(eq(memberships.userId, user.id));
    return { data };
  }

  async createWorkspace(user: AuthUser, organizationId: string, name: string) {
    await this.access.requireOrg(user.id, organizationId, 'org:manage');
    const [workspace] = await this.database.db
      .insert(workspaces)
      .values({ organizationId, name, slug: slugify(name) })
      .returning();
    return workspace;
  }

  async listWorkspaces(user: AuthUser, organizationId: string) {
    await this.access.requireOrg(user.id, organizationId, 'content:read');
    return {
      data: await this.database.db.select().from(workspaces).where(eq(workspaces.organizationId, organizationId)),
    };
  }

  async createSite(user: AuthUser, organizationId: string, workspaceId: string, input: unknown) {
    await this.access.requireOrg(user.id, organizationId, 'site:manage');
    const body = parseInput(siteCreateSchema, input);
    const [workspace] = await this.database.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.organizationId, organizationId)))
      .limit(1);
    if (!workspace) throw new ApiException(404, 'not_found', 'Workspace não encontrado.');
    try {
      return await this.database.db.transaction(async (tx) => {
        const [site] = await tx
          .insert(sites)
          .values({
            organizationId,
            workspaceId,
            key: body.key ?? slugify(body.name),
            name: body.name,
            locales: body.locales,
            domains: body.domains,
            config: {},
          })
          .returning();
        if (!site) throw new ApiException(500, 'internal', 'Falha ao criar site.');
        await tx.insert(siteEnvironments).values([
          { siteId: site.id, name: 'draft', kind: 'draft' },
          { siteId: site.id, name: 'preview', kind: 'preview' },
          { siteId: site.id, name: 'production', kind: 'production' },
        ]);
        await this.access.audit(tx, {
          organizationId,
          siteId: site.id,
          actorId: user.id,
          action: 'site.created',
          entityType: 'site',
          entityId: site.id,
        });
        return site;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ApiException(409, 'conflict', 'A chave do site já existe.');
      throw error;
    }
  }

  async listSites(user: AuthUser, organizationId?: string) {
    const filters = [eq(memberships.userId, user.id), isNull(sites.deletedAt)];
    if (organizationId) filters.push(eq(sites.organizationId, organizationId));
    const data = await this.database.db
      .select({ site: sites })
      .from(sites)
      .innerJoin(memberships, eq(memberships.organizationId, sites.organizationId))
      .where(and(...filters));
    return { data: data.map((row) => row.site) };
  }

  async getSite(user: AuthUser, siteId: string) {
    return this.access.requireSite(user.id, siteId, 'content:read');
  }

  async updateSiteConfig(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'site:manage');
    const body = parseInput(
      z.object({
        domains: z.array(z.string()).optional(),
        locales: z.array(z.string()).min(1).optional(),
        rendererVersion: z.string().optional(),
        siteBuildVersion: z.string().optional(),
        designSystemVersion: z.string().optional(),
        compatibilityStatus: z.string().optional(),
        config: z.record(z.unknown()).optional(),
      }),
      input,
    );
    const [updated] = await this.database.db
      .update(sites)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(sites.id, site.id))
      .returning();
    return updated;
  }
}
