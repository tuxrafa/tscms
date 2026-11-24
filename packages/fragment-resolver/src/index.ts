import type { CanonicalDocument, ContentNode, FragmentReferenceNode } from '@tscms/content-schema';

export interface FragmentRecord {
  id: string;
  revisionId: string;
  variation: string;
  path: string;
  document: CanonicalDocument;
}

export interface FragmentLookup {
  getPublished(id: string, variation?: string): FragmentRecord | undefined;
  getRevision(revisionId: string): FragmentRecord | undefined;
}

export class FragmentCycleError extends Error {
  constructor(path: string[]) {
    super(`Referência circular de fragmentos: ${path.join(' -> ')}`);
  }
}

export function resolveFragments(
  document: CanonicalDocument,
  lookup: FragmentLookup,
  mode: 'resolve' | 'eds-block' = 'resolve',
): CanonicalDocument {
  return walk(document, lookup, mode, []);
}

function walk(
  document: CanonicalDocument,
  lookup: FragmentLookup,
  mode: 'resolve' | 'eds-block',
  stack: string[],
): CanonicalDocument {
  const slots = Object.fromEntries(
    Object.entries(document.slots).map(([name, slot]) => [
      name,
      {
        sections: slot.sections.map((section) => ({
          ...section,
          children: section.children.flatMap((node) => resolveNode(node, lookup, mode, stack)),
        })),
      },
    ]),
  );
  return { ...document, slots };
}

function resolveNode(
  node: ContentNode,
  lookup: FragmentLookup,
  mode: 'resolve' | 'eds-block',
  stack: string[],
): ContentNode[] {
  if (node.type !== 'fragmentReference') return [node];
  if (mode === 'eds-block') return [node];
  if (node.mode === 'detached') return [node];
  const record =
    node.mode === 'pinned' && node.revisionId
      ? lookup.getRevision(node.revisionId)
      : lookup.getPublished(node.fragmentId, node.variation);
  if (!record) {
    throw new Error(`Fragmento ${node.fragmentId} não possui revisão publicável.`);
  }
  if (stack.includes(record.id)) throw new FragmentCycleError([...stack, record.id]);
  const resolved = walk(record.document, lookup, mode, [...stack, record.id]);
  const main = resolved.slots.main?.sections.flatMap((section) => section.children) ?? [];
  return main.map((child) => ({ ...child, id: `${node.id}--${child.id}` }));
}

export function collectFragmentReferences(document: CanonicalDocument): FragmentReferenceNode[] {
  return Object.values(document.slots).flatMap((slot) =>
    slot.sections.flatMap((section) => section.children.filter((node) => node.type === 'fragmentReference')),
  );
}
