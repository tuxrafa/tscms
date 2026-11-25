import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { blockManifests } from '@tscms/database';
import { manifestFromCatalog } from '@tscms/block-registry';
import { z } from 'zod';
import { ContentService } from './content.service.js';
import { AccessService } from './access.service.js';
import { ApiException, CurrentUser, parseInput, Public, type AuthUser } from './common.js';
import { DeliveryService } from './delivery.service.js';
import { ExperienceService } from './experience.service.js';
import { IdentityService } from './identity.service.js';
import { PlatformService } from './platform.service.js';
import { TenancyService } from './tenancy.service.js';
import { DatabaseService } from './database.service.js';

@ApiTags('identity')
@Controller('v1/management')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Public()
  @Post('auth/register')
  register(@Body() body: unknown) {
    return this.identity.register(body);
  }

  @Public()
  @Post('auth/login')
  login(@Body() body: unknown) {
    return this.identity.login(body);
  }

  @ApiBearerAuth()
  @Get('auth/me')
  me(@CurrentUser() user: AuthUser) {
    return this.identity.me(user);
  }

  @ApiBearerAuth()
  @Post('organizations/:organizationId/members')
  addMember(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Body() body: { email: string; role: string }) {
    return this.identity.addMember(user, organizationId, body.email, body.role);
  }
}

@ApiTags('tenancy')
@ApiBearerAuth()
@Controller('v1/management')
export class TenancyController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get('organizations')
  listOrganizations(@CurrentUser() user: AuthUser) {
    return this.tenancy.listOrganizations(user);
  }

  @Post('organizations/:organizationId/workspaces')
  createWorkspace(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Body() body: { name: string }) {
    return this.tenancy.createWorkspace(user, organizationId, body.name);
  }

  @Get('organizations/:organizationId/workspaces')
  listWorkspaces(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string) {
    return this.tenancy.listWorkspaces(user, organizationId);
  }

  @Post('organizations/:organizationId/workspaces/:workspaceId/sites')
  createSite(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.tenancy.createSite(user, organizationId, workspaceId, body);
  }

  @Get('sites')
  listSites(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.tenancy.listSites(user, organizationId);
  }

  @Get('sites/:siteId')
  getSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.tenancy.getSite(user, siteId);
  }

  @Patch('sites/:siteId')
  updateSite(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.tenancy.updateSiteConfig(user, siteId, body);
  }
}

@ApiTags('content')
@ApiBearerAuth()
@Controller('v1/management')
export class ContentController {
  constructor(
    private readonly content: ContentService,
    private readonly experience: ExperienceService,
    private readonly platform: PlatformService,
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  @Post('sites/:siteId/content-types')
  createType(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.content.createType(user, siteId, body);
  }

  @Get('sites/:siteId/content-types')
  listTypes(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.content.listTypes(user, siteId);
  }

  @Patch('sites/:siteId/content-types/:typeId')
  updateType(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('typeId') typeId: string, @Body() body: unknown) {
    return this.content.updateType(user, siteId, typeId, body);
  }

  @Post('sites/:siteId/content-types/:typeId/entries')
  createEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('typeId') typeId: string, @Body() body: unknown) {
    return this.content.createEntry(user, siteId, typeId, body);
  }

  @Get('sites/:siteId/content')
  listEntries(
    @CurrentUser() user: AuthUser,
    @Param('siteId') siteId: string,
    @Query('contentTypeId') contentTypeId?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.content.listEntries(user, siteId, {
      contentTypeId,
      q,
      limit: limit ? Number(limit) : 20,
      offset: offset ? Number(offset) : 0,
    });
  }

