import type { CanonicalDocument, ContentNode, EditableTemplate } from '@tscms/content-schema';
import { assertKnownComponent } from '@tscms/block-registry';
import { resolveFragments, type FragmentLookup } from '@tscms/fragment-resolver';
import { applyTemplate, validatePolicies } from '@tscms/template-engine';

export interface CompositionInput {
  page: CanonicalDocument;
  template?: EditableTemplate;
  fragments: FragmentLookup;
  manifestNames?: string[];
  fragmentDelivery?: 'resolve' | 'eds-block';
}

export interface CompositionResult {
  document: CanonicalDocument;
  issues: string[];
}

export function compose(input: CompositionInput): CompositionResult {
  const issues: string[] = [];
  let document = input.page;
  if (input.template) {
    issues.push(...validatePolicies(input.template, input.page));
    document = applyTemplate(input.template, input.page);
  }
  for (const node of walk(document)) {
    if (node.type === 'block') {
      try {
        assertKnownComponent(node.name, input.manifestNames ?? []);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : 'Bloco desconhecido.');
      }
      if (containsNestedBlock(node)) {
        issues.push(`O bloco ${node.name} não pode conter outro bloco.`);
      }
    }
  }
  if (issues.length > 0) return { document, issues };
  const resolved = resolveFragments(document, input.fragments, input.fragmentDelivery ?? 'resolve');
  return { document: resolved, issues };
}

function walk(document: CanonicalDocument): ContentNode[] {
  return Object.values(document.slots).flatMap((slot) => slot.sections.flatMap((section) => section.children));
}

function containsNestedBlock(node: ContentNode): boolean {
  if (node.type === 'fragmentReference') return false;
  const children = node.data.children;
  if (!Array.isArray(children)) return false;
  return children.some((child) => isRecord(child) && child.type === 'block');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
