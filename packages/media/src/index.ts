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
  if (size <= 0 || size > 10 * 1024 * 1024) throw new Error('Arquivo fora do limite de 10 MB.');
}