  @Get('sites/:siteId/content/:entryId')
  getEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('entryId') entryId: string) {
    return this.content.getEntry(user, siteId, entryId);
  }

  @Patch('sites/:siteId/content/:entryId')
  updateEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('entryId') entryId: string, @Body() body: unknown) {
    return this.content.updateEntry(user, siteId, entryId, body);
  }

  @Post('sites/:siteId/content/:entryId/publish')
  publishEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('entryId') entryId: string) {
    return this.content.publishEntry(user, siteId, entryId);
  }

  @Post('sites/:siteId/content/:entryId/unpublish')
  unpublishEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('entryId') entryId: string) {
    return this.content.unpublishEntry(user, siteId, entryId);
  }

  @Post('sites/:siteId/content/:entryId/rollback')
  rollbackEntry(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('entryId') entryId: string, @Body() body: { revisionId: string }) {
    return this.content.rollbackEntry(user, siteId, entryId, body.revisionId);
  }

  @Post('sites/:siteId/templates/blueprints')
  blueprints(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.experience.ensureBlueprints(user, siteId);
  }

  @Post('sites/:siteId/templates')
  createTemplate(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.createTemplate(user, siteId, body);
  }

  @Get('sites/:siteId/templates')
  listTemplates(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.experience.listTemplates(user, siteId);
  }

  @Post('sites/:siteId/templates/:templateId/publish')
  publishTemplate(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('templateId') templateId: string) {
    return this.experience.publishTemplate(user, siteId, templateId);
  }

  @Post('sites/:siteId/folders')
  createFolder(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.createFolder(user, siteId, body);
  }

  @Get('sites/:siteId/tree')
  tree(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Query('parentFolderId') parentFolderId?: string) {
    return this.experience.tree(user, siteId, parentFolderId);
  }

  @Get('sites/:siteId/pages')
  listPages(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.experience.listPages(user, siteId);
  }

  @Get('sites/:siteId/pages/:pageId')
  getPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string) {
    return this.experience.getPage(user, siteId, pageId);
  }

  @Post('sites/:siteId/pages')
  createPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.createPage(user, siteId, body);
  }

  @Patch('sites/:siteId/pages/:pageId')
  updatePage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string, @Body() body: unknown) {
    return this.experience.updatePage(user, siteId, pageId, body);
  }

  @Post('sites/:siteId/pages/:pageId/publish')
  publishPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string) {
    return this.experience.publishPage(user, siteId, pageId);
  }

  @Post('sites/:siteId/pages/:pageId/unpublish')
  unpublishPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string) {
    return this.experience.unpublishPage(user, siteId, pageId);
  }

  @Post('sites/:siteId/pages/:pageId/rollback')
  rollbackPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string, @Body() body: { revisionId: string }) {
    return this.experience.rollbackPage(user, siteId, pageId, body.revisionId);
  }

  @Post('sites/:siteId/pages/:pageId/move')
  movePage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string, @Body() body: { folderId: string | null }) {
    return this.experience.movePage(user, siteId, pageId, body.folderId);
  }

  @Post('sites/:siteId/pages/:pageId/copy')
  copyPage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string) {
    return this.experience.copyPage(user, siteId, pageId);
  }

  @Delete('sites/:siteId/pages/:pageId')
  deletePage(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pageId') pageId: string) {
    return this.experience.deletePage(user, siteId, pageId);
  }

  @Post('sites/:siteId/fragments')
  createFragment(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.createContentFragment(user, siteId, body);
  }

  @Get('sites/:siteId/fragments')
  listFragments(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.experience.listContentFragments(user, siteId);
  }

  @Post('sites/:siteId/fragments/:fragmentId/publish')
  publishFragment(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('fragmentId') fragmentId: string) {
    return this.experience.publishContentFragment(user, siteId, fragmentId);
  }

  @Post('sites/:siteId/experience-fragments')
  createExperience(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.createExperienceFragment(user, siteId, body);
  }

  @Get('sites/:siteId/experience-fragments')
  listExperience(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.experience.listExperienceFragments(user, siteId);
  }

  @Post('sites/:siteId/experience-fragments/:fragmentId/publish')
  publishExperience(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('fragmentId') fragmentId: string) {
    return this.experience.publishExperienceFragment(user, siteId, fragmentId);
  }

  @Post('sites/:siteId/experience-fragments/from-selection')
  saveSelection(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.experience.saveSelectionAsFragment(user, siteId, body);
  }

  @Post('sites/:siteId/polls')
  createPoll(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.platform.createPoll(user, siteId, body);
  }

  @Get('sites/:siteId/polls')
  listPolls(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.platform.listPolls(user, siteId);
  }

  @Post('sites/:siteId/polls/:pollId/publish')
  publishPoll(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pollId') pollId: string) {
    return this.platform.publishPoll(user, siteId, pollId);
  }

  @Get('sites/:siteId/polls/:pollId/votes.csv')
  async exportVotes(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Param('pollId') pollId: string, @Res() reply: FastifyReply) {
    const csv = await this.platform.exportVotes(user, siteId, pollId);
    reply.header('content-type', 'text/csv; charset=utf-8');
    return reply.send(csv);
  }

  @Post('sites/:siteId/feeds')
  createFeed(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.platform.createFeed(user, siteId, body);
  }

  @Post('sites/:siteId/feeds/import')
  importFeed(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.platform.importFeed(user, siteId, body);
  }

  @Get('sites/:siteId/media')
  listMedia(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string) {
    return this.platform.listAssets(user, siteId);
  }

  @Post('sites/:siteId/media')
  async upload(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Req() request: FastifyRequest) {
    const file = await (request as FastifyRequest & { file: () => Promise<{ filename: string; mimetype: string; toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!file) throw new ApiException(400, 'validation_error', 'Arquivo ausente.');
    const buffer = await file.toBuffer();
    return this.platform.saveAsset(user, siteId, { filename: file.filename, mimetype: file.mimetype, buffer });
  }

  @Post('sites/:siteId/redirects')
  createRedirect(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    return this.platform.createRedirect(user, siteId, body);
  }

  @Post('organizations/:organizationId/webhooks')
  createWebhook(@CurrentUser() user: AuthUser, @Param('organizationId') organizationId: string, @Body() body: unknown) {
    return this.platform.createWebhook(user, organizationId, body);
  }

  @Post('sites/:siteId/manifests')
  async publishManifest(@CurrentUser() user: AuthUser, @Param('siteId') siteId: string, @Body() body: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'site:manage');
    const manifest = parseInput(z.object({ version: z.string(), manifest: z.record(z.unknown()) }), body);
    const [saved] = await this.database.db
      .insert(blockManifests)
      .values({ siteId: site.id, version: manifest.version, manifest: manifest.manifest })
      .returning();
    return saved;
  }

  @Get('components')
  components() {
    return manifestFromCatalog('catalog');
  }
}

