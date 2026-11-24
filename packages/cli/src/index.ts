import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { manifestFromCatalog } from '@tscms/block-registry';
import { siteConfigSchema, type SiteConfig } from '@tscms/content-schema';

export const protectedSitePaths = [
  'styles/styles.css',
  'styles/tokens.css',
  'styles/lazy-styles.css',
  'styles/typography.css',
  'styles/utilities.css',
  'design-system/',
  'fonts/',
  'icons/',
  'blocks/',
  'scripts/scripts.js',
  'scripts/site.js',
  'tscms.site.json',
];

export interface Diagnostic {
  level: 'ok' | 'error';
  message: string;
}

export async function readSiteConfig(root: string): Promise<SiteConfig> {
  const raw = await readFile(path.join(root, 'tscms.site.json'), 'utf8');
  return siteConfigSchema.parse(JSON.parse(raw));
}

export async function doctor(root = process.cwd()): Promise<Diagnostic[]> {
  const notes: Diagnostic[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  notes.push(major >= 22 ? { level: 'ok', message: `Node ${process.versions.node}` } : { level: 'error', message: 'Use Node 22 ou mais novo.' });
  try {
    const config = await readSiteConfig(root);
    notes.push({ level: 'ok', message: `Configuração do site ${config.siteId} válida.` });
    const serialized = JSON.stringify(config);
    if (/secret|password|token|apiKey/i.test(serialized)) {
      notes.push({ level: 'error', message: 'A configuração do site não pode carregar segredo.' });
    }
  } catch (error) {
    notes.push({ level: 'error', message: error instanceof Error ? error.message : 'Configuração inválida.' });
    return notes;
  }
  const blocks = path.join(root, 'blocks');
  try {
    const names = await readdir(blocks);
    for (const name of names) {
      const file = path.join(blocks, name, `${name}.js`);
      try {
        const source = await readFile(file, 'utf8');
        if (!source.includes('export default function decorate')) {
          notes.push({ level: 'error', message: `${name}.js precisa exportar decorate(block).` });
        } else {
          notes.push({ level: 'ok', message: `Bloco ${name} exporta decorate.` });
        }
      } catch {
        notes.push({ level: 'error', message: `Bloco ${name} sem ${name}.js.` });
      }
    }
  } catch {
    notes.push({ level: 'error', message: 'Diretório blocks ausente.' });
  }
  return notes;
}

export async function buildManifest(root: string): Promise<string> {
  const config = await readSiteConfig(root);
  const manifest = manifestFromCatalog(config.siteId);
  const target = path.join(root, 'dist', 'components.manifest.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(manifest, null, 2));
  return target;
}

export function planUpgrade(): { preserved: string[]; changed: string[]; requiresConfirmation: true } {
  return {
    preserved: protectedSitePaths,
    changed: ['package.json:dependencies.@tscms/eds-runtime', 'package.json:dependencies.@tscms/delivery-sdk'],
    requiresConfirmation: true,
  };
}

export async function assertInsideSite(root: string, candidate: string): Promise<void> {
  const resolved = path.resolve(root, candidate);
  const base = path.resolve(root);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error('Caminho fora do site.');
  }
  await stat(base);
}
