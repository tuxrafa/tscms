import { describe, expect, it } from 'vitest';
import { createHistory, emptyDocument, historyCommit, historyRedo, historyUndo } from './index.js';

describe('edições do documento canônico', () => {
  it('insere, desfaz e refaz sem perder o conteúdo', () => {
    const history = createHistory(
      emptyDocument({ id: 'page-1', type: 'page', title: 'Início' }),
    );
    const inserted = historyCommit(history, {
      type: 'insert',
      sectionId: 'section-main',
      node: {
        id: 'heading-1',
        type: 'defaultContent',
        element: 'heading',
        data: { text: 'Olá', level: 1 },
      },
    });
    expect(inserted.present.slots.main?.sections[0]?.children).toHaveLength(1);
    const undone = historyUndo(inserted);
    expect(undone.present.slots.main?.sections[0]?.children).toHaveLength(0);
    const redone = historyRedo(undone);
    expect(redone.present.slots.main?.sections[0]?.children[0]?.id).toBe('heading-1');
  });
});
