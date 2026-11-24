import { createHmac, timingSafeEqual } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { assertPublicHttpUrl } from '@tscms/core-domain';

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate: string;
  categories: string[];
  author?: string;
  image?: string;
  content?: string;
}

export interface FeedChannel {
  title: string;
  link: string;
  description: string;
  language: string;
  items: FeedItem[];
}

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderRss(channel: FeedChannel): string {
  const items = channel.items
    .map((item) => {
      const categories = item.categories.map((category) => `<category>${xml(category)}</category>`).join('');
      const author = item.author ? `<author>${xml(item.author)}</author>` : '';
      const enclosure = item.image ? `<enclosure url="${xml(item.image)}" type="image/webp" />` : '';
      const content = item.content ? `<content:encoded><![CDATA[${item.content.replaceAll(']]>', ']]]]><![CDATA[>')}]]></content:encoded>` : '';
      return `<item><title>${xml(item.title)}</title><link>${xml(item.link)}</link><description>${xml(item.description)}</description><guid isPermaLink="false">${xml(item.guid)}</guid><pubDate>${xml(item.pubDate)}</pubDate>${author}${categories}${enclosure}${content}</item>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>${xml(channel.title)}</title><link>${xml(channel.link)}</link><description>${xml(channel.description)}</description><language>${xml(channel.language)}</language>${items}</channel></rss>`;
}

export function renderSitemap(urls: Array<{ loc: string; lastmod?: string }>): string {
  const body = urls
    .map((url) => `<url><loc>${xml(url.loc)}</loc>${url.lastmod ? `<lastmod>${xml(url.lastmod)}</lastmod>` : ''}</url>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function renderRobots(sitemapUrl: string): string {
  return `User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`;
}

export function signWebhook(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifyWebhook(secret: string, body: string, signature: string): boolean {
  const expected = signWebhook(secret, body);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface ImportedItem {
  guid: string;
  title: string;
  link: string;
  summary: string;
}

export function parseRss(xmlSource: string): ImportedItem[] {
  const sanitized = xmlSource.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  const parser = new XMLParser({
    ignoreAttributes: false,
    processEntities: false,
    htmlEntities: false,
    allowBooleanAttributes: false,
  });
  const document = parser.parse(sanitized) as { rss?: { channel?: { item?: unknown } } };
  const raw = document.rss?.channel?.item;
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return items.map((item) => {
    const record = item as Record<string, unknown>;
    return {
      guid: String(record.guid ?? record.link ?? record.title ?? ''),
      title: String(record.title ?? 'Sem título'),
      link: String(record.link ?? ''),
      summary: String(record.description ?? ''),
    };
  });
}

export async function fetchExternalFeed(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  let current = assertPublicHttpUrl(url);
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirecionamento sem destino.');
      current = assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Falha ao ler o feed (${response.status}).`);
    const length = Number(response.headers.get('content-length') ?? '0');
    if (length > 1_000_000) throw new Error('Feed excede o limite.');
    const text = await response.text();
    if (text.length > 1_000_000) throw new Error('Feed excede o limite.');
    return text;
  }
  throw new Error('Muitos redirecionamentos.');
}

export interface ReleaseSnapshot {
  entityType: string;
  entityId: string;
  revisionId: string;
  dependencies: Array<{ type: string; id: string }>;
  rendererVersion: string;
  siteBuildVersion?: string;
}

export async function writePublishedFiles(input: {
  root: string;
  siteKey: string;
  path: string;
  html: string;
  plain: string;
}): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const { dirname, join } = await import('node:path');
  const relative = input.path === '/' ? 'index' : input.path.replace(/^\//, '');
  const htmlPath = join(input.root, input.siteKey, `${relative}.html`);
  const plainPath = join(input.root, input.siteKey, `${relative}.plain.html`);
  await mkdir(dirname(htmlPath), { recursive: true });
  await mkdir(dirname(plainPath), { recursive: true });
  await writeFile(htmlPath, input.html);
  await writeFile(plainPath, input.plain);
}

export async function postSignedWebhook(input: {
  url: string;
  secret: string;
  event: string;
  body: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  assertPublicHttpUrl(input.url);
  const response = await (input.fetchImpl ?? fetch)(input.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-tscms-event': input.event,
      'x-tscms-signature': signWebhook(input.secret, input.body),
    },
    body: input.body,
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Webhook respondeu ${response.status}.`);
}

export function snapshotRelease(input: ReleaseSnapshot): ReleaseSnapshot {
  return {
    ...input,
    dependencies: [...input.dependencies].sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`)),
  };
}
