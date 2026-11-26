import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { assetFolders, folders, iamAccessGrants, iamGroupMembers, memberships, sites, users } from '@tscms/database';
import { decideAccess, isIamPermission, orgRoleAllows, type GrantRef, type IamPermission, type ResourceRef, type ScopeType } from '@tscms/core-domain';
import { AccessService } from './access.service.js';
import { ApiException, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

interface LoadedAccess {
  site: typeof sites.$inferSelect | null;
  platformAdmin: boolean;
  member: boolean;
  orgRole: string | null;
  siteAllowed: boolean;
  grants: GrantRef[];
}

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async assert(user: AuthUser, siteId: string, permission: IamPermission, resource: ResourceRef) {
    const decision = await this.evaluate(user, siteId, permission, resource);
    if (!decision.site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    if (!decision.allowed) {
      await this.access.audit(this.database.db, {
        organizationId: decision.site.organizationId,
        siteId,
        actorId: user.id,
        actorType: user.kind === 'service' ? 'service' : 'human',
        action: 'access.denied',
        result: 'denied',
        entityType: resource.kind,
        entityId: resource.folderId ?? siteId,
        resourcePath: decision.resourcePath,
        metadata: { permission, reason: decision.reason },
      });
      throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    }
    return decision.site;
  }

  async explain(user: AuthUser, siteId: string, permission: IamPermission, resource: ResourceRef) {
    const decision = await this.evaluate(user, siteId, permission, resource);
    if (!decision.site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    return { allowed: decision.allowed, reason: decision.reason, matchedGrantIds: decision.matchedGrantIds };
  }

  /** `all` means every folder. An empty set means the caller is a member with no matching grant. */
  async scope(user: AuthUser, siteId: string, permission: IamPermission, kind: 'page' | 'asset'): Promise<'all' | Set<string | null>> {
    const context = await this.load(user.id, siteId);
    if (!context.site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    if (!context.member) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    if (context.platformAdmin || (context.siteAllowed && orgRoleAllows(context.orgRole, permission))) return 'all';
    const { parents } = await this.folderIndex(siteId, kind);
    const visible = new Set<string | null>();
    for (const grant of context.grants) {
      if (!grant.permissions.includes(permission)) continue;
      if (grant.scopeType === 'site' || grant.scopeType === 'organization' || grant.scopeType === 'platform') return 'all';
      const expected = kind === 'asset' ? 'asset_folder' : 'page_folder';
      if (grant.scopeType !== expected || !grant.scopeId) continue;
      if (grant.includeDescendants) {
        for (const id of parents.keys()) {
          if (this.descends(id, grant.scopeId, parents)) visible.add(id);
        }
      } else {
        visible.add(grant.scopeId);
      }
    }
    return visible;
  }

  async hierarchy(siteId: string, kind: 'page' | 'asset') {
    return this.folderIndex(siteId, kind);
  }

  async evaluate(user: AuthUser, siteId: string, permission: IamPermission, resource: ResourceRef) {
    const context = await this.load(user.id, siteId);
    if (!context.site) return { site: null, allowed: false, reason: 'Site não encontrado.', matchedGrantIds: [] as string[], resourcePath: null };
    const { parents, paths } = await this.folderIndex(siteId, resource.kind === 'asset' ? 'asset' : 'page');
    const decision = decideAccess({
      platformAdmin: context.platformAdmin,
      orgRole: context.member ? context.orgRole : null,
      siteAllowed: context.siteAllowed,
      grants: context.member ? context.grants : [],
      permission,
      resource,
      parents,
    });
    return { site: context.site, ...decision, resourcePath: resource.folderId ? paths.get(resource.folderId) ?? null : null };
  }

  private async load(userId: string, siteId: string): Promise<LoadedAccess> {
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.id, siteId), isNull(sites.deletedAt))).limit(1);
    if (!site) return { site: null, platformAdmin: false, member: false, orgRole: null, siteAllowed: false, grants: [] };
    const [account] = await this.database.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const active = account?.status === 'active';
    const platformAdmin = Boolean(active && account?.platformAdmin);
    const [membership] = await this.database.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, site.organizationId)))
      .limit(1);
    const groups = await this.database.db.select({ roleId: iamGroupMembers.roleId }).from(iamGroupMembers).where(eq(iamGroupMembers.userId, userId));
    const roleIds = groups.map((group) => group.roleId);
    const subject = roleIds.length
      ? or(eq(iamAccessGrants.userId, userId), inArray(iamAccessGrants.roleId, roleIds))
      : eq(iamAccessGrants.userId, userId);
    const rows = await this.database.db
      .select()
      .from(iamAccessGrants)
      .where(and(eq(iamAccessGrants.organizationId, site.organizationId), subject));
    const grants: GrantRef[] = [];
    for (const row of rows) {
      if (!this.isScope(row.scopeType)) continue;
      grants.push({
        id: row.id,
        scopeType: row.scopeType,
        scopeId: row.scopeId,
        includeDescendants: row.includeDescendants,
        permissions: row.permissions,
        label: row.label || undefined,
      });
    }
    return {
      site,
      platformAdmin,
      member: platformAdmin || (Boolean(membership) && active),
      orgRole: membership?.role ?? null,
      siteAllowed: !membership?.siteIds || membership.siteIds.includes(siteId),
      grants,
    };
  }

  private async folderIndex(siteId: string, kind: 'page' | 'asset') {
    const rows = kind === 'asset'
      ? await this.database.db
          .select({ id: assetFolders.id, parentId: assetFolders.parentId, path: assetFolders.path })
          .from(assetFolders)
          .where(and(eq(assetFolders.siteId, siteId), isNull(assetFolders.deletedAt)))
      : await this.database.db
          .select({ id: folders.id, parentId: folders.parentId, path: folders.path })
          .from(folders)
          .where(and(eq(folders.siteId, siteId), isNull(folders.deletedAt)));
    const parents = new Map<string, string | null>();
    const paths = new Map<string, string>();
    for (const row of rows) {
      parents.set(row.id, row.parentId);
      paths.set(row.id, row.path);
    }
    return { parents, paths };
  }

  private descends(id: string, scopeId: string, parents: Map<string, string | null>): boolean {
    let current: string | null = id;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === scopeId) return true;
      seen.add(current);
      current = parents.get(current) ?? null;
    }
    return false;
  }

  private isScope(value: string): value is ScopeType {
    return value === 'platform' || value === 'organization' || value === 'site' || value === 'page_folder' || value === 'asset_folder' || value === 'resource';
  }
}

export function parsePermission(value: string): IamPermission {
  if (!isIamPermission(value)) throw new ApiException(400, 'validation_error', 'Permissão desconhecida.');
  return value;
}
