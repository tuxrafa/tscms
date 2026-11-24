import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSiteProject } from './index.js';

describe('criação de site', () => {
  it('gera um projeto fora do CMS e recusa sobrescrever', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'tscms-create-'));
    const target = path.join(parent, 'revista');
    await createSiteProject(target, 'revista');
    const config = JSON.parse(await readFile(path.join(target, 'tscms.site.json'), 'utf8'));
    expect(config.siteId).toBe('revista');
    const css = await readFile(path.join(target, 'styles', 'styles.css'), 'utf8');
    expect(css).toContain('--site-ink');
    await writeFile(path.join(target, 'styles', 'styles.css'), '/* personalizado */\n');
    await expect(createSiteProject(target, 'revista')).rejects.toThrow(/não sobrescreve/);
    expect(await readFile(path.join(target, 'styles', 'styles.css'), 'utf8')).toBe('/* personalizado */\n');
  });
});
