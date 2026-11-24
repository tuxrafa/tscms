import { z } from 'zod';

export const fieldTypes = [
  'text',
  'richtext',
  'integer',
  'decimal',
  'boolean',
  'date',
  'datetime',
  'enum',
  'url',
  'email',
  'media',
  'reference',
  'multiReference',
  'object',
  'array',
  'json',
  'localized',
] as const;

export type FieldType = (typeof fieldTypes)[number];

export interface FieldDefinition {
  name: string;
  label?: string;
  type: FieldType;
  required?: boolean;
  localized?: boolean;
  target?: string;
  enumValues?: string[];
  fields?: FieldDefinition[];
  items?: FieldDefinition;
  of?: FieldDefinition;
}

export const fieldDefinitionSchema: z.ZodType<FieldDefinition> = z.lazy(() =>
  z.object({
    name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/),
    label: z.string().min(1).optional(),
    type: z.enum(fieldTypes),
    required: z.boolean().optional(),
    localized: z.boolean().optional(),
    target: z.string().min(1).optional(),
    enumValues: z.array(z.string().min(1)).optional(),
    fields: z.array(fieldDefinitionSchema).optional(),
    items: fieldDefinitionSchema.optional(),
    of: fieldDefinitionSchema.optional(),
  }),
);

export const contentTypeSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  label: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  version: z.number().int().positive(),
  fields: z.array(fieldDefinitionSchema).min(1),
});

export type ContentTypeDefinition = z.infer<typeof contentTypeSchema>;

export const richInlineSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
    marks: z.array(z.enum(['strong', 'em', 'code'])).optional(),
  }),
  z.object({
    type: z.literal('link'),
    href: z.string().min(1),
    text: z.string(),
  }),
]);

export const richBlockSchema = z.union([
  z.object({
    type: z.literal('paragraph'),
    children: z.array(richInlineSchema),
  }),
  z.object({
    type: z.literal('heading'),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
    children: z.array(richInlineSchema),
  }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean(),
    items: z.array(z.array(richInlineSchema)),
  }),
  z.object({
    type: z.literal('blockquote'),
    children: z.array(richInlineSchema),
  }),
]);

export const richTextSchema = z.object({
  type: z.literal('doc'),
  content: z.array(richBlockSchema),
});

export type RichTextDocument = z.infer<typeof richTextSchema>;

export const editorialStatuses = ['draft', 'in_review', 'published', 'archived', 'scheduled'] as const;
export type EditorialStatus = (typeof editorialStatuses)[number];
