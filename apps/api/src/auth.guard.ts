import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull } from 'drizzle-orm';
import { jwtVerify } from 'jose';
import { sha256 } from '@tscms/core-domain';
import { iamCredentials, iamSessions, users } from '@tscms/database';
import { readCookies } from './auth-cookies.js';
import { ApiException, IS_PUBLIC, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly database: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string; cookie?: string; 'x-csrf-token'?: string };
      method?: string;
      user?: AuthUser;
    }>();
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer tscms_')) {
      request.user = await this.serviceAccount(header.slice(7));
      return true;
    }
    const cookies = readCookies(request.headers.cookie);
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const token = bearer ?? cookies.tscms_session;
    if (!token) throw new ApiException(401, 'unauthorized', 'Autenticação necessária.');
    if (!bearer && token) this.assertCsrf(request.method ?? 'GET', cookies.tscms_csrf, request.headers['x-csrf-token']);
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
      const { payload } = await jwtVerify(token, secret);
      if (!payload.sub || typeof payload.email !== 'string' || typeof payload.sid !== 'string') {
        throw new Error('Token incompleto.');
      }
      const [session] = await this.database.db.select().from(iamSessions).where(eq(iamSessions.id, payload.sid)).limit(1);
      if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
        throw new Error('Sessão revogada.');
      }
      const [account] = await this.database.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
      if (!account || account.status !== 'active') throw new Error('Conta indisponível.');
      request.user = { id: account.id, email: account.email, kind: account.kind === 'service' ? 'service' : 'human', sessionId: session.id };
      return true;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw new ApiException(401, 'unauthorized', 'Token inválido.');
    }
  }

  private assertCsrf(method: string, cookie: string | undefined, header: string | undefined) {
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (!cookie || !header || cookie !== header) throw new ApiException(403, 'forbidden', 'Falha na verificação CSRF.');
  }

  private async serviceAccount(token: string): Promise<AuthUser> {
    const [credential] = await this.database.db
      .select()
      .from(iamCredentials)
      .where(and(eq(iamCredentials.tokenHash, sha256(token)), eq(iamCredentials.kind, 'service'), isNull(iamCredentials.revokedAt)))
      .limit(1);
    if (!credential || credential.expiresAt < new Date()) throw new ApiException(401, 'unauthorized', 'Credencial inválida.');
    const [account] = await this.database.db.select().from(users).where(eq(users.id, credential.userId)).limit(1);
    if (!account || account.status !== 'active' || account.kind !== 'service') {
      throw new ApiException(401, 'unauthorized', 'Credencial inválida.');
    }
    await this.database.db.update(iamCredentials).set({ lastUsedAt: new Date() }).where(eq(iamCredentials.id, credential.id));
    await this.database.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, account.id));
    return { id: account.id, email: account.email, kind: 'service' };
  }
}
