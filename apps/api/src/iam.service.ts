import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  auditEvents,
  iamAccessGrants,
  iamCredentials,
  iamGroupMembers,
  memberships,
  organizations,
  roles,
  sites,
  users,
  workspaces,
  type Database,
} from '@tscms/database';
import {
  assertPasswordQuality,
  hashPassword,
  isIamPermission,
  permissionGrantError,
  permissions,
  randomToken,
  scopeContains,
  sha256,
  slugify,
  verifyPassword,
  type IamPermission,
  type ScopeType,
} from '@tscms/core-domain';
import { AuthorizationService } from './authorization.service.js';
import { AccessService } from './access.service.js';
import { ApiException, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';
import { openSession, revokeUserSessions } from './sessions.js';
import { z } from 'zod';

const systemRoleKeys = new Set(['owner', 'admin', 'editor', 'publisher', 'viewer']);

const systemRoles = [
  ['owner', 'Proprietária'],
  ['admin', 'Administração'],
  ['editor', 'Edição'],
  ['publisher', 'Publicação'],
  ['viewer', 'Leitura'],
] as const;

const grantSchema = z.object({
  siteId: z.string().uuid(),
  scopeType: z.enum(['site', 'page_folder', 'asset_folder']),
  scopeId: z.string().uuid().nullable().optional(),
  includeDescendants: z.boolean().optional(),
  permissions: z.array(z.string()).min(1),
  delegable: z.boolean().optional(),
  label: z.string().max(160).optional(),
});

const inviteSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(160),
  groupIds: z.array(z.string().uuid()).optional(),
  grant: grantSchema.optional(),
  grants: z.array(grantSchema).min(1).max(40).optional(),
});

const groupSchema = z.object({
  name: z.string().min(2).max(160),
  permissions: z.array(z.string()).min(1),
  siteId: z.string().uuid().optional(),
  scopeType: z.enum(['site', 'page_folder', 'asset_folder']).optional(),
  scopeId: z.string().uuid().nullable().optional(),
  includeDescendants: z.boolean().optional(),
  delegable: z.boolean().optional(),
});

const serviceSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2).max(160),
  description: z.string().max(500).optional(),
  grant: grantSchema,
});

