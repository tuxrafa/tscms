import { describe, expect, it } from 'vitest';
import { canonicalToEditor, editorToCanonical, plainRichText } from './rich-text';

const document = {
  type: 'doc' as const,
  content: [
    { type: 'paragraph' as const, children: [{ type: 'text' as const, text: 'Olá ', marks: ['strong' as const] }, { type: 'text' as const, text: 'mundo' }] },
    { type: 'heading' as const, level: 2 as const, children: [{ type: 'text' as const, text: 'Título' }] },
    { type: 'list' as const, ordered: false, items: [[{ type: 'text' as const, text: 'Um' }], [{ type: 'link' as const, href: '/a', text: 'Dois' }]] },
  ],
};

describe('rich text do componente de texto', () => {
  it('ida e volta entre o documento canônico e o editor', () => {
    expect(editorToCanonical(canonicalToEditor(document))).toEqual(document);
    expect(plainRichText(document)).toBe('Olá mundo Título Um Dois');
  });
});