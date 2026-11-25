import type { RichTextDocument } from '@tscms/content-schema';

interface EditorMark {
  type: string;
  attrs?: { href?: string };
}

interface EditorNode {
  type?: string;
  text?: string;
  attrs?: { level?: number; href?: string };
  marks?: EditorMark[];
  content?: EditorNode[];
}

type Inline =
  | { type: 'text'; text: string; marks?: Array<'strong' | 'em' | 'code'> }
  | { type: 'link'; href: string; text: string };

type Block = RichTextDocument['content'][number];

export function canonicalToEditor(value: unknown): EditorNode {
  if (!isCanonical(value)) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return { type: 'doc', content: value.content.map(blockToEditor) };
}

export function editorToCanonical(value: EditorNode): RichTextDocument {
  const content = (value.content ?? []).map(editorBlock).filter((block): block is Block => block !== undefined);
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph', children: [] }] };
}

export function plainRichText(value: unknown): string {
  if (!isCanonical(value)) return '';
  return value.content
    .map((block) => {
      if (block.type === 'list') return block.items.map((item) => inlineText(item)).join(' ');
      return inlineText(block.children);
    })
    .filter((item) => item.length > 0)
    .join(' ');
}

function blockToEditor(block: Block): EditorNode {
  if (block.type === 'paragraph') return { type: 'paragraph', content: inlinesToEditor(block.children) };
  if (block.type === 'heading') return { type: 'heading', attrs: { level: block.level }, content: inlinesToEditor(block.children) };
  if (block.type === 'blockquote') {
    return { type: 'blockquote', content: [{ type: 'paragraph', content: inlinesToEditor(block.children) }] };
  }
  return {
    type: block.ordered ? 'orderedList' : 'bulletList',
    content: block.items.map((item) => ({ type: 'listItem', content: [{ type: 'paragraph', content: inlinesToEditor(item) }] })),
  };
}

function inlinesToEditor(children: Inline[]): EditorNode[] {
  return children.flatMap((child) => {
    if (child.text.length === 0) return [];
    if (child.type === 'link') return [{ type: 'text', text: child.text, marks: [{ type: 'link', attrs: { href: child.href } }] }];
    const marks = (child.marks ?? []).map((mark) => ({ type: mark === 'strong' ? 'bold' : mark === 'em' ? 'italic' : 'code' }));
    return [marks.length > 0 ? { type: 'text', text: child.text, marks } : { type: 'text', text: child.text }];
  });
}

function editorBlock(node: EditorNode): Block | undefined {
  if (node.type === 'paragraph') return { type: 'paragraph', children: editorInlines(node.content ?? []) };
  if (node.type === 'heading') {
    const level = node.attrs?.level;
    const safe = level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6 ? level : 2;
    return { type: 'heading', level: safe, children: editorInlines(node.content ?? []) };
  }
  if (node.type === 'blockquote') {
    return { type: 'blockquote', children: (node.content ?? []).flatMap((child) => editorInlines(child.content ?? [])) };
  }
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return {
      type: 'list',
      ordered: node.type === 'orderedList',
      items: (node.content ?? []).map((item) => (item.content ?? []).flatMap((child) => editorInlines(child.content ?? []))),
    };
  }
  return undefined;
}

function editorInlines(nodes: EditorNode[]): Inline[] {
  const result: Inline[] = [];
  for (const node of nodes) {
    if (node.type !== 'text' || !node.text) continue;
    const link = node.marks?.find((mark) => mark.type === 'link');
    const href = link?.attrs?.href;
    if (typeof href === 'string' && href.length > 0) {
      result.push({ type: 'link', href, text: node.text });
      continue;
    }
    const marks = (node.marks ?? [])
      .map((mark) => (mark.type === 'bold' ? 'strong' : mark.type === 'italic' ? 'em' : mark.type === 'code' ? 'code' : undefined))
      .filter((mark): mark is 'strong' | 'em' | 'code' => mark !== undefined);
    result.push(marks.length > 0 ? { type: 'text', text: node.text, marks } : { type: 'text', text: node.text });
  }
  return result;
}

function inlineText(children: Inline[]): string {
  return children.map((child) => child.text).join('');
}

function isCanonical(value: unknown): value is RichTextDocument {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'doc' && Array.isArray((value as { content?: unknown }).content);
}
