import { z } from 'zod';
import { contentTypeSchema, editorialStatuses } from '@tscms/content-schema';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().optional(),
  sort: z.enum(['updated_at', 'title', 'path']).default('updated_at'),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(200),
  organizationName: z.string().min(2).max(160),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const workspaceSchema = z.object({ name: z.string().min(2).max(160) });

export const siteCreateSchema = z.object({
  name: z.string().min(2).max(160),
  key: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  locales: z.array(z.string()).min(1).default(['pt-BR']),
  domains: z.array(z.string()).default([]),
});

export const contentTypeCreateSchema = contentTypeSchema.omit({ version: true });

export const entryWriteSchema = z.object({
  locale: z.string().default('pt-BR'),
  slug: z.string().min(1).optional(),
  data: z.record(z.unknown()),
  expectedVersion: z.number().int().positive().optional(),
  status: z.enum(editorialStatuses).optional(),
});

export const deliveryContentSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  locale: z.string(),
  slug: z.string(),
  revisionId: z.string().uuid(),
  data: z.record(z.unknown()),
});

export type DeliveryContent = z.infer<typeof deliveryContentSchema>;

export const managementPaths = [
  '/v1/management/auth/register',
  '/v1/management/auth/login',
  '/v1/management/auth/me',
  '/v1/management/organizations',
  '/v1/management/sites',
  '/v1/management/content-types',
  '/v1/management/content',
  '/v1/management/pages',
  '/v1/management/templates',
  '/v1/management/fragments',
  '/v1/management/experience-fragments',
  '/v1/management/media',
  '/v1/management/polls',
  '/v1/management/feeds',
] as const;

export const deliveryPaths = [
  '/v1/delivery/sites/{siteKey}/pages/by-path',
  '/v1/delivery/sites/{siteKey}/content/{id}',
  '/v1/delivery/sites/{siteKey}/fragments/{id}',
  '/v1/delivery/sites/{siteKey}/collections/{name}',
  '/v1/delivery/sites/{siteKey}/media/{id}',
  '/v1/delivery/sites/{siteKey}/search',
] as const;
