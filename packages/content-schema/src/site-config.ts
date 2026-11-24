import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { siteConfigSchemaId } from './product.js';

export const siteConfigSchema = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(1),
  siteId: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  api: z.object({
    deliveryBaseUrl: z.string().url(),
    managementBaseUrl: z.string().url().optional(),
  }),
  renderer: z.object({
    type: z.enum(['eds', 'json', 'custom']),
    runtime: z.enum(['tscms', 'adobe']).default('tscms'),
    compatibilityVersion: z.string().min(1),
  }),
  paths: z.object({
    blocks: z.string().default('./blocks'),
    scripts: z.string().default('./scripts'),
    styles: z.string().default('./styles'),
  }),
  authoring: z
    .object({
      componentsManifest: z.string().default('./dist/components.manifest.json'),
    })
    .default({}),
  fragments: z
    .object({
      delivery: z.enum(['resolve', 'eds-block']).default('resolve'),
    })
    .default({}),
  autoBlocks: z
    .array(
      z.object({
        type: z.enum(['video-link', 'fragment-link']),
        enabled: z.boolean(),
        pathIncludes: z.string().optional(),
      }),
    )
    .default([]),
  locales: z.array(z.string()).default(['pt-BR']),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

export function siteConfigJsonSchema(): Record<string, unknown> {
  return {
    $id: siteConfigSchemaId,
    ...zodToJsonSchema(siteConfigSchema, { name: 'TscmsSiteConfig', target: 'jsonSchema7' }),
  };
}
