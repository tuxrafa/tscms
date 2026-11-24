import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { jwtVerify } from 'jose';
import { ApiException, IS_PUBLIC, type AuthUser } from './common.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new ApiException(401, 'unauthorized', 'Autenticação necessária.');
    }
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
      const { payload } = await jwtVerify(header.slice(7), secret);
      if (!payload.sub || typeof payload.email !== 'string') {
        throw new Error('Token incompleto.');
      }
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new ApiException(401, 'unauthorized', 'Token inválido.');
    }
  }
}
