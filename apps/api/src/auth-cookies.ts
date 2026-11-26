import type { FastifyReply } from 'fastify';

export function sessionCookie(token: string, csrf: string): string[] {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = 12 * 60 * 60;
  return [
    `tscms_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    `tscms_csrf=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ];
}

export function clearSessionCookie(): string[] {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return [
    `tscms_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure}`,
    `tscms_csrf=; Path=/; SameSite=Lax; Max-Age=0${secure}`,
  ];
}

export function writeSession(reply: FastifyReply, token: string, csrf: string) {
  reply.header('set-cookie', sessionCookie(token, csrf));
}

export function clearSession(reply: FastifyReply) {
  reply.header('set-cookie', clearSessionCookie());
}

export function readCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(part.slice(separator + 1).trim());
  }
  return cookies;
}
