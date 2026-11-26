import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { argon2Verify, argon2id } from 'hash-wasm';

const scrypt = promisify(scryptCallback);

/** OWASP baseline for Argon2id: 19 MiB, 2 iterations, parallelism 1. */
export const argon2Params = {
  memorySize: 19456,
  iterations: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

const commonPasswords = new Set([
  'password',
  'password123',
  'admin',
  'admin123',
  '123456',
  '12345678',
  'qwerty',
  'senha',
  'senha123',
  'changeme',
  'adminadmin',
  'password12345',
]);

export function assertPasswordQuality(password: string, minimum = 12): void {
  if (password.length < minimum) throw new Error(`A senha precisa ter ao menos ${minimum} caracteres.`);
  if (password.length > 200) throw new Error('A senha é longa demais.');
  if (commonPasswords.has(password.toLowerCase())) throw new Error('Essa senha é comum demais.');
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordQuality(password, 10);
  const salt = randomBytes(16);
  return argon2id({
    password,
    salt,
    ...argon2Params,
    outputType: 'encoded',
  });
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (encoded.startsWith('$argon2')) {
    return argon2Verify({ password, hash: encoded });
  }
  return verifyScrypt(password, encoded);
}

async function verifyScrypt(password: string, encoded: string): Promise<boolean> {
  const [algorithm, salt, hex] = encoded.split('$');
  if (algorithm !== 'scrypt' || !salt || !hex) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

const secretKey = /password|passwd|secret|token|hash|authorization|cookie|credential|api[-_]?key/i;

/** Removes secrets before an audit event or a log line is stored. */
export function redactSecrets<T>(value: T): T {
  return redact(value) as T;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = secretKey.test(key) ? '[redacted]' : redact(item);
  }
  return output;
}
