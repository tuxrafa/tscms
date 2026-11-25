import { classNamesFor } from '@tscms/block-registry';
import type { CanonicalDocument, ContentNode, RichTextDocument, SectionNode } from '@tscms/content-schema';
import { assetPictureStyle, escapeAttr, escapeHtml, renderPicture } from './html.js';

export interface RenderContext {
  siteKey: string;
  publicBaseUrl: string;
  runtime: 'tscms' | 'adobe';
  /** Public URL prefix for the site (e.g. `/12pontos`). Empty means site root. */
  basePath?: string;
  eager?: boolean;
}

function withBasePath(basePath: string | undefined, assetPath: string): string {
  const prefix = String(basePath || '').replace(/\/+$/, '');
  if (!prefix) return assetPath;
  if (!assetPath.startsWith('/')) return `${prefix}/${assetPath}`;
  return `${prefix}${assetPath}`;
}

const allowedEmbedHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
  'www.vimeo.com',
]);

export function renderPlainMain(document: CanonicalDocument, context: RenderContext): string {
  const sections = Object.values(document.slots).flatMap((slot) => slot.sections.map((section) => renderSection(section, context)));
  const html = sections.join('');
  return html.includes('asset-picture') ? `${assetPictureStyle}${html}` : html;
}

export function renderPageHtml(document: CanonicalDocument, context: RenderContext): string {
  const meta = document.metadata;
  const language = meta.language ?? document.locale;
  const title = escapeHtml(meta.title);
  const description = meta.description ? `<meta name="description" content="${escapeAttr(meta.description)}">` : '';
  const canonical = meta.canonical ? `<link rel="canonical" href="${escapeAttr(meta.canonical)}">` : '';
  const robots = meta.robots ? `<meta name="robots" content="${escapeAttr(meta.robots)}">` : '';
  const ogTitle = escapeAttr(meta.openGraph?.title ?? meta.title);
  const ogDescription = meta.openGraph?.description ?? meta.description;
  const ogImage = meta.openGraph?.image ? `<meta property="og:image" content="${escapeAttr(meta.openGraph.image)}">` : '';
  const alternates = (meta.alternates ?? [])
    .map((item) => `<link rel="alternate" hreflang="${escapeAttr(item.locale)}" href="${escapeAttr(item.href)}">`)
    .join('');
  const structured = meta.structuredData
    ? `<script type="application/ld+json">${JSON.stringify(meta.structuredData).replaceAll('<', '\\u003c')}</script>`
    : '';
  const nav = withBasePath(context.basePath, meta.nav ?? '/nav');
  const footer = withBasePath(context.basePath, meta.footer ?? '/footer');
  const feedHref = withBasePath(context.basePath, '/feed.xml');
  const stylesHref = withBasePath(context.basePath, '/styles/styles.css');
  const scripts =
    context.runtime === 'adobe'
      ? `<script src="${escapeAttr(withBasePath(context.basePath, '/scripts/aem.js'))}" type="module"></script><script src="${escapeAttr(withBasePath(context.basePath, '/scripts/scripts.js'))}" type="module"></script>`
      : `<script src="${escapeAttr(withBasePath(context.basePath, '/scripts/scripts.js'))}" type="module"></script>`;
  return `<!DOCTYPE html><html lang="${escapeAttr(language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${description}${canonical}${robots}<meta property="og:title" content="${ogTitle}">${ogDescription ? `<meta property="og:description" content="${escapeAttr(ogDescription)}">` : ''}${ogImage}<meta property="og:type" content="website"><meta name="nav" content="${escapeAttr(nav)}"><meta name="footer" content="${escapeAttr(footer)}">${meta.template ? `<meta name="template" content="${escapeAttr(meta.template)}">` : ''}${meta.theme ? `<meta name="theme" content="${escapeAttr(meta.theme)}">` : ''}${alternates}<link rel="alternate" type="application/rss+xml" title="${title}" href="${escapeAttr(feedHref)}"><link rel="stylesheet" href="${escapeAttr(stylesHref)}">${structured}${scripts}</head><body><header></header><main>${renderPlainMain(document, context)}</main><footer></footer></body></html>`;
}

