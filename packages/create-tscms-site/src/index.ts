import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const starter = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../starter-kits/eds-site');

export async function createSiteProject(target: string, siteId: string): Promise<string> {
  if (!/^[a-z][a-z0-9-]*$/.test(siteId)) throw new Error('siteId inválido.');
  const destination = path.resolve(target);
  const existing = await readdir(destination).catch(() => null);
  if (existing && existing.length > 0) {
    throw new Error('O diretório já tem arquivos. A criação inicial não sobrescreve um site existente.');
  }
  await mkdir(destination, { recursive: true });
  await cp(starter, destination, { recursive: true });
  const packagePath = path.join(destination, 'package.json');
  const sitePackage = JSON.parse(await readFile(packagePath, 'utf8')) as { dependencies?: Record<string, string> };
  sitePackage.dependencies = {
    '@tscms/delivery-sdk': '^0.1.0',
    '@tscms/eds-runtime': '^0.1.0',
  };
  await writeFile(packagePath, `${JSON.stringify(sitePackage, null, 2)}\n`);
  const config = {
    $schema: 'https://schemas.tscms.local/site-v1.json',
    schemaVersion: 1,
    siteId,
    name: siteId,
    api: { deliveryBaseUrl: 'http://127.0.0.1:3000/v1/delivery' },
    renderer: { type: 'eds', runtime: 'tscms', compatibilityVersion: '1' },
    paths: { blocks: './blocks', scripts: './scripts', styles: './styles' },
    authoring: { componentsManifest: './dist/components.manifest.json' },
    locales: ['pt-BR'],
  };
  await writeFile(path.join(destination, 'tscms.site.json'), `${JSON.stringify(config, null, 2)}\n`);
  await writeFile(
    path.join(destination, 'PROXIMO-PASSO.txt'),
    'Crie um repositório Git próprio para este site. Não o coloque dentro do repositório do TSCMS.\n',
  );
  return destination;
}
