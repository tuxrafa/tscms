import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { auditEvents, memberships, sites, users, type Database } from '@tscms/database';
import { redactSecrets, roleAllows, type Permission } from '@tscms/core-domain';
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
    const [account] = await this.database.db
      .select({ platformAdmin: users.platformAdmin, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (account?.platformAdmin && account.status === 'active') {
      return { id: 'platform', organizationId, userId, role: 'owner', siteIds: null, createdAt: new Date() };
    }
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
      organizationId?: string | null;
      siteId?: string | null;
      actorId?: string | null;
      actorType?: string;
      action: string;
      result?: string;
      entityType: string;
      entityId: string;
      resourcePath?: string | null;
      requestId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    await db.insert(auditEvents).values({
      organizationId: event.organizationId,
      siteId: event.siteId ?? null,
      actorId: event.actorId ?? null,
      actorType: event.actorType ?? 'human',
      action: event.action,
      result: event.result ?? 'success',
      entityType: event.entityType,
      entityId: event.entityId,
      resourcePath: event.resourcePath ?? null,
      requestId: event.requestId ?? null,
      metadata: redactSecrets(event.metadata ?? {}),
    });
  }
}