function renderSection(section: SectionNode, context: RenderContext): string {
  const classes = (section.metadata?.style ?? []).map((item) => sanitizeClass(item));
  const id = section.metadata?.anchorId ? ` id="${escapeAttr(sanitizeAnchor(section.metadata.anchorId))}"` : '';
  const classAttr = classes.length > 0 ? ` class="${classes.join(' ')}"` : '';
  const children = section.children.map((node) => renderNode(node, context)).join('');
  return `<div${classAttr}${id}>${children}</div>`;
}

function renderNode(node: ContentNode, context: RenderContext): string {
  if (node.type === 'fragmentReference') {
    const path = node.path ?? `/fragments/${node.fragmentId}`;
    return block('fragment', [], `<div><div><p><a href="${escapeAttr(path)}">${escapeHtml(path)}</a></p></div></div>`);
  }
  if (node.type === 'defaultContent') return renderDefault(node.element, node.data);
  return renderBlock(node.name, node.variant, node.options, node.data, context);
}

function loadsEager(data: Record<string, unknown>, options?: string[]): boolean {
  return data.eager === true || options?.includes('eager') === true;
}

function renderDefault(element: string, data: Record<string, unknown>): string {
  switch (element) {
    case 'heading': {
      const level = clampHeading(data.level);
      const id = typeof data.anchor === 'string' ? ` id="${escapeAttr(sanitizeAnchor(data.anchor))}"` : '';
      return `<h${level}${id}>${escapeHtml(stringValue(data.text))}</h${level}>`;
    }
    case 'text':
      return renderRich(data.body);
    case 'image':
      return `${renderPicture(pictureFrom(data.assetId ? data.asset ?? data : { src: data.src, alt: data.alt, srcset: data.srcset, asset: data.asset }), loadsEager(data))}${data.caption ? `<p>${escapeHtml(stringValue(data.caption))}</p>` : ''}`;
    case 'button':
      return renderButton(data);
    case 'buttonGroup':
      return arrayValue(data.items).map((item) => renderButton(item)).join('');
    case 'divider':
      return '<hr>';
    case 'spacer':
      return `<p class="spacer spacer-${escapeAttr(stringValue(data.token || 'm'))}" aria-hidden="true"></p>`;
    case 'list': {
      const tag = data.ordered === true ? 'ol' : 'ul';
      const items = arrayValue(data.items).map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : stringValue(nested(item, 'text')))}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'quote':
      return `<blockquote><p>${escapeHtml(stringValue(data.text))}</p>${data.author ? `<p><cite>${escapeHtml(stringValue(data.author))}</cite></p>` : ''}</blockquote>`;
    case 'code':
      return `<pre><code>${escapeHtml(stringValue(data.code))}</code></pre>`;
    default:
      return '';
  }
}

function renderBlock(
  name: string,
  variant: string | undefined,
  options: string[] | undefined,
  data: Record<string, unknown>,
  context: RenderContext,
): string {
  const classes = classNamesFor(name === 'faq' ? 'accordion' : name, variant, options);
  if (name === 'faq') classes[0] = 'faq';
  const rows = rowsFor(name, data, context, loadsEager(data, options));
  return block(classes[0] ?? name, classes.slice(1), rows);
}

function block(name: string, extra: string[], inner: string): string {
  const classes = [name, ...extra].join(' ');
  return `<div class="${classes}">${inner}</div>`;
}

function cell(html: string): string {
  return `<div><div>${html}</div></div>`;
}

function row(cells: string[]): string {
  return `<div>${cells.map((item) => `<div>${item}</div>`).join('')}</div>`;
}

