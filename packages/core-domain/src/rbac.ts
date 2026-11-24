export const permissions = [
  'org:manage',
  'site:manage',
  'content:read',
  'content:write',
  'content:publish',
  'template:manage',
  'media:manage',
  'poll:manage',
  'settings:manage',
] as const;

export type Permission = (typeof permissions)[number];

export const rolePermissions: Record<string, readonly Permission[]> = {
  owner: permissions,
  admin: permissions,
  editor: ['content:read', 'content:write', 'media:manage', 'poll:manage'],
  publisher: ['content:read', 'content:write', 'content:publish', 'media:manage', 'poll:manage'],
  viewer: ['content:read'],
};

export function permissionsForRole(role: string): readonly Permission[] {
  return rolePermissions[role] ?? [];
}

export function roleAllows(role: string, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}
