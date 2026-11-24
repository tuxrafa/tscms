import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { memberships, organizations, roles, users, workspaces } from '@tscms/database';
import { permissions, hashPassword, slugify, verifyPassword } from '@tscms/core-domain';
import { loginSchema, registerSchema } from '@tscms/api-contracts';
import { AccessService } from './access.service.js';
import { ApiException, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

const systemRoles = [
  ['owner', 'Proprietária'],
  ['admin', 'Administração'],
  ['editor', 'Edição'],
  ['publisher', 'Publicação'],
  ['viewer', 'Leitura'],
] as const;

@Injectable()
export class IdentityService {
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
          .values({ email: body.email.toLowerCase(), name: body.name, passwordHash })
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
        return { token: await this.sign(user.id, user.email), user: this.publicUser(user), organization };
      });
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(409, 'conflict', 'E-mail ou organização já existem.');
    }
  }

  async login(input: unknown) {
    const body = parseInput(loginSchema, input);
    const [user] = await this.database.db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new ApiException(401, 'unauthorized', 'Credenciais inválidas.');
    }
    return { token: await this.sign(user.id, user.email), user: this.publicUser(user) };
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
    const [user] = await this.database.db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (!user) throw new ApiException(404, 'not_found', 'Não há conta com esse e-mail.');
    await this.database.db.insert(memberships).values({ organizationId, userId: user.id, role });
    return { userId: user.id, role };
  }

  private async sign(userId: string, email: string): Promise<string> {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(process.env.TOKEN_TTL ?? '12h')
      .sign(secret);
  }

  private publicUser(user: { id: string; email: string; name: string; locale: string }) {
    return { id: user.id, email: user.email, name: user.name, locale: user.locale };
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
