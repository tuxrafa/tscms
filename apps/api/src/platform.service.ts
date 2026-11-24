import { Injectable } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { assets, assetVariants, formSubmissions, polls, pollRevisions, pollVotes, redirects, rssFeeds, rssSources, webhookDeliveries, webhookEndpoints } from '@tscms/database';
import { assertChoices, assertPollOpen, canSeeResults, randomToken, type PollRules } from '@tscms/core-domain';
import { assertUpload, createImageVariants } from '@tscms/media';
import { fetchExternalFeed, parseRss, postSignedWebhook } from '@tscms/publishing';
import { z } from 'zod';
import { AccessService } from './access.service.js';
import { ApiException, parseInput, type AuthUser } from './common.js';
import { DatabaseService } from './database.service.js';

const voteBuckets = new Map<string, { count: number; reset: number }>();

@Injectable()
export class PlatformService {
  constructor(
    private readonly database: DatabaseService,
    private readonly access: AccessService,
  ) {}

  async createPoll(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'poll:manage');
    const body = parseInput(
      z.object({
        title: z.string().min(1),
        question: z.string().min(1),
        description: z.string().optional(),
        options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).min(2),
        selection: z.enum(['single', 'multiple']).default('single'),
        minChoices: z.number().int().positive().default(1),
        maxChoices: z.number().int().positive().default(1),
        visibility: z.enum(['always', 'after_vote', 'after_close', 'hidden']).default('after_vote'),
        opensAt: z.string().datetime().optional(),
        closesAt: z.string().datetime().optional(),
      }),
      input,
    );
    const [poll] = await this.database.db
      .insert(polls)
      .values({
        siteId,
        title: body.title,
        question: body.question,
        description: body.description,
        options: body.options,
        selection: body.selection,
        minChoices: body.minChoices,
        maxChoices: body.maxChoices,
        visibility: body.visibility,
        opensAt: body.opensAt ? new Date(body.opensAt) : null,
        closesAt: body.closesAt ? new Date(body.closesAt) : null,
      })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'poll.created',
      entityType: 'poll',
      entityId: poll?.id ?? '',
    });
    return poll;
  }

  async publishPoll(user: AuthUser, siteId: string, pollId: string) {
    const site = await this.access.requireSite(user.id, siteId, 'content:publish');
    const [current] = await this.database.db.select().from(polls).where(and(eq(polls.id, pollId), eq(polls.siteId, siteId))).limit(1);
    if (!current) throw new ApiException(404, 'not_found', 'Enquete não encontrada.');
    const [revision] = await this.database.db
      .insert(pollRevisions)
      .values({
        pollId,
        version: current.version,
        snapshot: { title: current.title, question: current.question, options: current.options, visibility: current.visibility },
      })
      .returning();
    const [updated] = await this.database.db
      .update(polls)
      .set({ status: 'published', publishedRevisionId: revision?.id, updatedAt: new Date() })
      .where(eq(polls.id, pollId))
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'poll.published',
      entityType: 'poll',
      entityId: pollId,
    });
    return updated;
  }

  async listPolls(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(polls).where(eq(polls.siteId, siteId)) };
  }

  async publicPoll(id: string) {
    const poll = await this.mustPublishedPoll(id);
    return {
      id: poll.id,
      question: poll.question,
      description: poll.description,
      options: poll.options,
      selection: poll.selection,
      opensAt: poll.opensAt,
      closesAt: poll.closesAt,
      visibility: poll.visibility,
      notice: 'A versão inicial permite votos repetidos e não assegura uma pessoa por voto.',
    };
  }

  async vote(id: string, input: unknown, ip: string) {
    this.limit(`vote:${ip}`, 30);
    const body = parseInput(z.object({ choices: z.array(z.string().min(1)).min(1) }), input);
    return this.database.db.transaction(async (tx) => {
      const [poll] = await tx.select().from(polls).where(eq(polls.id, id)).for('update');
      if (!poll || poll.status !== 'published') throw new ApiException(404, 'not_found', 'Enquete não encontrada.');
      const rules = this.rules(poll);
      try {
        assertPollOpen(rules);
        assertChoices(rules, body.choices, poll.options.map((option) => option.id));
      } catch (error) {
        throw new ApiException(400, 'invalid_vote', error instanceof Error ? error.message : 'Voto inválido.');
      }
      await tx.insert(pollVotes).values({ pollId: id, choices: body.choices });
      const results = canSeeResults({ visibility: poll.visibility as PollRules['visibility'], hasVoted: true, closed: false, management: false })
        ? await this.countVotes(id, tx)
        : undefined;
      return { accepted: true, results };
    });
  }

  async results(id: string, management: boolean) {
    const poll = await this.mustPublishedPoll(id);
    const closed = poll.closedManually || (poll.closesAt ? poll.closesAt.getTime() < Date.now() : false);
    if (!canSeeResults({ visibility: poll.visibility as PollRules['visibility'], hasVoted: false, closed, management })) {
      throw new ApiException(403, 'hidden', 'Os resultados desta enquete não estão disponíveis.');
    }
    return { id, results: await this.countVotes(id, this.database.db) };
  }

  async exportVotes(user: AuthUser, siteId: string, pollId: string) {
    await this.access.requireSite(user.id, siteId, 'poll:manage');
    const votes = await this.database.db.select().from(pollVotes).where(eq(pollVotes.pollId, pollId));
    const lines = ['id,created_at,choices', ...votes.map((vote) => `${vote.id},${vote.createdAt.toISOString()},"${vote.choices.join('|')}"`)];
    return lines.join('\n');
  }

  async submitForm(siteKey: string, formKey: string, input: unknown, ip: string) {
    this.limit(`form:${ip}:${formKey}`, 20);
    const site = await this.siteByKey(siteKey);
    const body = parseInput(z.record(z.union([z.string().max(5000), z.number(), z.boolean()])), input);
    if (JSON.stringify(body).length > 20_000) throw new ApiException(413, 'payload_too_large', 'Envio excede o limite.');
    const [saved] = await this.database.db.insert(formSubmissions).values({ siteId: site.id, formKey, payload: body }).returning();
    return { id: saved?.id, accepted: true };
  }

  async createFeed(user: AuthUser, siteId: string, input: unknown) {
    const site = await this.access.requireSite(user.id, siteId, 'settings:manage');
    const body = parseInput(
      z.object({
        slug: z.string().default('feed'),
        title: z.string(),
        description: z.string().default(''),
        language: z.string().default('pt-BR'),
        contentTypeNames: z.array(z.string()).default(['article']),
        limit: z.number().int().positive().max(100).default(20),
        fullContent: z.boolean().default(false),
      }),
      input,
    );
    const [feed] = await this.database.db
      .insert(rssFeeds)
      .values({
        siteId,
        slug: body.slug ?? 'feed',
        title: body.title,
        description: body.description ?? '',
        language: body.language ?? 'pt-BR',
        contentTypeNames: body.contentTypeNames ?? ['article'],
        limit: body.limit ?? 20,
        fullContent: body.fullContent ?? false,
      })
      .returning();
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'rss.configured',
      entityType: 'rss_feed',
      entityId: feed?.id ?? '',
    });
    return feed;
  }

  async importFeed(user: AuthUser, siteId: string, input: unknown) {
    await this.access.requireSite(user.id, siteId, 'content:write');
    const body = parseInput(z.object({ url: z.string().url(), name: z.string() }), input);
    const xml = await fetchExternalFeed(body.url);
    const items = parseRss(xml);
    const [source] = await this.database.db
      .insert(rssSources)
      .values({ siteId, url: body.url, name: body.name, lastFetchedAt: new Date() })
      .returning();
    return {
      source,
      drafts: items.map((item) => ({
        status: 'draft',
        title: item.title,
        link: item.link,
        summary: item.summary,
        notice: 'Conteúdo importado como rascunho. Não republicar material protegido sem autorização.',
      })),
    };
  }

  async saveAsset(user: AuthUser, siteId: string, file: { filename: string; mimetype: string; buffer: Buffer }) {
    const site = await this.access.requireSite(user.id, siteId, 'media:manage');
    assertUpload(file.mimetype, file.buffer.length);
    const safeName = path.basename(file.filename).replace(/[^a-zA-Z0-9._-]/g, '-');
    const [asset] = await this.database.db
      .insert(assets)
      .values({
        siteId,
        filename: safeName,
        contentType: file.mimetype,
        byteSize: file.buffer.length,
        storageKey: 'pending',
      })
      .returning();
    if (!asset) throw new ApiException(500, 'internal', 'Falha ao registrar a mídia.');
    const key = path.join(siteId, asset.id, `original-${safeName}`);
    await this.writeBlob(key, file.buffer);
    const [updated] = await this.database.db.update(assets).set({ storageKey: key }).where(eq(assets.id, asset.id)).returning();
    if (file.mimetype.startsWith('image/')) {
      try {
        const variants = await createImageVariants(file.buffer);
        for (const variant of variants) {
          const variantKey = path.join(siteId, asset.id, `w${variant.width}.webp`);
          await this.writeBlob(variantKey, variant.body);
          await this.database.db.insert(assetVariants).values({
            assetId: asset.id,
            width: variant.width,
            format: variant.format,
            storageKey: variantKey,
            byteSize: variant.body.length,
          });
        }
      } catch {
        // A variante é assíncrona em espírito: o original permanece disponível se o processamento falhar.
      }
    }
    await this.access.audit(this.database.db, {
      organizationId: site.organizationId,
      siteId,
      actorId: user.id,
      action: 'asset.created',
      entityType: 'asset',
      entityId: asset.id,
    });
    return updated;
  }

  async readAsset(siteKey: string, assetId: string, width?: number) {
    const site = await this.siteByKey(siteKey);
    const [asset] = await this.database.db.select().from(assets).where(and(eq(assets.id, assetId), eq(assets.siteId, site.id))).limit(1);
    if (!asset) throw new ApiException(404, 'not_found', 'Mídia não encontrada.');
    if (width) {
      const [variant] = await this.database.db.select().from(assetVariants).where(and(eq(assetVariants.assetId, assetId), eq(assetVariants.width, width))).limit(1);
      if (variant) {
        return { contentType: 'image/webp', body: await readFile(this.absolute(variant.storageKey)) };
      }
    }
    return { contentType: asset.contentType, body: await readFile(this.absolute(asset.storageKey)) };
  }

  async listAssets(user: AuthUser, siteId: string) {
    await this.access.requireSite(user.id, siteId, 'content:read');
    return { data: await this.database.db.select().from(assets).where(eq(assets.siteId, siteId)) };
  }

  async createWebhook(user: AuthUser, organizationId: string, input: unknown) {
    const siteContext = await this.access.requireOrg(user.id, organizationId, 'settings:manage');
    void siteContext;
    const body = parseInput(
      z.object({
        url: z.string().url(),
        events: z.array(z.string()).min(1),
        siteId: z.string().uuid().optional(),
      }),
      input,
    );
    const secret = randomToken(24);
    const [endpoint] = await this.database.db
      .insert(webhookEndpoints)
      .values({ organizationId, siteId: body.siteId, url: body.url, events: body.events, secret })
      .returning();
    return { endpoint: { ...endpoint, secret: undefined }, secret };
  }

  async dispatchEvent(organizationId: string, event: string, payload: Record<string, unknown>) {
    const endpoints = await this.database.db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.organizationId, organizationId), eq(webhookEndpoints.enabled, true)));
    for (const endpoint of endpoints) {
      if (!endpoint.events.includes(event) && !endpoint.events.includes('*')) continue;
      const body = JSON.stringify({ id: randomToken(8), event, payload });
      const [delivery] = await this.database.db
        .insert(webhookDeliveries)
        .values({ endpointId: endpoint.id, event, payload: { body }, status: 'pending' })
        .returning();
      try {
        await postSignedWebhook({ url: endpoint.url, secret: endpoint.secret, event, body });
        await this.database.db.update(webhookDeliveries).set({ status: 'delivered', attempts: 1, updatedAt: new Date() }).where(eq(webhookDeliveries.id, delivery!.id));
      } catch (error) {
        await this.database.db
          .update(webhookDeliveries)
          .set({ status: 'retry', attempts: 1, lastError: error instanceof Error ? error.message : 'falha', updatedAt: new Date() })
          .where(eq(webhookDeliveries.id, delivery!.id));
      }
    }
  }

  async createRedirect(user: AuthUser, siteId: string, input: unknown) {
    await this.access.requireSite(user.id, siteId, 'settings:manage');
    const body = parseInput(z.object({ fromPath: z.string().startsWith('/'), toPath: z.string().min(1), statusCode: z.union([z.literal(301), z.literal(302)]).default(301) }), input);
    const [redirect] = await this.database.db.insert(redirects).values({ siteId, ...body }).returning();
    return redirect;
  }

  private async countVotes(pollId: string, db: { execute: DatabaseService['db']['execute'] }) {
    const result = await db.execute<{ choice: string; votes: number }>(sql`
      select choice, count(*)::int as votes
      from poll_votes
      cross join lateral jsonb_array_elements_text(choices) as choice
      where poll_id = ${pollId}
      group by choice
    `);
    return result.rows;
  }

  private rules(poll: typeof polls.$inferSelect): PollRules {
    return {
      selection: poll.selection as PollRules['selection'],
      minChoices: poll.minChoices,
      maxChoices: poll.maxChoices,
      opensAt: poll.opensAt?.toISOString() ?? null,
      closesAt: poll.closesAt?.toISOString() ?? null,
      closedManually: poll.closedManually,
      visibility: poll.visibility as PollRules['visibility'],
    };
  }

  private async mustPublishedPoll(id: string) {
    const [poll] = await this.database.db.select().from(polls).where(and(eq(polls.id, id), eq(polls.status, 'published'))).limit(1);
    if (!poll) throw new ApiException(404, 'not_found', 'Enquete não encontrada.');
    return poll;
  }

  private async siteByKey(siteKey: string) {
    const { sites } = await import('@tscms/database');
    const { isNull } = await import('drizzle-orm');
    const [site] = await this.database.db.select().from(sites).where(and(eq(sites.key, siteKey), isNull(sites.deletedAt))).limit(1);
    if (!site) throw new ApiException(404, 'not_found', 'Site não encontrado.');
    return site;
  }

  private limit(key: string, max: number) {
    const now = Date.now();
    const current = voteBuckets.get(key);
    if (!current || current.reset < now) {
      voteBuckets.set(key, { count: 1, reset: now + 60_000 });
      return;
    }
    current.count += 1;
    if (current.count > max) throw new ApiException(429, 'rate_limited', 'Muitas tentativas. Aguarde um instante.');
  }

  private absolute(key: string) {
    return path.resolve(process.env.MEDIA_ROOT ?? './data/media', key);
  }

  private async writeBlob(key: string, body: Buffer) {
    const target = this.absolute(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }
}
