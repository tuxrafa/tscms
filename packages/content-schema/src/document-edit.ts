import type { CanonicalDocument, ContentNode, SectionNode } from './document.js';

export interface DocumentMutation {
  type: 'insert' | 'update' | 'remove' | 'move';
  slot?: string;
  sectionId?: string;
  nodeId?: string;
  index?: number;
  node?: ContentNode;
  patch?: Partial<ContentNode>;
  toSectionId?: string;
  toIndex?: number;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function findSection(doc: CanonicalDocument, slot: string, sectionId: string): SectionNode {
  const section = doc.slots[slot]?.sections.find((item) => item.id === sectionId);
  if (!section) {
    throw new Error(`Seção ${sectionId} não encontrada no slot ${slot}.`);
  }
  return section;
}

export function applyMutation(document: CanonicalDocument, mutation: DocumentMutation): CanonicalDocument {
  const next = clone(document);
  const slot = mutation.slot ?? 'main';
  if (!next.slots[slot]) {
    next.slots[slot] = { sections: [] };
  }
  if (mutation.type === 'insert') {
    if (!mutation.sectionId || !mutation.node) {
      throw new Error('Inserção exige seção e nó.');
    }
    const section = findSection(next, slot, mutation.sectionId);
    const index = mutation.index ?? section.children.length;
    section.children.splice(index, 0, mutation.node);
    return next;
  }
  if (mutation.type === 'update') {
    if (!mutation.sectionId || !mutation.nodeId || !mutation.patch) {
      throw new Error('Atualização exige seção, nó e patch.');
    }
    const section = findSection(next, slot, mutation.sectionId);
    const index = section.children.findIndex((node) => node.id === mutation.nodeId);
    if (index < 0) throw new Error('Nó não encontrado.');
    const current = section.children[index];
    if (!current) throw new Error('Nó não encontrado.');
    section.children[index] = { ...current, ...mutation.patch, data: { ...('data' in current ? current.data : {}), ...((mutation.patch as { data?: Record<string, unknown> }).data ?? {}) } } as ContentNode;
    return next;
  }
  if (mutation.type === 'remove') {
    if (!mutation.sectionId || !mutation.nodeId) throw new Error('Remoção exige seção e nó.');
    const section = findSection(next, slot, mutation.sectionId);
    section.children = section.children.filter((node) => node.id !== mutation.nodeId);
    return next;
  }
  if (!mutation.sectionId || !mutation.nodeId || !mutation.toSectionId) {
    throw new Error('Movimentação incompleta.');
  }
  const from = findSection(next, slot, mutation.sectionId);
  const to = findSection(next, slot, mutation.toSectionId);
  const index = from.children.findIndex((node) => node.id === mutation.nodeId);
  if (index < 0) throw new Error('Nó não encontrado.');
  const [node] = from.children.splice(index, 1);
  if (!node) throw new Error('Nó não encontrado.');
  to.children.splice(mutation.toIndex ?? to.children.length, 0, node);
  return next;
}

export interface HistoryState {
  past: CanonicalDocument[];
  present: CanonicalDocument;
  future: CanonicalDocument[];
}

export function createHistory(document: CanonicalDocument): HistoryState {
  return { past: [], present: document, future: [] };
}

export function historyCommit(state: HistoryState, mutation: DocumentMutation): HistoryState {
  return {
    past: [...state.past, state.present],
    present: applyMutation(state.present, mutation),
    future: [],
  };
}

export function historyUndo(state: HistoryState): HistoryState {
  const previous = state.past[state.past.length - 1];
  if (!previous) return state;
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  };
}

export function historyRedo(state: HistoryState): HistoryState {
  const next = state.future[0];
  if (!next) return state;
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  };
}
