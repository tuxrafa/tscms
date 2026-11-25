import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { CanonicalDocument, ContentTypeDefinition, EditableTemplate } from '@tscms/content-schema';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  locale: text('locale').notNull().default('pt-BR'),
  ...timestamps,
}, (table) => [uniqueIndex('users_email_unique').on(table.email)]);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ...timestamps,
}, (table) => [uniqueIndex('organizations_slug_unique').on(table.slug)]);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  ...timestamps,
}, (table) => [uniqueIndex('workspaces_org_slug_unique').on(table.organizationId, table.slug)]);

export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull(),
  system: boolean('system').notNull().default(false),
}, (table) => [uniqueIndex('roles_org_key_unique').on(table.organizationId, table.key)]);

export const memberships = pgTable('memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  role: text('role').notNull(),
  siteIds: jsonb('site_ids').$type<string[] | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('memberships_org_user_unique').on(table.organizationId, table.userId)]);

export const apiClients = pgTable('api_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  name: text('name').notNull(),
  tokenHash: text('token_hash').notNull(),
  scopes: jsonb('scopes').$type<string[]>().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  locales: jsonb('locales').$type<string[]>().notNull().default(['pt-BR']),
  domains: jsonb('domains').$type<string[]>().notNull().default([]),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  rendererType: text('renderer_type').notNull().default('eds'),
  rendererVersion: text('renderer_version').notNull().default('1'),
  siteBuildVersion: text('site_build_version'),
  designSystemVersion: text('design_system_version'),
  compatibilityStatus: text('compatibility_status').notNull().default('unknown'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('sites_key_unique').on(table.key)]);

export const siteEnvironments = pgTable('site_environments', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  previewUrl: text('preview_url'),
  productionUrl: text('production_url'),
  ...timestamps,
}, (table) => [uniqueIndex('site_environments_unique').on(table.siteId, table.name)]);

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  path: text('path').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [index('folders_site_parent_idx').on(table.siteId, table.parentId)]);

export const contentTypes = pgTable('content_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  label: text('label').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  definition: jsonb('definition').$type<ContentTypeDefinition>().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('content_types_site_name_unique').on(table.siteId, table.name)]);

export const contentTypeVersions = pgTable('content_type_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentTypeId: uuid('content_type_id').notNull().references(() => contentTypes.id),
  version: integer('version').notNull(),
  definition: jsonb('definition').$type<ContentTypeDefinition>().notNull(),
  breaking: boolean('breaking').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('content_type_versions_unique').on(table.contentTypeId, table.version)]);

export const contentEntries = pgTable('content_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  contentTypeId: uuid('content_type_id').notNull().references(() => contentTypes.id),
  localizationGroupId: uuid('localization_group_id').notNull().defaultRandom(),
  locale: text('locale').notNull().default('pt-BR'),
  slug: text('slug').notNull(),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  publishedRevisionId: uuid('published_revision_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('content_entries_slug_unique').on(table.siteId, table.contentTypeId, table.locale, table.slug),
  index('content_entries_status_idx').on(table.siteId, table.status),
]);