function rowsFor(name: string, data: Record<string, unknown>, context: RenderContext, eager: boolean): string {
  switch (name) {
    case 'hero':
      return [
        cell(data.image ? renderPicture(pictureFrom(data.image), eager) : ''),
        cell(
          [
            data.eyebrow ? `<p>${escapeHtml(stringValue(data.eyebrow))}</p>` : '',
            `<h1>${escapeHtml(stringValue(data.title))}</h1>`,
            data.description ? `<p>${escapeHtml(stringValue(data.description))}</p>` : '',
            data.primaryLabel ? renderButton({ label: data.primaryLabel, href: data.primaryHref, variant: 'primary' }) : '',
            data.secondaryLabel ? renderButton({ label: data.secondaryLabel, href: data.secondaryHref, variant: 'secondary' }) : '',
          ].join(''),
        ),
      ].join('');
    case 'cards':
    case 'feature-cards':
    case 'team-cards':
    case 'testimonial-cards':
    case 'pricing-cards':
    case 'logo-cloud':
    case 'gallery':
      return arrayValue(data.cards ?? data.items ?? data.people ?? data.plans ?? data.logos ?? data.images)
        .map((item) => renderCardRow(item, eager))
        .join('');
    case 'columns':
      return row(
        arrayValue(data.columns).map((item) => {
          if (typeof item === 'string') return `<p>${escapeHtml(item)}</p>`;
          if (isRecord(item) && typeof item.text === 'string') return `<p>${escapeHtml(item.text)}</p>`;
          if (isRecord(item) && item.body) return renderRich(item.body);
          return `<p>${escapeHtml(stringValue(nested(item, 'title')))}</p>`;
        }),
      );
    case 'split-content':
      return row([
        data.image ? renderPicture(pictureFrom(data.image), eager) : '',
        `<h2>${escapeHtml(stringValue(data.title))}</h2>${typeof data.body === 'string' ? `<p>${escapeHtml(data.body)}</p>` : renderRich(data.body)}`,
      ]);
    case 'tabs':
      return arrayValue(data.tabs)
        .map((item) => row([`<p>${escapeHtml(stringValue(nested(item, 'title')))}</p>`, `<p>${escapeHtml(stringValue(nested(item, 'body')))}</p>`]))
        .join('');
    case 'accordion':
    case 'faq':
      return arrayValue(data.items)
        .map((item) => row([`<p>${escapeHtml(stringValue(nested(item, 'title')))}</p>`, `<p>${escapeHtml(stringValue(nested(item, 'body')))}</p>`]))
        .join('');
    case 'carousel':
    case 'slider':
      return arrayValue(data.slides).map((item) => renderCardRow(item, eager)).join('');
    case 'before-after':
      return row([
        data.before ? renderPicture(pictureFrom(data.before), eager) : '',
        data.after ? renderPicture(pictureFrom(data.after), eager) : '',
      ]);
    case 'video':
      return cell(`<p><a href="${escapeAttr(stringValue(data.src))}">${escapeHtml(stringValue(data.title || data.src))}</a></p>`);
    case 'embed':
      return cell(renderEmbed(stringValue(data.url), stringValue(data.title)));
    case 'cta':
    case 'banner':
      return cell(`<h2>${escapeHtml(stringValue(data.title))}</h2>${data.text || data.description ? `<p>${escapeHtml(stringValue(data.text ?? data.description))}</p>` : ''}${data.label ? renderButton({ label: data.label, href: data.href, variant: 'primary' }) : ''}`);
    case 'form':
    case 'newsletter':
      return cell(renderForm(name, data, context));
    case 'poll':
      return cell(`<form method="post" action="${escapeAttr(`${context.publicBaseUrl}/v1/public/polls/${stringValue(data.pollId)}/votes`)}"><input type="hidden" name="_format" value="form"><p>Enquete</p><button type="submit">Votar</button></form>`);
    case 'blog-listing':
    case 'featured-posts':
    case 'related-posts':
      return keyValues(data);
    case 'comparison-table':
    case 'pricing-table':
      return cell(renderTable(data));
    case 'map':
      return cell(`<p><a href="https://www.openstreetmap.org/search?query=${encodeURIComponent(stringValue(data.query || data.title))}">${escapeHtml(stringValue(data.title))}</a></p>`);
    case 'countdown':
      return cell(`<p><time datetime="${escapeAttr(stringValue(data.target))}">${escapeHtml(stringValue(data.label || data.target))}</time></p>`);
    case 'search':
      return cell(`<form method="get" action="/search"><label>${escapeHtml(stringValue(data.placeholder || 'Buscar'))}<input type="search" name="q"></label></form>`);
    case 'breadcrumbs':
      return cell(`<nav aria-label="Trilha"><ol>${arrayValue(data.items).map((item) => `<li><a href="${escapeAttr(stringValue(nested(item, 'href')))}">${escapeHtml(stringValue(nested(item, 'label')))}</a></li>`).join('')}</ol></nav>`);
    case 'contact-information':
      return cell(`<address>${['address', 'phone', 'email', 'hours'].filter((key) => data[key]).map((key) => `<p>${escapeHtml(stringValue(data[key]))}</p>`).join('')}</address>`);
    default:
      return keyValues(data);
  }
}

