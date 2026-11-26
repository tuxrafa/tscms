import { roleAllows, type Permission } from './rbac.js';

/** Versioned catalog. Grants store these codes; unknown codes are rejected. */
export const permissionCatalog = [
  'pages.read',
  'pages.create',
  'pages.edit',
  'pages.delete',
  'pages.copy',
  'pages.move',
  'pages.publish',
  'pages.unpublish',
  'pages.restore',
  'pages.view_history',
  'publishing.review',
  'publishing.approve',
  'publishing.publish',
  'publishing.unpublish',
  'publishing.manage_releases',
  'assets.read',
  'assets.upload',
  'assets.edit',
  'assets.move',
  'assets.delete',
  'assets.download',
  'assets.publish',
  'assets.unpublish',
  'assets.manage_versions',
  'assets.manage_metadata',
  'templates.read',
  'templates.create',
  'templates.edit',
  'templates.publish',
  'fragments.read',
  'fragments.create',
  'fragments.edit',
  'fragments.publish',
  'content_types.read',
  'content_types.manage',
  'users.read',
  'users.invite',
  'users.manage',
  'users.suspend',
  'users.initiate_password_reset',
  'groups.read',
  'groups.create',
  'groups.manage',
  'groups.assign',
  'audit.read',
  'audit.export',
  'sites.manage',
  'settings.manage',
  'integrations.manage',
  'service_accounts.manage',
  'platform.manage',
] as const;

export type IamPermission = (typeof permissionCatalog)[number];

export const permissionCatalogVersion = 1;

/** A folder administrator may hand these out. Nothing here implies platform administration. */
export const delegablePermissions = [
  'pages.read',
  'pages.create',
  'pages.edit',
  'pages.delete',
  'pages.copy',
  'pages.move',
  'pages.publish',
  'pages.unpublish',
  'pages.restore',
  'pages.view_history',
  'assets.read',
  'assets.upload',
  'assets.edit',
  'assets.download',
  'assets.manage_metadata',
  'audit.read',
] as const;

const legacyOf: Partial<Record<IamPermission, Permission>> = {
  'pages.read': 'content:read',
  'pages.create': 'content:write',
  'pages.edit': 'content:write',
  'pages.delete': 'content:write',
  'pages.copy': 'content:write',
  'pages.move': 'content:write',
  'pages.publish': 'content:publish',
  'pages.unpublish': 'content:publish',
  'pages.restore': 'content:write',
  'pages.view_history': 'content:read',
  'publishing.review': 'content:read',
  'publishing.approve': 'content:publish',
  'publishing.publish': 'content:publish',
  'publishing.unpublish': 'content:publish',
  'publishing.manage_releases': 'content:publish',
  'assets.read': 'content:read',
  'assets.upload': 'media:manage',
  'assets.edit': 'media:manage',
  'assets.move': 'media:manage',
  'assets.delete': 'media:manage',
  'assets.download': 'content:read',
  'assets.publish': 'content:publish',
  'assets.unpublish': 'content:publish',
  'assets.manage_versions': 'media:manage',
  'assets.manage_metadata': 'media:manage',
  'templates.read': 'content:read',
  'templates.create': 'template:manage',
  'templates.edit': 'template:manage',
  'templates.publish': 'template:manage',
  'fragments.read': 'content:read',
  'fragments.create': 'content:write',
  'fragments.edit': 'content:write',
  'fragments.publish': 'content:publish',
  'content_types.read': 'content:read',
  'content_types.manage': 'content:write',
  'users.read': 'org:manage',
  'users.invite': 'org:manage',
  'users.manage': 'org:manage',
  'users.suspend': 'org:manage',
  'users.initiate_password_reset': 'org:manage',
  'groups.read': 'org:manage',
  'groups.create': 'org:manage',
  'groups.manage': 'org:manage',
  'groups.assign': 'org:manage',
  'audit.read': 'org:manage',
  'audit.export': 'org:manage',
  'sites.manage': 'site:manage',
  'settings.manage': 'settings:manage',
  'integrations.manage': 'settings:manage',
  'service_accounts.manage': 'org:manage',
  'platform.manage': 'org:manage',
};

