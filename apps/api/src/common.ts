import { createParamDecorator, type ExecutionContext, HttpException, SetMetadata } from '@nestjs/common';
import type { ZodType } from 'zod';

export class ApiException extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    details?: Array<{ path: string; message: string }>,
  ) {
    super({ error: { code, message, details } }, status);
  }
}

export function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiException(
      400,
      'validation_error',
      'Os dados enviados são inválidos.',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export interface AuthUser {
  id: string;
  email: string;
  kind?: 'human' | 'service';
  sessionId?: string;
}

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): AuthUser => {
  return context.switchToHttp().getRequest<{ user: AuthUser }>().user;
});

export const IS_PUBLIC = 'tscms:public';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export function page<T>(data: T[], total: number, limit: number, offset: number) {
  return { data, page: { total, limit, offset } };
}

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
