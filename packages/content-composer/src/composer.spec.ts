import { describe, expect, it } from 'vitest';
import { emptyDocument } from '@tscms/content-schema';
import { FragmentCycleError } from '@tscms/fragment-resolver';
import { applySiteChrome, compose } from './index.js';

describe('content composer', () => {
  it('resolve fragmento publicado e rejeita ciclo', () => {
    const page = emptyDocument({ id: 'page', type: 'page', title: 'Home' });
    page.slots.main?.sections[0]?.children.push({
      id: 'ref',
      type: 'fragmentReference',
      fragmentId: '11111111-1111-4111-8111-111111111111',
      mode: 'linked',
    });
    const fragment = emptyDocument({ id: 'frag', type: 'experienceFragment', title: 'Aviso' });
    fragment.slots.main?.sections[0]?.children.push({
      id: 'cta',
      type: 'block',
      name: 'cta',
      data: { title: 'Leia' },
    });
    const result = compose({
      page,
      fragments: {
        getPublished: () => ({
          id: '11111111-1111-4111-8111-111111111111',
          revisionId: '22222222-2222-4222-8222-222222222222',
          variation: 'default',
          path: '/fragments/aviso',
          document: fragment,
        }),
        getRevision: () => undefined,
      },
    });
    expect(result.issues).toEqual([]);
    expect(result.document.slots.main?.sections[0]?.children[0]).toMatchObject({ type: 'block', name: 'cta' });

    const cyclic = emptyDocument({ id: 'c', type: 'experienceFragment', title: 'Ciclo' });
    cyclic.slots.main?.sections[0]?.children.push({
      id: 'self',
      type: 'fragmentReference',
      fragmentId: '11111111-1111-4111-8111-111111111111',
      mode: 'linked',
    });
    expect(() =>
      compose({
        page,
        fragments: {
          getPublished: () => ({
            id: '11111111-1111-4111-8111-111111111111',
            revisionId: '22222222-2222-4222-8222-222222222222',
            variation: 'default',
            path: '/fragments/ciclo',
            document: cyclic,
          }),
          getRevision: () => undefined,
        },
      }),
    ).toThrow(FragmentCycleError);
  });
});

describe('chrome do site', () => {
  it('adiciona referências de header e footer sem alterar o main', () => {
    const page = emptyDocument({ id: 'page', type: 'page', title: 'Home' });
    const withChrome = applySiteChrome(page, {
      headerFragmentId: '33333333-3333-4333-8333-333333333333',
      footerFragmentId: '44444444-4444-4444-8444-444444444444',
    });
    expect(withChrome.slots.header?.sections[0]?.children[0]).toMatchObject({
      type: 'fragmentReference',
      fragmentId: '33333333-3333-4333-8333-333333333333',
    });
    expect(withChrome.slots.footer?.sections[0]?.children[0]).toMatchObject({
      type: 'fragmentReference',
      fragmentId: '44444444-4444-4444-8444-444444444444',
    });
    expect(withChrome.slots.main).toEqual(page.slots.main);
  });

  it('preserva slots existentes e não muda o documento sem configuração', () => {
    const page = emptyDocument({ id: 'page', type: 'page', title: 'Home' });
    expect(applySiteChrome(page, undefined)).toEqual(page);
    page.slots.footer = { sections: [{ id: 'own', children: [] }] };
    const result = applySiteChrome(page, { footerFragmentId: '44444444-4444-4444-8444-444444444444' });
    expect(result.slots.footer).toEqual({ sections: [{ id: 'own', children: [] }] });
  });
});