export const contentRevisions = pgTable('content_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  entryId: uuid('entry_id').notNull().references(() => contentEntries.id),
  version: integer('version').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const templates = pgTable('templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  locale: text('locale').notNull().default('pt-BR'),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  definition: jsonb('definition').$type<EditableTemplate>().notNull(),
  publishedRevisionId: uuid('published_revision_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('templates_site_key_unique').on(table.siteId, table.key)]);

export const templateRevisions = pgTable('template_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  templateId: uuid('template_id').notNull().references(() => templates.id),
  version: integer('version').notNull(),
  definition: jsonb('definition').$type<EditableTemplate>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pages = pgTable('pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  folderId: uuid('folder_id').references(() => folders.id),
  parentId: uuid('parent_id'),
  templateId: uuid('template_id').references(() => templates.id),
  locale: text('locale').notNull().default('pt-BR'),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  path: text('path').notNull(),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  document: jsonb('document').$type<CanonicalDocument>().notNull(),
  publishedRevisionId: uuid('published_revision_id'),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('pages_site_path_locale_unique').on(table.siteId, table.locale, table.path),
  index('pages_site_folder_idx').on(table.siteId, table.folderId),
]);

export const pageRevisions = pgTable('page_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pageId: uuid('page_id').notNull().references(() => pages.id),
  version: integer('version').notNull(),
  document: jsonb('document').$type<CanonicalDocument>().notNull(),
  templateRevisionId: uuid('template_revision_id'),
  dependencies: jsonb('dependencies').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contentFragments = pgTable('content_fragments', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  contentTypeId: uuid('content_type_id').references(() => contentTypes.id),
  locale: text('locale').notNull().default('pt-BR'),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  publishedRevisionId: uuid('published_revision_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('content_fragments_slug_unique').on(table.siteId, table.locale, table.slug)]);

export const contentFragmentRevisions = pgTable('content_fragment_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fragmentId: uuid('fragment_id').notNull().references(() => contentFragments.id),
  version: integer('version').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const experienceFragments = pgTable('experience_fragments', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  locale: text('locale').notNull().default('pt-BR'),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  path: text('path').notNull(),
  variation: text('variation').notNull().default('default'),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  document: jsonb('document').$type<CanonicalDocument>().notNull(),
  publishedRevisionId: uuid('published_revision_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('experience_fragments_path_unique').on(table.siteId, table.locale, table.path, table.variation)]);

export const experienceFragmentRevisions = pgTable('experience_fragment_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  fragmentId: uuid('fragment_id').notNull().references(() => experienceFragments.id),
  version: integer('version').notNull(),
  document: jsonb('document').$type<CanonicalDocument>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fragmentVariations = pgTable('fragment_variations', {
  id: uuid('id').primaryKey().defaultRandom(),
  fragmentId: uuid('fragment_id').notNull().references(() => experienceFragments.id),
  key: text('key').notNull(),
  document: jsonb('document').$type<CanonicalDocument>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('fragment_variations_unique').on(table.fragmentId, table.key)]);

export const assetFolders = pgTable('asset_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  path: text('path').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [uniqueIndex('asset_folders_site_path_unique').on(table.siteId, table.path)]);

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  folderId: uuid('folder_id').references(() => assetFolders.id),
  folder: text('folder').notNull().default('/'),
  filename: text('filename').notNull(),
  title: text('title'),
  description: text('description').notNull().default(''),
  contentType: text('content_type').notNull(),
  mediaType: text('media_type').notNull().default('file'),
  byteSize: integer('byte_size').notNull(),
  storageKey: text('storage_key').notNull(),
  checksum: text('checksum'),
  width: integer('width'),
  height: integer('height'),
  alt: text('alt'),
  copyright: text('copyright'),
  focalPoint: jsonb('focal_point').$type<{ x: number; y: number } | null>(),
  tags: jsonb('tags').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('ready'),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').references(() => users.id),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [index('assets_site_checksum_idx').on(table.siteId, table.checksum)]);

export const assetVersions = pgTable('asset_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  version: integer('version').notNull(),
  storageKey: text('storage_key').notNull(),
  contentType: text('content_type').notNull(),
  checksum: text('checksum').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('asset_versions_asset_version_unique').on(table.assetId, table.version)]);

export const assetVariants = pgTable('asset_variants', {
  id: uuid('id').primaryKey().defaultRandom(),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
  versionId: uuid('version_id').references(() => assetVersions.id),
  preset: text('preset'),
  width: integer('width').notNull(),
  height: integer('height'),
  format: text('format').notNull(),
  storageKey: text('storage_key').notNull(),
  byteSize: integer('byte_size').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assetCollections = pgTable('asset_collections', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  ...timestamps,
});

export const assetCollectionItems = pgTable('asset_collection_items', {
  collectionId: uuid('collection_id').notNull().references(() => assetCollections.id),
  assetId: uuid('asset_id').notNull().references(() => assets.id),
}, (table) => [primaryKey({ columns: [table.collectionId, table.assetId] })]);

export const contentReferences = pgTable('content_references', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  fromType: text('from_type').notNull(),
  fromId: uuid('from_id').notNull(),
  toType: text('to_type').notNull(),
  toId: uuid('to_id').notNull(),
  relation: text('relation').notNull(),
}, (table) => [index('content_references_to_idx').on(table.toType, table.toId)]);

export const publishingReleases = pgTable('publishing_releases', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  action: text('action').notNull(),
  status: text('status').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
});

export const releaseDependencies = pgTable('release_dependencies', {
  releaseId: uuid('release_id').notNull().references(() => publishingReleases.id),
  dependencyType: text('dependency_type').notNull(),
  dependencyId: text('dependency_id').notNull(),
}, (table) => [primaryKey({ columns: [table.releaseId, table.dependencyType, table.dependencyId] })]);

export const publishingJobs = pgTable('publishing_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  releaseId: uuid('release_id').references(() => publishingReleases.id),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('pending'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  parentId: uuid('parent_id'),
}, (table) => [uniqueIndex('categories_site_slug_unique').on(table.siteId, table.slug)]);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
}, (table) => [uniqueIndex('tags_site_slug_unique').on(table.siteId, table.slug)]);

export const entryTaxonomies = pgTable('entry_taxonomies', {
  entryId: uuid('entry_id').notNull().references(() => contentEntries.id),
  taxonomyType: text('taxonomy_type').notNull(),
  taxonomyId: uuid('taxonomy_id').notNull(),
}, (table) => [primaryKey({ columns: [table.entryId, table.taxonomyType, table.taxonomyId] })]);

export const redirects = pgTable('redirects', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  fromPath: text('from_path').notNull(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').notNull().default(301),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('redirects_site_from_unique').on(table.siteId, table.fromPath)]);

export const polls = pgTable('polls', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  title: text('title').notNull(),
  question: text('question').notNull(),
  description: text('description'),
  options: jsonb('options').$type<Array<{ id: string; label: string }>>().notNull(),
  selection: text('selection').notNull().default('single'),
  minChoices: integer('min_choices').notNull().default(1),
  maxChoices: integer('max_choices').notNull().default(1),
  visibility: text('visibility').notNull().default('after_vote'),
  status: text('status').notNull().default('draft'),
  opensAt: timestamp('opens_at', { withTimezone: true }),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  closedManually: boolean('closed_manually').notNull().default(false),
  version: integer('version').notNull().default(1),
  publishedRevisionId: uuid('published_revision_id'),
  ...timestamps,
});

export const pollRevisions = pgTable('poll_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id').notNull().references(() => polls.id),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pollVotes = pgTable('poll_votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  pollId: uuid('poll_id').notNull().references(() => polls.id),
  choices: jsonb('choices').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('poll_votes_poll_idx').on(table.pollId)]);

export const rssFeeds = pgTable('rss_feeds', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  language: text('language').notNull().default('pt-BR'),
  contentTypeNames: jsonb('content_type_names').$type<string[]>().notNull().default(['article']),
  categorySlug: text('category_slug'),
  tagSlug: text('tag_slug'),
  limit: integer('limit').notNull().default(20),
  fullContent: boolean('full_content').notNull().default(false),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
}, (table) => [uniqueIndex('rss_feeds_site_slug_unique').on(table.siteId, table.slug)]);

export const rssSources = pgTable('rss_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  url: text('url').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
  ...timestamps,
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull(),
  siteId: uuid('site_id'),
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('audit_events_org_idx').on(table.organizationId, table.createdAt)]);

export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id),
  siteId: uuid('site_id').references(() => sites.id),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').notNull().references(() => webhookEndpoints.id),
  event: text('event').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const formSubmissions = pgTable('form_submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  formKey: text('form_key').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('form_submissions_site_idx').on(table.siteId, table.formKey)]);

export const searchDocuments = pgTable('search_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  locale: text('locale').notNull(),
  kind: text('kind').notNull(),
  refId: uuid('ref_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  slug: text('slug'),
  status: text('status').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('search_documents_ref_unique').on(table.siteId, table.kind, table.refId)]);

export const blockManifests = pgTable('block_manifests', {
  id: uuid('id').primaryKey().defaultRandom(),
  siteId: uuid('site_id').notNull().references(() => sites.id),
  version: text('version').notNull(),
  manifest: jsonb('manifest').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('block_manifests_site_idx').on(table.siteId, table.createdAt)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: text('key').primaryKey(),
  siteId: uuid('site_id'),
  response: jsonb('response').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const searchVectorSql = sql`to_tsvector('simple', title || ' ' || body)`;
