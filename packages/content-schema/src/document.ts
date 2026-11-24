import { z } from 'zod';

export const CANONICAL_SCHEMA_VERSION = 1 as const;

export const pageMetadataSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(500).optional(),
  canonical: z.string().optional(),
  robots: z.string().max(120).optional(),
  language: z.string().min(2).max(35).optional(),
  alternates: z
    .array(z.object({ locale: z.string(), href: z.string() }))
    .optional(),
  openGraph: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
    })
    .optional(),
  structuredData: z.record(z.unknown()).optional(),
  extra: z.record(z.string()).optional(),
  nav: z.string().optional(),
  footer: z.string().optional(),
  template: z.string().optional(),
  theme: z.string().optional(),
});

export type PageMetadata = z.infer<typeof pageMetadataSchema>;

export const sectionMetadataSchema = z.object({
  style: z.array(z.string().min(1)).optional(),
  background: z.string().optional(),
  anchorId: z.string().optional(),
  name: z.string().optional(),
});

const contentNodeSchema: z.ZodType<ContentNode> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({
      id: z.string().min(1),
      type: z.literal('defaultContent'),
      element: z.enum([
        'heading',
        'text',
        'image',
        'button',
        'buttonGroup',
        'divider',
        'spacer',
        'list',
        'quote',
        'code',
      ]),
      data: z.record(z.unknown()),
    }),
    z.object({
      id: z.string().min(1),
      type: z.literal('block'),
      name: z.string().regex(/^[a-z][a-z0-9-]*$/),
      variant: z.string().optional(),
      options: z.array(z.string()).optional(),
      data: z.record(z.unknown()),
    }),
    z.object({
      id: z.string().min(1),
      type: z.literal('fragmentReference'),
      fragmentId: z.string().uuid(),
      mode: z.enum(['linked', 'pinned', 'detached']),
      revisionId: z.string().uuid().optional(),
      variation: z.string().optional(),
      path: z.string().optional(),
    }),
  ]),
);

export interface DefaultContentNode {
  id: string;
  type: 'defaultContent';
  element:
    | 'heading'
    | 'text'
    | 'image'
    | 'button'
    | 'buttonGroup'
    | 'divider'
    | 'spacer'
    | 'list'
    | 'quote'
    | 'code';
  data: Record<string, unknown>;
}

export interface BlockNode {
  id: string;
  type: 'block';
  name: string;
  variant?: string;
  options?: string[];
  data: Record<string, unknown>;
}

export interface FragmentReferenceNode {
  id: string;
  type: 'fragmentReference';
  fragmentId: string;
  mode: 'linked' | 'pinned' | 'detached';
  revisionId?: string;
  variation?: string;
  path?: string;
}

export type ContentNode = DefaultContentNode | BlockNode | FragmentReferenceNode;

export const sectionSchema = z.object({
  id: z.string().min(1),
  metadata: sectionMetadataSchema.optional(),
  children: z.array(contentNodeSchema),
});

export type SectionNode = z.infer<typeof sectionSchema>;

export const slotSchema = z.object({
  sections: z.array(sectionSchema),
});

export const canonicalDocumentSchema = z.object({
  schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
  id: z.string().min(1),
  type: z.enum(['page', 'template', 'experienceFragment']),
  locale: z.string().min(2),
  templateId: z.string().uuid().optional(),
  metadata: pageMetadataSchema,
  slots: z.record(slotSchema),
});

export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>;

export const slotPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  allowedBlocks: z.array(z.string()),
  minItems: z.number().int().nonnegative().optional(),
  maxItems: z.number().int().positive().optional(),
  required: z.boolean().optional(),
  editable: z.boolean().optional(),
  reorderable: z.boolean().optional(),
  policy: z.enum(['locked', 'editable', 'configurable', 'initial', 'shared']),
});

export type SlotPolicy = z.infer<typeof slotPolicySchema>;

export const editableTemplateSchema = z.object({
  schemaVersion: z.literal(1),
  policies: z.array(slotPolicySchema),
  initial: canonicalDocumentSchema,
});

export type EditableTemplate = z.infer<typeof editableTemplateSchema>;

export function emptyDocument(input: {
  id: string;
  type: CanonicalDocument['type'];
  title: string;
  locale?: string;
  templateId?: string;
}): CanonicalDocument {
  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    id: input.id,
    type: input.type,
    locale: input.locale ?? 'pt-BR',
    templateId: input.templateId,
    metadata: { title: input.title, language: input.locale ?? 'pt-BR' },
    slots: { main: { sections: [{ id: 'section-main', children: [] }] } },
  };
}
