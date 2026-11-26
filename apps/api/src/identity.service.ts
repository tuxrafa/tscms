import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { memberships, organizations, roles, users, workspaces } from '@tscms/database';
import { permissions, hashPassword, slugify, verifyPassword } from '@tscms/core-domain';
import { loginSchema, registerSchema } from '@tscms/api-contracts';
import { AccessService } from './access.service.js';
import { ApiException, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';
import { openSession } from './sessions.js';

const systemRoles = [
  ['owner', 'Proprietária'],
  ['admin', 'Administração'],
  ['editor', 'Edição'],
  ['publisher', 'Publicação'],
  ['viewer', 'Leitura'],
] as const;

@Injectable()
export class IdentityService {
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async register(input: unknown) {
    const body = parseInput(registerSchema, input);
    const passwordHash = await hashPassword(body.password);
    try {
      return await this.database.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email: body.email.toLowerCase(),
            login: body.email.toLowerCase(),
            name: body.name,
            passwordHash,
            status: 'active',
            kind: 'human',
            authMethod: 'local',
            passwordChangedAt: new Date(),
          })
          .returning();
        if (!user) throw new ApiException(500, 'internal', 'Falha ao criar usuária.');
        const [organization] = await tx
          .insert(organizations)
          .values({ name: body.organizationName, slug: slugify(body.organizationName) })
          .returning();
        if (!organization) throw new ApiException(500, 'internal', 'Falha ao criar organização.');
        await tx.insert(roles).values(
          systemRoles.map(([key, name]) => ({
            organizationId: organization.id,
            key,
            name,
            permissions: [...permissions],
            system: true,
          })),
        );
        await tx.insert(memberships).values({ organizationId: organization.id, userId: user.id, role: 'owner' });
        await tx.insert(workspaces).values({
          organizationId: organization.id,
          name: 'Principal',
          slug: 'principal',
        });
        await this.access.audit(tx, {
          organizationId: organization.id,
          actorId: user.id,
          action: 'organization.created',
          entityType: 'organization',
          entityId: organization.id,
        });
        const session = await openSession(tx, user.id, user.email);
        return { token: session.token, csrf: session.csrf, user: this.publicUser(user), organization };
      });
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(409, 'conflict', 'E-mail ou organização já existem.');
    }
  }

  async login(input: unknown) {
    const body = parseInput(loginSchema, input);
    const identifier = (body.login ?? body.email ?? '').toLowerCase();
    this.throttle(identifier);
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(body.login && !body.email ? eq(users.login, identifier) : eq(users.email, identifier))
      .limit(1);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      this.fail(identifier);
      if (user) {
        await this.access.audit(this.database.db, {
          organizationId: null,
          actorId: user.id,
          action: 'auth.login.failed',
          result: 'failure',
          entityType: 'user',
          entityId: user.id,
        });
      }
      throw new ApiException(401, 'unauthorized', 'Credenciais inválidas.');
    }
    if (user.kind === 'service') throw new ApiException(403, 'forbidden', 'Essa identidade não entra com senha.');
    if (user.status !== 'active') throw new ApiException(403, 'forbidden', 'Conta indisponível.');
    this.failures.delete(identifier);
    await this.database.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const session = await openSession(this.database.db, user.id, user.email);
    await this.access.audit(this.database.db, {
      actorId: user.id,
      actorType: 'human',
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
    });
    return { token: session.token, csrf: session.csrf, user: this.publicUser(user) };
  }

  async me(user: AuthUser) {
    const [record] = await this.database.db.select().from(users).where(eq(users.id, user.id)).limit(1);
    if (!record) throw new ApiException(401, 'unauthorized', 'Usuária não encontrada.');
    const memberOf = await this.database.db
      .select({ organizationId: memberships.organizationId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, user.id));
    return { user: this.publicUser(record), memberships: memberOf };
  }

  async addMember(actor: AuthUser, organizationId: string, email: string, role: string) {
    await this.access.requireOrg(actor.id, organizationId, 'org:manage');
    if (!systemRoles.some(([key]) => key === role)) throw new ApiException(400, 'validation_error', 'Papel desconhecido.');
    if (role === 'owner') {
      const [account] = await this.database.db.select({ platformAdmin: users.platformAdmin }).from(users).where(eq(users.id, actor.id)).limit(1);
      const actorMembership = await findMembership(this.database, actor.id, organizationId);
      if (!account?.platformAdmin && actorMembership?.role !== 'owner') {
        throw new ApiException(403, 'forbidden', 'Só um administrador global ou a proprietária pode conceder esse papel.');
      }
    }
    const [user] = await this.database.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) throw new ApiException(404, 'not_found', 'Não há conta com esse e-mail.');
    await this.database.db.insert(memberships).values({ organizationId, userId: user.id, role });
    return { userId: user.id, role };
  }

  private throttle(key: string) {
    const entry = this.failures.get(key);
    if (entry && entry.until > Date.now()) {
      throw new ApiException(429, 'rate_limited', 'Muitas tentativas. Espere um pouco e tente de novo.');
    }
  }

  private fail(key: string) {
    const entry = this.failures.get(key) ?? { count: 0, until: 0 };
    entry.count += 1;
    if (entry.count >= 8) {
      entry.until = Date.now() + 15 * 60 * 1000;
      entry.count = 0;
    }
    this.failures.set(key, entry);
  }

  private publicUser(user: { id: string; email: string; name: string; locale: string; login?: string | null; status?: string; kind?: string; platformAdmin?: boolean }) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      login: user.login ?? null,
      status: user.status ?? 'active',
      kind: user.kind ?? 'human',
      platformAdmin: Boolean(user.platformAdmin),
    };
  }
}

export async function findMembership(database: DatabaseService, userId: string, organizationId: string) {
  const [membership] = await database.db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);
  return membership;
}
