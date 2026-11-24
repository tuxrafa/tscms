import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function pkg(name: string) {
  return JSON.parse(readFileSync(name, 'utf8')) as { dependencies?: Record<string, string> };
}

describe('limites entre pacotes', () => {
  it('impede o núcleo de depender do Author ou do renderer', () => {
    const api = pkg('apps/api/package.json').dependencies ?? {};
    const core = pkg('packages/core-domain/package.json').dependencies ?? {};
    const database = pkg('packages/database/package.json').dependencies ?? {};
    const publishing = pkg('packages/publishing/package.json').dependencies ?? {};
    const composer = pkg('packages/content-composer/package.json').dependencies ?? {};
    for (const dependencies of [api, core, database, publishing, composer]) {
      expect(dependencies.react).toBeUndefined();
      expect(dependencies['@tscms/author']).toBeUndefined();
      expect(dependencies['@tscms/ui']).toBeUndefined();
    }
    expect(core['@tscms/eds-compat']).toBeUndefined();
    expect(publishing['@tscms/eds-compat']).toBeUndefined();
    expect(composer['@tscms/eds-compat']).toBeUndefined();
    expect(api['@tscms/eds-runtime']).toBeUndefined();
  });

  it('mantém o consumidor de exemplo longe do Author e do EDS', () => {
    const source = readFileSync('examples/example-content-client/src/present.ts', 'utf8');
    expect(source).not.toContain('react');
    expect(source).not.toContain('@tscms/eds');
    expect(source).not.toContain('@tscms/author');
  });
});
