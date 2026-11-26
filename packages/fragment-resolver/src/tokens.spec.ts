import { describe, expect, it } from 'vitest';
import { expandFragmentTokens, fragmentPlainText, fragmentToken, pageUsesExperienceFragment, valueContainsFragmentToken } from './index.js';
import { emptyDocument } from '@tscms/content-schema';

describe('tags de fragmento de texto', () => {
  it('troca a tag pelo texto publicado e preserva uma tag desconhecida', () => {
    const document = {
      slots: {
        main: {
          sections: [{ children: [{ data: { body: { content: [{ children: [{ text: `Aviso: ${fragmentToken('citacao')}` }] }] } } }] }],
        },
      },
    };
    const expanded = expandFragmentTokens(document, new Map([['citacao', 'Outra frase.']]));
    expect(JSON.stringify(expanded)).toContain('Aviso: Outra frase.');
    expect(expandFragmentTokens('Veja ${fragmento.ausente}', new Map())).toBe('Veja ${fragmento.ausente}');
  });

  it('lê o corpo do fragmento antes do título', () => {
    expect(
      fragmentPlainText({
        title: 'Citação',
        body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Outra frase.' }] }] },
      }),
    ).toBe('Outra frase.');
    expect(fragmentPlainText({ text: 'Banner curto', title: 'Nome' })).toBe('Banner curto');
  });

  it('reconhece página que usa o fragmento de experiência ligado', () => {
    const page = emptyDocument({ id: 'capa', type: 'page', title: 'Capa' });
    page.slots.main?.sections[0]?.children.push({
      id: 'ref',
      type: 'fragmentReference',
      fragmentId: '00000000-0000-4000-8000-000000000001',
      mode: 'linked',
    });
    expect(pageUsesExperienceFragment(page, '00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(valueContainsFragmentToken(page, 'citacao')).toBe(false);
    page.slots.main?.sections[0]?.children.push({
      id: 'note',
      type: 'defaultContent',
      element: 'text',
      data: { body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'text', text: fragmentToken('citacao') }] }] } },
    });
    expect(valueContainsFragmentToken(page, 'citacao')).toBe(true);
  });
});