export function isIamPermission(value: string): value is IamPermission {
  return (permissionCatalog as readonly string[]).includes(value);
}

export function orgRoleAllows(role: string | null, permission: IamPermission): boolean {
  if (!role) return false;
  const legacy = legacyOf[permission];
  if (!legacy) return false;
  return roleAllows(role, legacy);
}

export type ScopeType = 'platform' | 'organization' | 'site' | 'page_folder' | 'asset_folder' | 'resource';

export interface GrantRef {
  id: string;
  scopeType: ScopeType;
  scopeId: string | null;
  includeDescendants: boolean;
  permissions: readonly string[];
  label?: string;
}

export interface ResourceRef {
  kind: 'page' | 'asset' | 'site';
  folderId: string | null;
}

export function grantCovers(grant: GrantRef, resource: ResourceRef, parents: ReadonlyMap<string, string | null>): boolean {
  if (grant.scopeType === 'platform' || grant.scopeType === 'organization' || grant.scopeType === 'site') return true;
  const expected = resource.kind === 'asset' ? 'asset_folder' : resource.kind === 'page' ? 'page_folder' : null;
  if (!expected || grant.scopeType !== expected || !grant.scopeId) return false;
  if (resource.folderId === grant.scopeId) return true;
  if (!grant.includeDescendants || !resource.folderId) return false;
  let current = parents.get(resource.folderId) ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === grant.scopeId) return true;
    seen.add(current);
    current = parents.get(current) ?? null;
  }
  return false;
}

/** True when `target` is the actor scope or a descendant of it. */
export function scopeContains(
  actor: { scopeType: ScopeType; scopeId: string | null; includeDescendants: boolean },
  target: { scopeType: ScopeType; scopeId: string | null },
  parents: ReadonlyMap<string, string | null>,
): boolean {
  if (actor.scopeType === 'platform' || actor.scopeType === 'organization') return true;
  if (actor.scopeType === 'site') return target.scopeType === 'site' || target.scopeType === 'page_folder' || target.scopeType === 'asset_folder';
  return grantCovers(
    { id: 'actor', scopeType: actor.scopeType, scopeId: actor.scopeId, includeDescendants: actor.includeDescendants, permissions: [] },
    { kind: target.scopeType === 'asset_folder' ? 'asset' : 'page', folderId: target.scopeId },
    parents,
  );
}

export function permissionGrantError(
  actor: { orgAdmin: boolean; held: readonly string[] },
  requested: readonly string[],
): string | null {
  for (const permission of requested) {
    if (!isIamPermission(permission)) return 'Permissão desconhecida.';
    if (permission === 'platform.manage') return 'Administrador global só pode ser concedido por outro administrador global.';
    if (actor.orgAdmin) continue;
    if (!(delegablePermissions as readonly string[]).includes(permission)) return `${permission} não pode ser delegada.`;
    if (!actor.held.includes(permission)) return `Você não possui ${permission} para delegar.`;
  }
  return null;
}

export function decideAccess(input: {
  platformAdmin: boolean;
  orgRole: string | null;
  siteAllowed: boolean;
  grants: readonly GrantRef[];
  permission: IamPermission;
  resource: ResourceRef;
  parents: ReadonlyMap<string, string | null>;
}): { allowed: boolean; reason: string; matchedGrantIds: string[] } {
  if (input.platformAdmin) {
    return { allowed: true, reason: 'Administrador global da plataforma.', matchedGrantIds: [] };
  }
  if (input.siteAllowed && input.orgRole && orgRoleAllows(input.orgRole, input.permission)) {
    return { allowed: true, reason: `Papel ${input.orgRole} na organização.`, matchedGrantIds: [] };
  }
  const matched = input.grants.filter(
    (grant) => grant.permissions.includes(input.permission) && grantCovers(grant, input.resource, input.parents),
  );
  if (matched.length > 0) {
    const label = matched[0]?.label ? ` Concedido por ${matched[0].label}.` : '';
    return { allowed: true, reason: `Grant explícito no escopo.${label}`, matchedGrantIds: matched.map((grant) => grant.id) };
  }
  return { allowed: false, reason: 'Nenhum grant concede essa permissão neste escopo.', matchedGrantIds: [] };
}