function renderCardRow(item: unknown, eager: boolean): string {
  const image = isRecord(item) ? item.image ?? (item.src ? item : undefined) : undefined;
  const picture = image ? renderPicture(pictureFrom(image), eager) : '';
  const title = stringValue(nested(item, 'title') ?? nested(item, 'name') ?? nested(item, 'quote') ?? '');
  const text = stringValue(nested(item, 'text') ?? nested(item, 'role') ?? nested(item, 'author') ?? '');
  const href = nested(item, 'href');
  const body = `${title ? `<h3>${escapeHtml(title)}</h3>` : ''}${text ? `<p>${escapeHtml(text)}</p>` : ''}${href ? `<p><a href="${escapeAttr(stringValue(href))}">${escapeHtml(stringValue(nested(item, 'label') || title || href))}</a></p>` : ''}`;
  if (!picture) return row([body]);
  return row([picture, body]);
}

function renderButton(data: unknown): string {
  const label = escapeHtml(stringValue(nested(data, 'label')));
  const href = nested(data, 'href');
  if (typeof href === 'string' && href.length > 0) {
    const variant = nested(data, 'variant');
    const link = `<a href="${escapeAttr(href)}">${label}</a>`;
    if (variant === 'secondary') return `<p><em>${link}</em></p>`;
    return `<p><strong>${link}</strong></p>`;
  }
  return `<p><button type="button">${label}</button></p>`;
}

function renderRich(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.content)) {
    return typeof value === 'string' ? `<p>${escapeHtml(value)}</p>` : '';
  }
  const doc = value as unknown as RichTextDocument;
  return doc.content
    .map((blockNode) => {
      if (blockNode.type === 'paragraph') return `<p>${renderInlines(blockNode.children)}</p>`;
      if (blockNode.type === 'heading') return `<h${blockNode.level}>${renderInlines(blockNode.children)}</h${blockNode.level}>`;
      if (blockNode.type === 'blockquote') return `<blockquote><p>${renderInlines(blockNode.children)}</p></blockquote>`;
      const tag = blockNode.ordered ? 'ol' : 'ul';
      return `<${tag}>${blockNode.items.map((item) => `<li>${renderInlines(item)}</li>`).join('')}</${tag}>`;
    })
    .join('');
}

function renderInlines(children: Array<{ type: string; text?: string; href?: string; marks?: string[] }>): string {
  return children
    .map((child) => {
      if (child.type === 'link') return `<a href="${escapeAttr(child.href ?? '#')}">${escapeHtml(child.text ?? '')}</a>`;
      let text = escapeHtml(child.text ?? '');
      for (const mark of child.marks ?? []) {
        if (mark === 'strong') text = `<strong>${text}</strong>`;
        if (mark === 'em') text = `<em>${text}</em>`;
        if (mark === 'code') text = `<code>${text}</code>`;
      }
      return text;
    })
    .join('');
}

