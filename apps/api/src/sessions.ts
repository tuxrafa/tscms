import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import { iamSessions, type Database } from '@tscms/database';
import { randomToken } from '@tscms/core-domain';

export function sessionTtlMs(value = process.env.TOKEN_TTL ?? '12h'): number {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (!match) return 12 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2];
  const scale = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return amount * scale;
}

export async function openSession(db: Database, userId: string, email: string) {
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const [session] = await db.insert(iamSessions).values({ userId, expiresAt }).returning();
  if (!session) throw new Error('Falha ao abrir sessão.');
  const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? '');
  const token = await new SignJWT({ email, sid: session.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret);
  return { token, csrf: randomToken(24), sessionId: session.id, expiresAt };
}

export async function revokeSession(db: Database, sessionId: string) {
  await db.update(iamSessions).set({ revokedAt: new Date() }).where(eq(iamSessions.id, sessionId));
}

export async function revokeUserSessions(db: Database, userId: string) {
  await db.update(iamSessions).set({ revokedAt: new Date() }).where(eq(iamSessions.userId, userId));
}
