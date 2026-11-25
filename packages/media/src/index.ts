import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredObject {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface BlobStore {
  put(object: StoredObject): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  publicPath(key: string): string;
}

export interface ImageVariant {
  width: number;
  format: 'webp';
  body: Buffer;
}

const widths = [750, 2000];

export async function createImageVariants(input: Buffer): Promise<ImageVariant[]> {
  const sharp = (await import('sharp')).default;
  const variants: ImageVariant[] = [];
  for (const width of widths) {
    const body = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    variants.push({ width, format: 'webp', body });
  }
  return variants;
}

export function assertUpload(contentType: string, size: number): void {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowed.includes(contentType)) throw new Error('Tipo de arquivo não permitido.');
  if (size <= 0 || size > 20 * 1024 * 1024) throw new Error('Arquivo fora do limite de 20 MB.');
}

export function sha256(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export interface DetectedMedia {
  mediaType: 'image' | 'document';
  mime: string;
}

export function detectMedia(body: Buffer): DetectedMedia {
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return { mediaType: 'image', mime: 'image/png' };
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return { mediaType: 'image', mime: 'image/jpeg' };
  if (body.length >= 6 && body.subarray(0, 6).toString('ascii') === 'GIF87a') return { mediaType: 'image', mime: 'image/gif' };
  if (body.length >= 6 && body.subarray(0, 6).toString('ascii') === 'GIF89a') return { mediaType: 'image', mime: 'image/gif' };
  if (body.length >= 12 && body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') return { mediaType: 'image', mime: 'image/webp' };
  if (body.length >= 5 && body.subarray(0, 5).toString('ascii') === '%PDF-') return { mediaType: 'document', mime: 'application/pdf' };
  const head = body.subarray(0, 200).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || head.includes('<svg')) throw new Error('SVG não é aceito neste fluxo porque pode conter conteúdo ativo.');
  throw new Error('Tipo de arquivo não permitido.');
}

export const renditionPresets = [
  { name: 'thumbnail', width: 200 },
  { name: 'small', width: 480 },
  { name: 'medium', width: 768 },
  { name: 'large', width: 1200 },
  { name: 'xlarge', width: 1920 },
] as const;

export interface ImageRendition {
  preset: (typeof renditionPresets)[number]['name'];
  width: number;
  height: number;
  format: 'webp';
  body: Buffer;
}

export async function createImageRenditions(input: Buffer): Promise<{ width: number; height: number; renditions: ImageRendition[] }> {
  const sharp = (await import('sharp')).default;
  const source = sharp(input, { failOn: 'error' }).rotate();
  const meta = await source.metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;
  const renditions: ImageRendition[] = [];
  for (const preset of renditionPresets) {
    if (originalWidth > 0 && preset.width > originalWidth && preset.name !== 'thumbnail') continue;
    const { data, info } = await sharp(input).rotate().resize({ width: preset.width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
    renditions.push({ preset: preset.name, width: info.width, height: info.height, format: 'webp', body: data });
  }
  return { width: originalWidth, height: originalHeight, renditions };
}

export interface StorageProvider {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export function createStorage(): StorageProvider {
  if (process.env.STORAGE_DRIVER === 's3') return s3Storage();
  return localStorage();
}

export function s3Storage(): StorageProvider {
  const bucket = process.env.S3_BUCKET ?? '';
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  });
  return {
    async put(key, body) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
    },
    async get(key) {
      const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await response.Body?.transformToByteArray();
      if (!bytes) throw new Error('Objeto de storage vazio.');
      return Buffer.from(bytes);
    },
  };
}

export function localStorage(root = process.env.MEDIA_ROOT ?? './data/media'): StorageProvider {
  const base = path.resolve(root);
  const resolveKey = (key: string) => {
    const target = path.resolve(base, key);
    if (!target.startsWith(base + path.sep) && target !== base) throw new Error('Chave de storage inválida.');
    return target;
  };
  return {
    async put(key, body) {
      const target = resolveKey(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async get(key) {
      return readFile(resolveKey(key));
    },
  };
}
