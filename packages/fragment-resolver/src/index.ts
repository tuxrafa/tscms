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

const fragmentTokenPattern = /\$\{fragmento\.([a-z0-9]+(?:-[a-z0-9]+)*)\}/g;

export function fragmentToken(slug: string): string {
  return `\${fragmento.${slug}}`;
}

/** Text inserted where a page writes `${fragmento.slug}`. */
export function fragmentPlainText(data: Record<string, unknown>): string {
  if (typeof data.text === 'string' && data.text.trim()) return data.text;
  const body = plainRichText(data.body);
  if (body) return body;
  if (typeof data.value === 'string' && data.value.trim()) return data.value;
  if (typeof data.title === 'string' && data.title.trim()) return data.title;
  for (const value of Object.values(data)) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export function valueContainsFragmentToken(value: unknown, slug: string): boolean {
  if (value === undefined || value === null) return false;
  return JSON.stringify(value).includes(fragmentToken(slug));
}

export function pageUsesExperienceFragment(document: CanonicalDocument, fragmentId: string): boolean {
  return collectFragmentReferences(document).some((node) => node.fragmentId === fragmentId && node.mode === 'linked');
}

export function expandFragmentTokens<T>(value: T, texts: ReadonlyMap<string, string>): T {
  return replaceTokens(value) as T;
  function replaceTokens(current: unknown): unknown {
    if (typeof current === 'string') {
      return current.replace(fragmentTokenPattern, (match, slug: string) => texts.get(slug) ?? match);
    }
    if (Array.isArray(current)) return current.map((item) => replaceTokens(item));
    if (current && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current as Record<string, unknown>).map(([key, child]) => [key, replaceTokens(child)]));
    }
    return current;
  }
}

function plainRichText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const document = value as {
    type?: string;
    content?: Array<{ type?: string; children?: Array<{ text?: string }>; items?: Array<Array<{ text?: string }>> }>;
  };
  if (document.type !== 'doc' || !Array.isArray(document.content)) return '';
  return document.content
    .map((block) => {
      if (block.type === 'list') return (block.items ?? []).map((item) => item.map((node) => node.text ?? '').join('')).join(' ');
      return (block.children ?? []).map((node) => node.text ?? '').join('');
    })
    .filter((block) => block.length > 0)
    .join('\n');
}