@ApiTags('delivery')
@Controller('v1/delivery')
export class DeliveryController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly files: PlatformService,
  ) {}

  @Public()
  @Get('sites/:siteKey/pages/by-path')
  async page(
    @Param('siteKey') siteKey: string,
    @Query('path') path: string,
    @Query('format') format: 'json' | 'html' | 'plain' = 'json',
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.delivery.pageByPath(siteKey, path, format ?? 'json');
    if ('redirect' in result && result.redirect) {
      reply.status(result.redirect.statusCode);
      reply.header('location', result.redirect.toPath);
      return { redirect: result.redirect };
    }
    if ('etag' in result && result.etag) {
      reply.header('etag', result.etag);
      reply.header('cache-control', 'public, max-age=60');
      if (ifNoneMatch === result.etag) {
        reply.status(304);
        return '';
      }
    }
    if (format === 'html' || format === 'plain') {
      reply.header('content-type', 'text/html; charset=utf-8');
      return 'html' in result ? result.html : result;
    }
    return result;
  }

  @Public()
  @Get('sites/:siteKey/content/:id')
  content(@Param('siteKey') siteKey: string, @Param('id') id: string) {
    return this.delivery.contentById(siteKey, id);
  }

  @Public()
  @Get('sites/:siteKey/collections/:name')
  collection(
    @Param('siteKey') siteKey: string,
    @Param('name') name: string,
    @Query('locale') locale?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.delivery.collection(siteKey, name, { locale, limit: limit ? Number(limit) : undefined, offset: offset ? Number(offset) : undefined });
  }

  @Public()
  @Get('sites/:siteKey/fragments/:id')
  fragment(@Param('siteKey') siteKey: string, @Param('id') id: string) {
    return this.delivery.fragment(siteKey, id);
  }

  @Public()
  @Get('sites/:siteKey/search')
  search(@Param('siteKey') siteKey: string, @Query('q') q = '', @Query('locale') locale?: string) {
    return this.delivery.search(siteKey, q, locale);
  }

  @Public()
  @Get('sites/:siteKey/media/:id')
  media(@Param('siteKey') siteKey: string, @Param('id') id: string) {
    return this.delivery.media(siteKey, id);
  }

  @Public()
  @Get('sites/:siteKey/media/:id/file')
  async mediaFile(
    @Param('siteKey') siteKey: string,
    @Param('id') id: string,
    @Query('width') width: string | undefined,
    @Res() reply: FastifyReply,
    @Req() request: FastifyRequest,
  ) {
    const file = await this.platformFile(siteKey, id, width, request);
    reply.header('content-type', file.contentType);
    reply.header('cache-control', 'public, max-age=300');
    return reply.send(file.body);
  }

  @Public()
  @Get('sites/:siteKey/feed.xml')
  async feed(@Param('siteKey') siteKey: string, @Res() reply: FastifyReply) {
    const xml = await this.delivery.feed(siteKey, 'feed');
    reply.header('content-type', 'application/rss+xml; charset=utf-8');
    return reply.send(xml);
  }

  @Public()
  @Get('sites/:siteKey/sitemap.xml')
  async sitemap(@Param('siteKey') siteKey: string, @Res() reply: FastifyReply) {
    reply.header('content-type', 'application/xml; charset=utf-8');
    return reply.send(await this.delivery.sitemap(siteKey));
  }

  @Public()
  @Get('sites/:siteKey/robots.txt')
  async robots(@Param('siteKey') siteKey: string, @Res() reply: FastifyReply) {
    reply.header('content-type', 'text/plain; charset=utf-8');
    return reply.send(await this.delivery.robots(siteKey));
  }

  @Public()
  @Get('sites/:siteKey/embed/fragments/:id')
  async embed(@Param('siteKey') siteKey: string, @Param('id') id: string, @Res() reply: FastifyReply) {
    const fragment = await this.delivery.fragment(siteKey, id);
    reply.header('content-security-policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'");
    reply.header('content-type', 'text/html; charset=utf-8');
    const title = 'title' in fragment && typeof fragment.title === 'string' ? fragment.title : 'Fragmento';
    return reply.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${title}</title></head><body><main><p>${title}</p></main></body></html>`);
  }

  private platformFile(siteKey: string, id: string, width: string | undefined, _request: FastifyRequest) {
    return this.files.readAsset(siteKey, id, width ? Number(width) : undefined);
  }
}

@ApiTags('public')
@Controller('v1/public')
export class PublicController {
  constructor(private readonly platform: PlatformService) {}

  @Public()
  @Get('polls/:id')
  poll(@Param('id') id: string) {
    return this.platform.publicPoll(id);
  }

  @Public()
  @Post('polls/:id/votes')
  vote(@Param('id') id: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    return this.platform.vote(id, body, request.ip);
  }

  @Public()
  @Get('polls/:id/results')
  results(@Param('id') id: string) {
    return this.platform.results(id, false);
  }

  @Public()
  @Post('sites/:siteKey/forms/:formKey')
  form(@Param('siteKey') siteKey: string, @Param('formKey') formKey: string, @Body() body: unknown, @Req() request: FastifyRequest) {
    return this.platform.submitForm(siteKey, formKey, body, request.ip);
  }
}

@Controller()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', product: 'tscms' };
  }

  @Public()
  @Get('ready')
  async ready() {
    await this.database.pool.query('select 1');
    return { status: 'ready' };
  }
}
