import { describe, expect, it } from 'vitest';
import { diffContentType, validateEntryData } from './content-validation.js';
import { assertTransition } from './publishing.js';
import { assertChoices, assertPollOpen, canSeeResults } from './polls.js';
import { roleAllows } from './rbac.js';
import { hashPassword, verifyPassword } from './security.js';
import { assertPublicHttpUrl } from './ssrf.js';
import { slugify } from './paths.js';
import type { ContentTypeDefinition } from '@tscms/content-schema';

const article: ContentTypeDefinition = {
  name: 'article',
  label: 'Artigo',
  version: 1,
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'body', type: 'richtext', required: true },
  ],
};

describe('domínio do CMS', () => {
  it('valida um artigo e rejeita campo desconhecido', () => {
    expect(
      validateEntryData(article, {
        title: 'Olá',
        body: { type: 'doc', content: [] },
      }),
    ).toEqual([]);
    expect(validateEntryData(article, { title: '', extra: true }).length).toBeGreaterThan(0);
  });

  it('exige nova versão quando o schema quebra', () => {
    const next = {
      ...article,
      version: 2,
      fields: [{ name: 'title', type: 'integer' as const, required: true }],
    };
    expect(diffContentType(article, next).breaking).toBe(true);
  });

  it('controla publicação, enquete, papéis e SSRF', async () => {
    expect(() => assertTransition('archived', 'published')).toThrow();
    expect(() =>
      assertChoices(
        { selection: 'single', minChoices: 1, maxChoices: 1, visibility: 'hidden' },
        ['a', 'b'],
        ['a', 'b'],
      ),
    ).toThrow();
    expect(() =>
      assertPollOpen({
        selection: 'single',
        minChoices: 1,
        maxChoices: 1,
        visibility: 'always',
        closesAt: '2000-01-01T00:00:00.000Z',
      }),
    ).toThrow();
    expect(canSeeResults({ visibility: 'hidden', hasVoted: true, closed: true, management: false })).toBe(false);
    expect(roleAllows('viewer', 'content:publish')).toBe(false);
    expect(roleAllows('publisher', 'content:publish')).toBe(true);
    expect(() => assertPublicHttpUrl('http://127.0.0.1/feed')).toThrow();
    expect(() => assertPublicHttpUrl('http://169.254.169.254/')).toThrow();
    expect(assertPublicHttpUrl('https://example.com/rss.xml').hostname).toBe('example.com');
    expect(slugify('Notícias do Dia')).toBe('noticias-do-dia');
    const hash = await hashPassword('senha-segura-123');
    expect(await verifyPassword('senha-segura-123', hash)).toBe(true);
    expect(await verifyPassword('outra-senha-123', hash)).toBe(false);
  });
});