export async function bootstrapAdmin(
  db: Database,
  input: { email: string; password: string; login?: string; name?: string },
) {
  assertPasswordQuality(input.password, 12);
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('tscms-bootstrap-admin'))`);
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.platformAdmin, true)).limit(1);
    if (existing) return { created: false as const, userId: existing.id };
    const login = (input.login ?? 'admin').toLowerCase();
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email.toLowerCase(),
        login,
        name: input.name ?? 'Administrador',
        passwordHash,
        status: 'active',
        kind: 'human',
        authMethod: 'local',
        platformAdmin: true,
        passwordChangedAt: new Date(),
      })
      .returning();
    if (!user) throw new Error('Falha ao criar o administrador.');
    await tx.insert(auditEvents).values({
      actorId: user.id,
      actorType: 'human',
      action: 'platform.bootstrapped',
      result: 'success',
      entityType: 'user',
      entityId: user.id,
      metadata: { login },
    });
    return { created: true as const, userId: user.id };
  });
}

@Injectable()
export class IamService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
    private readonly authorization: AuthorizationService,
  ) {}

  bootstrap(input: { email: string; password: string; login?: string; name?: string }) {
    return bootstrapAdmin(this.database.db, input);
  }

  async createOrganization(actor: AuthUser, name: string) {
    const account = await this.mustActive(actor.id);
    if (!account.platformAdmin) throw new ApiException(403, 'forbidden', 'Apenas o administrador global cria organizações.');
    const slug = slugify(name);
    const [organization] = await this.database.db.insert(organizations).values({ name, slug }).returning();
    if (!organization) throw new ApiException(500, 'internal', 'Falha ao criar organização.');
    await this.database.db.insert(roles).values(
      systemRoles.map(([key, label]) => ({
        organizationId: organization.id,
        key,
        name: label,
        permissions: [...permissions],
        system: true,
      })),
    );
    await this.database.db.insert(workspaces).values({ organizationId: organization.id, name: 'Principal', slug: 'principal' });
    await this.database.db.insert(memberships).values({ organizationId: organization.id, userId: actor.id, role: 'owner' });
    await this.access.audit(this.database.db, {
      organizationId: organization.id,
      actorId: actor.id,
      action: 'organization.created',
      entityType: 'organization',
      entityId: organization.id,
    });
    return organization;
  }

  async invite(actor: AuthUser, input: unknown) {
    const body = parseInput(inviteSchema, input);
    const grants = [...(body.grants ?? []), ...(body.grant ? [body.grant] : [])];
    if (!body.groupIds?.length && grants.length === 0) throw new ApiException(400, 'validation_error', 'Informe um grupo ou um escopo.');
    const ctx = await this.actorContext(actor.id, body.organizationId);
    for (const grant of grants) await this.assertGrantAllowed(ctx, grant);
    if (body.groupIds) {
      for (const roleId of body.groupIds) await this.assertCanAssign(ctx, roleId);
    }
    const email = body.email.toLowerCase();
    const [found] = await this.database.db.select().from(users).where(eq(users.email, email)).limit(1);
    let account = found;
    let inviteToken: string | null = null;
    if (!account) {
      const passwordHash = await hashPassword(randomToken(24));
      const [created] = await this.database.db
        .insert(users)
        .values({
          email,
          login: email,
          name: body.name,
          passwordHash,
          status: 'invited',
          kind: 'human',
          authMethod: 'local',
        })
        .returning();
      if (!created) throw new ApiException(500, 'internal', 'Falha ao criar usuária.');
      account = created;
      inviteToken = await this.issueCredential(created.id, 'invite', 48 * 60 * 60 * 1000);
    } else if (account.kind === 'service') {
      throw new ApiException(409, 'conflict', 'Essa identidade é uma automação.');
    }
    await this.database.db
      .insert(memberships)
      .values({ organizationId: body.organizationId, userId: account.id, role: 'member' })
      .onConflictDoNothing();
    if (body.groupIds) {
      for (const roleId of body.groupIds) await this.addGroupMember(ctx, roleId, account.id);
    }
    for (const grant of grants) await this.insertGrant(ctx, body.organizationId, account.id, null, grant);
    await this.access.audit(this.database.db, {
      organizationId: body.organizationId,
      actorId: actor.id,
      action: account === found ? 'user.associated' : 'user.invited',
      entityType: 'user',
      entityId: account.id,
      metadata: { email },
    });
    return { user: this.publicUser(account), inviteToken };
  }

  async acceptInvite(input: unknown) {
    const body = parseInput(z.object({ token: z.string().min(20), password: z.string() }), input);
    return this.consumeCredential(body.token, 'invite', body.password);
  }

  async changePassword(actor: AuthUser, input: unknown) {
    const body = parseInput(z.object({ currentPassword: z.string().min(1), password: z.string() }), input);
    const account = await this.mustActive(actor.id);
    if (account.kind === 'service') throw new ApiException(403, 'forbidden', 'Automação não troca senha por aqui.');
    if (!(await verifyPassword(body.currentPassword, account.passwordHash))) {
      throw new ApiException(401, 'unauthorized', 'A senha atual não confere.');
    }
    assertPasswordQuality(body.password, 12);
    const passwordHash = await hashPassword(body.password);
    await this.database.db
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, account.id));
    await revokeUserSessions(this.database.db, account.id);
    await this.access.audit(this.database.db, {
      organizationId: null,
      actorId: account.id,
      action: 'user.password.changed',
      entityType: 'user',
      entityId: account.id,
    });
    return openSession(this.database.db, account.id, account.email);
  }

  async requestReset(actor: AuthUser, userId: string) {
    const target = await this.mustUser(userId);
    if (target.kind === 'service') throw new ApiException(400, 'validation_error', 'Automação não tem senha.');
    if (target.platformAdmin) {
      const actorAccount = await this.mustActive(actor.id);
      if (!actorAccount.platformAdmin) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    } else {
      await this.requireSharedOrgAdmin(actor.id, userId);
    }
    const resetToken = await this.issueCredential(target.id, 'reset', 60 * 60 * 1000);
    await this.access.audit(this.database.db, {
      actorId: actor.id,
      action: 'user.password.reset_requested',
      entityType: 'user',
      entityId: target.id,
    });
    return { resetToken, expiresInSeconds: 3600 };
  }

  async acceptReset(input: unknown) {
    const body = parseInput(z.object({ token: z.string().min(20), password: z.string() }), input);
    return this.consumeCredential(body.token, 'reset', body.password);
  }

  async setStatus(actor: AuthUser, userId: string, status: 'active' | 'disabled' | 'suspended') {
    const target = await this.mustUser(userId);
    const actorAccount = await this.mustActive(actor.id);
    if (target.platformAdmin && !actorAccount.platformAdmin) {
      throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    }
    if (!target.platformAdmin) await this.requireSharedOrgAdmin(actor.id, userId);
    if (target.platformAdmin && status !== 'active') {
      const admins = await this.database.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.platformAdmin, true), eq(users.status, 'active')));
      if (admins.length <= 1) throw new ApiException(409, 'conflict', 'O último administrador global não pode ser desativado.');
    }
    await this.database.db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, userId));
    if (status !== 'active') {
      await revokeUserSessions(this.database.db, userId);
      await this.database.db
        .update(iamCredentials)
        .set({ revokedAt: new Date() })
        .where(and(eq(iamCredentials.userId, userId), eq(iamCredentials.kind, 'service')));
    }
    await this.access.audit(this.database.db, {
      actorId: actor.id,
      action: status === 'active' ? 'user.enabled' : 'user.disabled',
      entityType: 'user',
      entityId: userId,
      metadata: { status },
    });
    return { id: userId, status };
  }

  async promote(actor: AuthUser, userId: string, currentPassword: string) {
    const admin = await this.mustActive(actor.id);
    if (!admin.platformAdmin) throw new ApiException(403, 'forbidden', 'Apenas um administrador global pode criar outro.');
    if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
      throw new ApiException(401, 'unauthorized', 'Confirme sua senha para continuar.');
    }
    const target = await this.mustUser(userId);
    if (target.kind !== 'human' || target.status !== 'active') {
      throw new ApiException(409, 'conflict', 'A conta precisa ser humana e estar ativa.');
    }
    await this.database.db.update(users).set({ platformAdmin: true, updatedAt: new Date() }).where(eq(users.id, userId));
    await this.access.audit(this.database.db, {
      actorId: actor.id,
      action: 'user.platform_admin_granted',
      entityType: 'user',
      entityId: userId,
    });
    return { id: userId, platformAdmin: true };
  }

  async listUsers(actor: AuthUser, organizationId: string) {
    const ctx = await this.actorContext(actor.id, organizationId);
    const rows = await this.database.db
      .select({ user: users, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, organizationId))
      .orderBy(users.name);
    const managed = ctx.orgAdmin ? null : await this.managedUserIds(ctx);
    const visible = managed ? rows.filter((row) => managed.has(row.user.id)) : rows;
    const ids = visible.map((row) => row.user.id);
    const memberRows = ids.length
      ? await this.database.db
          .select({ userId: iamGroupMembers.userId, roleId: iamGroupMembers.roleId, name: roles.name })
          .from(iamGroupMembers)
          .innerJoin(roles, eq(roles.id, iamGroupMembers.roleId))
          .where(and(inArray(iamGroupMembers.userId, ids), eq(roles.organizationId, organizationId)))
      : [];
    return {
      data: visible.map((row) => ({
        ...this.publicUser(row.user),
        role: row.role,
        groups: memberRows.filter((member) => member.userId === row.user.id).map((member) => ({ id: member.roleId, name: member.name })),
      })),
    };
  }

  async createGroup(actor: AuthUser, organizationId: string, input: unknown) {
    const body = parseInput(groupSchema, input);
    const ctx = await this.actorContext(actor.id, organizationId);
    if (!ctx.orgAdmin) throw new ApiException(403, 'forbidden', 'Apenas a administração da organização cria grupos.');
    const error = permissionGrantError({ orgAdmin: true, held: [] }, body.permissions);
    if (error) throw new ApiException(403, 'forbidden', error);
    const key = slugify(body.name);
    if (systemRoleKeys.has(key)) throw new ApiException(409, 'conflict', 'Esse nome é reservado a um papel do sistema.');
    if (body.siteId) await this.assertGrantAllowed(ctx, { ...body, siteId: body.siteId, permissions: body.permissions, scopeType: body.scopeType ?? 'site' });
    const [role] = await this.database.db
      .insert(roles)
      .values({ organizationId, key, name: body.name, permissions: body.permissions, system: false })
      .returning();
    if (!role) throw new ApiException(500, 'internal', 'Falha ao criar o grupo.');
    if (body.siteId) {
      await this.insertGrant(ctx, organizationId, null, role.id, {
        siteId: body.siteId,
        scopeType: body.scopeType ?? 'site',
        scopeId: body.scopeId,
        includeDescendants: body.includeDescendants,
        permissions: body.permissions,
        delegable: body.delegable,
        label: body.name,
      });
    }
    await this.access.audit(this.database.db, {
      organizationId,
      actorId: actor.id,
      action: 'group.created',
      entityType: 'group',
      entityId: role.id,
      metadata: { name: body.name },
    });
    return role;
  }

  async listGroups(actor: AuthUser, organizationId: string) {
    await this.actorContext(actor.id, organizationId);
    const data = await this.database.db.select().from(roles).where(eq(roles.organizationId, organizationId)).orderBy(roles.name);
    return { data: data.filter((role) => !role.system) };
  }

  async addMemberToGroup(actor: AuthUser, organizationId: string, roleId: string, userId: string) {
    const ctx = await this.actorContext(actor.id, organizationId);
    await this.assertCanAssign(ctx, roleId);
    await this.addGroupMember(ctx, roleId, userId);
    return { roleId, userId };
  }

  async removeMemberFromGroup(actor: AuthUser, organizationId: string, roleId: string, userId: string) {
    const ctx = await this.actorContext(actor.id, organizationId);
    await this.assertCanAssign(ctx, roleId);
    await this.database.db.delete(iamGroupMembers).where(and(eq(iamGroupMembers.roleId, roleId), eq(iamGroupMembers.userId, userId)));
    await this.access.audit(this.database.db, {
      organizationId,
      actorId: ctx.account.id,
      action: 'group.member.removed',
      entityType: 'group',
      entityId: roleId,
      metadata: { userId },
    });
    return { roleId, userId };
  }

  async createServiceAccount(actor: AuthUser, input: unknown) {
    const body = parseInput(serviceSchema, input);
    const ctx = await this.actorContext(actor.id, body.organizationId);
    if (!ctx.orgAdmin) throw new ApiException(403, 'forbidden', 'Apenas a administração cria automações.');
    await this.assertGrantAllowed(ctx, body.grant);
    const email = `sa-${crypto.randomUUID()}@service.tscms.local`;
    const passwordHash = await hashPassword(randomToken(24));
    const [account] = await this.database.db
      .insert(users)
      .values({
        email,
        name: body.name,
        description: body.description ?? '',
        passwordHash,
        kind: 'service',
        status: 'active',
        authMethod: 'service',
        ownerId: actor.id,
      })
      .returning();
    if (!account) throw new ApiException(500, 'internal', 'Falha ao criar a automação.');
    await this.database.db.insert(memberships).values({ organizationId: body.organizationId, userId: account.id, role: 'member' });
    await this.insertGrant(ctx, body.organizationId, account.id, null, { ...body.grant, label: body.grant.label ?? body.name });
    const token = await this.issueCredential(account.id, 'service', 90 * 24 * 60 * 60 * 1000);
    await this.access.audit(this.database.db, {
      organizationId: body.organizationId,
      siteId: body.grant.siteId,
      actorId: actor.id,
      action: 'service_account.created',
      entityType: 'user',
      entityId: account.id,
      metadata: { name: body.name },
    });
    return { user: this.publicUser(account), token };
  }

  async revokeServiceCredential(actor: AuthUser, userId: string) {
    const target = await this.mustUser(userId);
    if (target.kind !== 'service') throw new ApiException(400, 'validation_error', 'A conta não é uma automação.');
    await this.requireSharedOrgAdmin(actor.id, userId);
    await this.database.db
      .update(iamCredentials)
      .set({ revokedAt: new Date() })
      .where(and(eq(iamCredentials.userId, userId), eq(iamCredentials.kind, 'service')));
    await this.access.audit(this.database.db, {
      actorId: actor.id,
      action: 'service_account.revoked',
      entityType: 'user',
      entityId: userId,
    });
    return { id: userId, revoked: true };
  }

  async explain(actor: AuthUser, query: { siteId: string; userId?: string; permission: string; folderId?: string; kind?: 'page' | 'asset' }) {
    if (!isIamPermission(query.permission)) throw new ApiException(400, 'validation_error', 'Permissão desconhecida.');
    const subjectId = query.userId ?? actor.id;
    if (subjectId !== actor.id) {
      const [site] = await this.database.db.select().from(sites).where(eq(sites.id, query.siteId)).limit(1);
      if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
      const ctx = await this.actorContext(actor.id, site.organizationId);
      if (!ctx.orgAdmin && !ctx.grants.some((grant) => grant.delegable)) {
        throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
      }
    }
    return this.authorization.explain(actorFor(subjectId), query.siteId, query.permission, {
      kind: query.kind ?? 'page',
      folderId: query.folderId ?? null,
    });
  }

  async listAudit(
    actor: AuthUser,
    query: {
      organizationId?: string;
      siteId?: string;
      actorId?: string;
      action?: string;
      result?: string;
      kind?: string;
      from?: string;
      to?: string;
      format?: string;
    },
  ) {
    const account = await this.mustActive(actor.id);
    const permission = query.format === 'csv' ? 'audit.export' : 'audit.read';
    const filters = [];
    if (query.siteId) filters.push(eq(auditEvents.siteId, query.siteId));
    if (query.actorId) filters.push(eq(auditEvents.actorId, query.actorId));
    if (query.action) filters.push(eq(auditEvents.action, query.action));
    if (query.result) filters.push(eq(auditEvents.result, query.result));
    if (query.from) filters.push(gte(auditEvents.createdAt, new Date(query.from)));
    if (query.to) filters.push(lte(auditEvents.createdAt, new Date(query.to)));
    let paths: string[] | 'all' = 'all';
    if (account.platformAdmin && !query.organizationId) {
      if (permission === 'audit.export' && !account.platformAdmin) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    } else {
      const organizationId = query.organizationId;
      if (!organizationId) throw new ApiException(400, 'validation_error', 'Informe a organização.');
      const allowed = await this.auditScope(actor.id, organizationId, permission);
      if (!allowed) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
      filters.push(eq(auditEvents.organizationId, organizationId));
      paths = allowed;
    }
    const rows = await this.database.db
      .select({
        id: auditEvents.id,
        createdAt: auditEvents.createdAt,
        organizationId: auditEvents.organizationId,
        siteId: auditEvents.siteId,
        actorId: auditEvents.actorId,
        actorType: auditEvents.actorType,
        actorName: users.name,
        actorKind: users.kind,
        action: auditEvents.action,
        result: auditEvents.result,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        resourcePath: auditEvents.resourcePath,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorId))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(auditEvents.createdAt))
      .limit(200);
    const data = rows.filter((row) => {
      if (query.kind && row.actorKind !== query.kind && row.actorType !== query.kind) return false;
      if (paths === 'all') return true;
      if (!row.resourcePath) return false;
      return paths.some((path) => row.resourcePath === path || row.resourcePath?.startsWith(`${path}/`));
    });
    if (query.format === 'csv') {
      const header = 'createdAt,actor,actorType,action,result,entityType,entityId,resourcePath';
      const lines = data.map((row) =>
        [row.createdAt.toISOString(), row.actorName ?? '', row.actorKind ?? row.actorType, row.action, row.result, row.entityType, row.entityId, row.resourcePath ?? '']
          .map((value) => `"${String(value).replaceAll('"', '""')}"`)
          .join(','),
      );
      return { format: 'csv' as const, body: [header, ...lines].join('\n') };
    }
    return { data };
  }

  private async consumeCredential(token: string, kind: 'invite' | 'reset', password: string) {
    assertPasswordQuality(password, 12);
    const [credential] = await this.database.db.select().from(iamCredentials).where(eq(iamCredentials.tokenHash, sha256(token))).limit(1);
    if (!credential || credential.kind !== kind || credential.usedAt || credential.revokedAt || credential.expiresAt < new Date()) {
      throw new ApiException(400, 'validation_error', 'O convite ou o reset não é mais válido.');
    }
    const account = await this.mustUser(credential.userId);
    const passwordHash = await hashPassword(password);
    await this.database.db
      .update(users)
      .set({ passwordHash, status: 'active', passwordChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, account.id));
    await this.database.db.update(iamCredentials).set({ usedAt: new Date() }).where(eq(iamCredentials.id, credential.id));
    await revokeUserSessions(this.database.db, account.id);
    await this.access.audit(this.database.db, {
      actorId: account.id,
      action: kind === 'invite' ? 'user.activated' : 'user.password.reset',
      entityType: 'user',
      entityId: account.id,
    });
    return openSession(this.database.db, account.id, account.email);
  }

  private async issueCredential(userId: string, kind: 'invite' | 'reset' | 'service', ttlMs: number) {
    const token = kind === 'service' ? `tscms_${randomToken(32)}` : randomToken(32);
    await this.database.db.insert(iamCredentials).values({
      userId,
      kind,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  private async insertGrant(
    ctx: ActorContext,
    organizationId: string,
    userId: string | null,
    roleId: string | null,
    grant: z.infer<typeof grantSchema>,
  ) {
    if ((grant.scopeType === 'page_folder' || grant.scopeType === 'asset_folder') && !grant.scopeId) {
      throw new ApiException(400, 'validation_error', 'Informe a pasta do escopo.');
    }
    const [created] = await this.database.db
      .insert(iamAccessGrants)
      .values({
        organizationId,
        userId,
        roleId,
        siteId: grant.siteId,
        scopeType: grant.scopeType,
        scopeId: grant.scopeId ?? null,
        includeDescendants: grant.includeDescendants ?? true,
        permissions: grant.permissions,
        delegable: Boolean(grant.delegable) && ctx.orgAdmin,
        label: grant.label ?? '',
        createdBy: ctx.account.id,
      })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId,
      siteId: grant.siteId,
      actorId: ctx.account.id,
      action: 'permission.granted',
      entityType: 'grant',
      entityId: created?.id ?? '',
      metadata: { permissions: grant.permissions, scopeType: grant.scopeType, scopeId: grant.scopeId ?? null },
    });
  }

  private async addGroupMember(ctx: ActorContext, roleId: string, userId: string) {
    await this.database.db.insert(iamGroupMembers).values({ roleId, userId }).onConflictDoNothing();
    await this.access.audit(this.database.db, {
      organizationId: ctx.organizationId,
      actorId: ctx.account.id,
      action: 'group.member.added',
      entityType: 'group',
      entityId: roleId,
      metadata: { userId },
    });
  }

  private async assertGrantAllowed(ctx: ActorContext, grant: z.infer<typeof grantSchema>) {
    const error = permissionGrantError({ orgAdmin: ctx.orgAdmin, held: ctx.held }, grant.permissions);
    if (error) throw new ApiException(403, 'forbidden', error);
    if (ctx.orgAdmin) return;
    if ((grant.scopeType === 'page_folder' || grant.scopeType === 'asset_folder') && !grant.scopeId) {
      throw new ApiException(400, 'validation_error', 'Informe a pasta do escopo.');
    }
    const kind = grant.scopeType === 'asset_folder' ? 'asset' : 'page';
    const { parents } = await this.authorization.hierarchy(grant.siteId, kind);
    const covered = ctx.grants.some(
      (candidate) =>
        candidate.delegable &&
        candidate.permissions.includes('users.invite') &&
        candidate.siteId === grant.siteId &&
        scopeContains(candidate, { scopeType: grant.scopeType, scopeId: grant.scopeId ?? null }, parents),
    );
    if (!covered) throw new ApiException(403, 'forbidden', 'O escopo fica fora da pasta que você administra.');
  }

  private async assertCanAssign(ctx: ActorContext, roleId: string) {
    const [role] = await this.database.db.select().from(roles).where(and(eq(roles.id, roleId), eq(roles.organizationId, ctx.organizationId))).limit(1);
    if (!role || role.system) throw new ApiException(403, 'forbidden', 'Esse grupo não pode ser delegado.');
    if (ctx.orgAdmin) return;
    const grants = await this.database.db.select().from(iamAccessGrants).where(eq(iamAccessGrants.roleId, roleId));
    if (grants.length === 0) throw new ApiException(403, 'forbidden', 'Esse grupo não pode ser delegado.');
    for (const grant of grants) {
      await this.assertGrantAllowed(ctx, {
        siteId: grant.siteId ?? '',
        scopeType: grant.scopeType as 'site' | 'page_folder' | 'asset_folder',
        scopeId: grant.scopeId,
        includeDescendants: grant.includeDescendants,
        permissions: grant.permissions,
      });
    }
  }

  private async actorContext(userId: string, organizationId: string): Promise<ActorContext> {
    const account = await this.mustActive(userId);
    const [membership] = await this.database.db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
      .limit(1);
    const orgAdmin = account.platformAdmin || membership?.role === 'owner' || membership?.role === 'admin';
    if (!account.platformAdmin && !membership) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
    const groups = await this.database.db.select({ roleId: iamGroupMembers.roleId }).from(iamGroupMembers).where(eq(iamGroupMembers.userId, userId));
    const roleIds = groups.map((group) => group.roleId);
    const rows = await this.database.db.select().from(iamAccessGrants).where(eq(iamAccessGrants.organizationId, organizationId));
    const grants = rows
      .filter((row) => row.userId === userId || (row.roleId && roleIds.includes(row.roleId)))
      .filter((row) => row.scopeType === 'site' || row.scopeType === 'page_folder' || row.scopeType === 'asset_folder')
      .map((row) => ({
        siteId: row.siteId,
        scopeType: row.scopeType as ScopeType,
        scopeId: row.scopeId,
        includeDescendants: row.includeDescendants,
        permissions: row.permissions,
        delegable: row.delegable,
      }));
    const held = [...new Set(grants.flatMap((grant) => grant.permissions))].filter(isIamPermission);
    return { account, organizationId, orgAdmin, grants, held };
  }

  private async managedUserIds(ctx: ActorContext): Promise<Set<string>> {
    const ids = new Set<string>([ctx.account.id]);
    const grants = await this.database.db.select().from(iamAccessGrants).where(eq(iamAccessGrants.organizationId, ctx.organizationId));
    const roleIds = new Set<string>();
    const hierarchies = new Map<string, Map<string, string | null>>();
    for (const grant of grants) {
      if (!grant.siteId || (grant.scopeType !== 'site' && grant.scopeType !== 'page_folder' && grant.scopeType !== 'asset_folder')) continue;
      const key = `${grant.siteId}:${grant.scopeType === 'asset_folder' ? 'asset' : 'page'}`;
      let parents = hierarchies.get(key);
      if (!parents) {
        parents = (await this.authorization.hierarchy(grant.siteId, grant.scopeType === 'asset_folder' ? 'asset' : 'page')).parents;
        hierarchies.set(key, parents);
      }
      const inside = ctx.grants.some(
        (candidate) =>
          candidate.delegable &&
          candidate.siteId === grant.siteId &&
          scopeContains(candidate, { scopeType: grant.scopeType as ScopeType, scopeId: grant.scopeId }, parents!),
      );
      if (!inside) continue;
      if (grant.userId) ids.add(grant.userId);
      if (grant.roleId) roleIds.add(grant.roleId);
    }
    if (roleIds.size > 0) {
      const members = await this.database.db.select().from(iamGroupMembers).where(inArray(iamGroupMembers.roleId, [...roleIds]));
      for (const member of members) ids.add(member.userId);
    }
    return ids;
  }

  private async auditScope(userId: string, organizationId: string, permission: 'audit.read' | 'audit.export'): Promise<string[] | 'all' | null> {
    const ctx = await this.actorContext(userId, organizationId);
    if (ctx.orgAdmin || ctx.account.platformAdmin) return 'all';
    const matching = ctx.grants.filter((grant) => grant.permissions.includes(permission) && grant.siteId);
    if (matching.length === 0) return null;
    const paths: string[] = [];
    for (const grant of matching) {
      if (grant.scopeType === 'site') return 'all';
      if (!grant.scopeId) continue;
      const { paths: folderPaths } = await this.authorization.hierarchy(grant.siteId!, grant.scopeType === 'asset_folder' ? 'asset' : 'page');
      const path = folderPaths.get(grant.scopeId);
      if (path) paths.push(path);
    }
    return paths.length ? paths : null;
  }

  private async requireSharedOrgAdmin(actorId: string, userId: string) {
    const actorMemberships = await this.database.db.select().from(memberships).where(eq(memberships.userId, actorId));
    const targetMemberships = await this.database.db.select().from(memberships).where(eq(memberships.userId, userId));
    const shared = actorMemberships.find(
      (membership) =>
        (membership.role === 'owner' || membership.role === 'admin') &&
        targetMemberships.some((target) => target.organizationId === membership.organizationId),
    );
    const account = await this.mustActive(actorId);
    if (!shared && !account.platformAdmin) throw new ApiException(403, 'forbidden', 'Permissão insuficiente.');
  }

  private async mustActive(userId: string) {
    const account = await this.mustUser(userId);
    if (account.status !== 'active') throw new ApiException(403, 'forbidden', 'Conta indisponível.');
    return account;
  }

  private async mustUser(userId: string) {
    const [account] = await this.database.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!account) throw new ApiException(404, 'not_found', 'Usuária não encontrada.');
    return account;
  }

  private publicUser(user: typeof users.$inferSelect) {
    return {
      id: user.id,
      email: user.email,
      login: user.login,
      name: user.name,
      locale: user.locale,
      status: user.status,
      kind: user.kind,
      description: user.description,
      platformAdmin: user.platformAdmin,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}

interface ActorContext {
  account: typeof users.$inferSelect;
  organizationId: string;
  orgAdmin: boolean;
  grants: Array<{
    siteId: string | null;
    scopeType: ScopeType;
    scopeId: string | null;
    includeDescendants: boolean;
    permissions: string[];
    delegable: boolean;
  }>;
  held: IamPermission[];
}

function actorFor(userId: string): AuthUser {
  return { id: userId, email: '', kind: 'human' };
}
