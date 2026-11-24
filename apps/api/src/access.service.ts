import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { auditEvents, memberships, sites, type Database } from '@tscms/database';
import { roleAllows, type Permission } from '@tscms/core-domain';
import { ApiException } from './common.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AccessService {
  constructor(private readonly database: DatabaseService) {}

  async requireSite(userId: string, siteId: string, permission: Permission) {
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.id, siteId), isNull(sites.deletedAt))).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    await this.requireOrg(userId, site.organizationId, permission, site.id);
    return site;
  }

  async requireOrg(userId: string, organizationId: string, permission: Permission, siteId?: string) {
    const [membership] = await this.database.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
      .limit(1);
    if (!membership || !roleAllows(membership.role, permission)) {
      throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    }
    if (siteId && membership.siteIds && !membership.siteIds.includes(siteId)) {
      throw new ApiException(403, 'forbidden', 'O acesso não inclui este site.');
    }
    return membership;
  }

  async audit(
    db: Database,
    event: {
      organizationId: string;
      siteId?: string | null;
      actorId?: string | null;
      action: string;
      entityType: string;
      entityId: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    await db.insert(auditEvents).values({
      organizationId: event.organizationId,
      siteId: event.siteId ?? null,
      actorId: event.actorId ?? null,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: event.metadata ?? {},
    });
  }
}
