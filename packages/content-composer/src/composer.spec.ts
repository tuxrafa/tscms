import { describe, expect, it } from 'vitest';
import { emptyDocument } from '@tscms/content-schema';
import { FragmentCycleError } from '@tscms/fragment-resolver';
import { compose } from './index.js';

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