function renderForm(name: string, data: Record<string, unknown>, context: RenderContext): string {
  const formKey = stringValue(data.formKey || name);
  const fields = arrayValue(data.fields);
  const controls = fields.length
    ? fields
        .map((field) => {
          const fieldName = stringValue(nested(field, 'name'));
          const label = escapeHtml(stringValue(nested(field, 'label') || fieldName));
          const type = stringValue(nested(field, 'type') || 'text');
          const required = nested(field, 'required') === true ? ' required' : '';
          if (type === 'textarea') return `<label>${label}<textarea name="${escapeAttr(fieldName)}"${required}></textarea></label>`;
          return `<label>${label}<input name="${escapeAttr(fieldName)}" type="${escapeAttr(type)}"${required}></label>`;
        })
        .join('')
    : `<label>E-mail<input name="email" type="email" required></label>`;
  return `<form method="post" action="${escapeAttr(`${context.publicBaseUrl}/v1/public/sites/${context.siteKey}/forms/${formKey}`)}"><h2>${escapeHtml(stringValue(data.title || 'Formulário'))}</h2>${controls}<button type="submit">Enviar</button></form>`;
}

function renderEmbed(url: string, title: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `<p>Incorporação recusada.</p>`;
  }
  if (!allowedEmbedHosts.has(parsed.hostname)) return `<p>Provedor não autorizado.</p>`;
  return `<iframe src="${escapeAttr(parsed.toString())}" title="${escapeAttr(title)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin"></iframe>`;
}

function renderTable(data: Record<string, unknown>): string {
  const columns = arrayValue(data.columns).map((item) => `<th>${escapeHtml(stringValue(item))}</th>`).join('');
  const rows = arrayValue(data.rows)
    .map((rowValue) => `<tr>${arrayValue(rowValue).map((cellValue) => `<td>${escapeHtml(stringValue(cellValue))}</td>`).join('')}</tr>`)
    .join('');
  return `<table>${columns ? `<thead><tr>${columns}</tr></thead>` : ''}<tbody>${rows}</tbody></table>`;
}

function keyValues(data: Record<string, unknown>): string {
  return Object.entries(data)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .map(([key, value]) => row([escapeHtml(key), escapeHtml(String(value))]))
    .join('');
}

function pictureFrom(value: unknown): { src: string; alt: string; srcset?: string } {
  if (typeof value === 'string') return { src: value, alt: '' };
  const nestedAsset = nested(value, 'asset');
  const source = nested(value, 'src') ? value : nestedAsset ?? value;
  const srcset = nested(source, 'srcset') ?? nested(value, 'srcset');
  return {
    src: stringValue(nested(source, 'src') ?? nested(value, 'src') ?? '/media/image.webp'),
    alt: stringValue(nested(value, 'alt') ?? nested(source, 'alt')),
    ...(typeof srcset === 'string' ? { srcset } : {}),
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nested(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampHeading(value: unknown): number {
  const level = typeof value === 'number' ? value : 2;
  return Math.min(6, Math.max(1, level));
}

function sanitizeClass(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z][a-z0-9-]*$/.test(token)) throw new Error(`Estilo de seção inválido: ${value}`);
  return token;
}

function sanitizeAnchor(value: string): string {
  const token = value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!token) throw new Error('Âncora inválida.');
  return token;
}

export function applyAutoBlocks(document: CanonicalDocument, enabled: Array<'video-link' | 'fragment-link'>): CanonicalDocument {
  const next = structuredClone(document);
  for (const slot of Object.values(next.slots)) {
    for (const section of slot.sections) {
      section.children = section.children.flatMap((node) => {
        if (node.type !== 'defaultContent' || node.element !== 'text') return [node];
        const href = firstLink(node.data.body);
        if (!href) return [node];
        if (enabled.includes('video-link') && /youtube\.com|youtu\.be|vimeo\.com/.test(href)) {
          return [{ id: `${node.id}-video`, type: 'block' as const, name: 'video', data: { src: href, title: href } }];
        }
        if (enabled.includes('fragment-link') && href.includes('/fragments/')) {
          return [{ id: `${node.id}-fragment`, type: 'fragmentReference' as const, fragmentId: '00000000-0000-4000-8000-000000000000', mode: 'linked' as const, path: href }];
        }
        return [node];
      });
    }
  }
  return next;
}

function firstLink(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.content)) return undefined;
  for (const blockNode of value.content) {
    if (!isRecord(blockNode) || !Array.isArray(blockNode.children)) continue;
    for (const child of blockNode.children) {
      if (isRecord(child) && child.type === 'link' && typeof child.href === 'string') return child.href;
    }
  }
  return undefined;
}
