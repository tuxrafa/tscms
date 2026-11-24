import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { doctor, planUpgrade } from './index.js';

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tscms-site-'));
  await mkdir(path.join(root, 'blocks', 'hero'), { recursive: true });
  await writeFile(path.join(root, 'blocks', 'hero', 'hero.js'), 'export default function decorate(block) { block.dataset.ready = "1"; }\n');
  await writeFile(path.join(root, 'blocks', 'hero', 'hero.css'), '.hero { display: block; }\n');
  await writeFile(
    path.join(root, 'tscms.site.json'),
    JSON.stringify({
      schemaVersion: 1,
      siteId: 'revista',
      name: 'Revista',
      api: { deliveryBaseUrl: 'http://127.0.0.1:3000/v1/delivery' },
      renderer: { type: 'eds', runtime: 'tscms', compatibilityVersion: '1' },
      paths: { blocks: './blocks', scripts: './scripts', styles: './styles' },
    }),
  );
  return root;
}

describe('CLI de site', () => {
  it('valida um site sem pedir o repositório do CMS', async () => {
    const notes = await doctor(await fixture());
    expect(notes.some((note) => note.level === 'error')).toBe(false);
  });

  it('não inclui CSS do site no plano de atualização', () => {
    const plan = planUpgrade();
    expect(plan.preserved).toContain('styles/styles.css');
    expect(plan.preserved).toContain('blocks/');
    expect(plan.changed.join(' ')).not.toContain('styles.css');
    expect(plan.requiresConfirmation).toBe(true);
  });
});
