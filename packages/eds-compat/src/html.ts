import { pictureLoadingAttrs } from '@tscms/performance-defaults';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}

export interface PictureSource {
  url: string;
  width?: number;
}

export interface PictureInput {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcset?: string;
  sources?: PictureSource[];
}

const screenSlots = [
  { media: '(max-width: 480px)', max: 480 },
  { media: '(max-width: 768px)', max: 768 },
  { media: '(max-width: 1200px)', max: 1200 },
  { media: '(min-width: 1201px)', max: Number.POSITIVE_INFINITY },
] as const;

/**
 * Eager images use data-eager so opacity is not gated on onload (LCP render delay).
 * Lazy images keep the shimmer / fade until data-loaded.
 */
export const assetPictureStyle =
  '<style data-asset-picture>' +
  'picture.asset-picture{display:block;position:relative;overflow:hidden;background:#e8e2d8 center/cover no-repeat;background-image:linear-gradient(100deg,#ddd6cb 20%,#f7f4ef 50%,#ddd6cb 80%);background-size:200% 100%;animation:asset-picture-shimmer 1.1s linear infinite}' +
  'picture.asset-picture[style]{animation:none;background-image:none}' +
  'picture.asset-picture::before{content:"";position:absolute;inset:0;background:#e8e2d8 center/cover no-repeat;background-image:var(--asset-preview);filter:blur(12px);transform:scale(1.08);animation:asset-picture-pulse 1.3s ease-in-out infinite}' +
  'picture.asset-picture:not([style])::before{content:none}' +
  'picture.asset-picture[data-loaded]{animation:none;background-image:none}' +
  'picture.asset-picture[data-loaded]::before{opacity:0;animation:none}' +
  'picture.asset-picture img{position:relative;z-index:1;display:block;width:100%;height:auto}' +
  'picture.asset-picture:not([data-eager]) img{opacity:0;transition:opacity .35s ease}' +
  'picture.asset-picture[data-loaded] img,picture.asset-picture[data-eager] img{opacity:1}' +
  '@keyframes asset-picture-shimmer{to{background-position:200% 0}}' +
  '@keyframes asset-picture-pulse{50%{filter:blur(12px) brightness(1.12)}}' +
  '</style>';

export function renderPicture(input: PictureInput, eager = false): string {
  const sources = input.sources?.length ? input.sources : parseSrcset(input.srcset);
  const fallback = input.src;
  const chosen = screenSlots.map((slot) => ({ media: slot.media, url: urlForWidth(sources, slot.max, fallback) }));
  const imgSrc = sources.length > 0 ? urlForWidth(sources, Number.POSITIVE_INFINITY, fallback) : fallback;
  const preview = previewUrl(sources, imgSrc);
  const style = preview ? ` style="--asset-preview:url('${escapeCss(preview)}')"` : '';
  const loadingAttrs = pictureLoadingAttrs(eager);
  const eagerAttr = loadingAttrs.dataEager ? ' data-eager' : '';
  const fetchPriority = loadingAttrs.fetchpriority ? ` fetchpriority="${loadingAttrs.fetchpriority}"` : '';
  const dimensions =
    input.width && input.height
      ? ` width="${input.width}" height="${input.height}"`
      : input.width
        ? ` width="${input.width}"`
        : '';
  const sourceTags = chosen
    .map((slot) => `<source media="${slot.media}" srcset="${escapeAttr(slot.url)}"${typeFor(slot.url)}>`)
    .join('');
  return `<picture class="asset-picture"${eagerAttr}${style}>${sourceTags}<img src="${escapeAttr(imgSrc)}" alt="${escapeAttr(input.alt)}"${dimensions} loading="${loadingAttrs.loading}"${fetchPriority} decoding="${loadingAttrs.decoding}" onload="this.closest('picture').setAttribute('data-loaded','')"></picture>`;
}

export function parseSrcset(srcset: string | undefined): PictureSource[] {
  if (!srcset?.trim()) return [];
  const sources: PictureSource[] = [];
  for (const part of srcset.split(',')) {
    const [url, descriptor] = part.trim().split(/\s+/);
    if (!url) continue;
    const parsed = descriptor?.endsWith('w') ? Number(descriptor.slice(0, -1)) : undefined;
    sources.push(parsed !== undefined && Number.isFinite(parsed) ? { url, width: parsed } : { url });
  }
  return sources;
}

function urlForWidth(sources: PictureSource[], max: number, fallback: string): string {
  const sized = sources.filter((item) => item.width !== undefined);
  const pool = sized.length > 0 ? sized : sources;
  if (pool.length === 0) return fallback;
  const fitting = pool.filter((item) => (item.width ?? 0) <= max);
  const candidates = fitting.length > 0 ? fitting : pool;
  return candidates.reduce((best, item) => ((item.width ?? 0) > (best.width ?? 0) ? item : best)).url;
}

function previewUrl(sources: PictureSource[], displayed: string): string | undefined {
  const unique = [...new Set(sources.map((item) => item.url))];
  if (unique.length < 2) return undefined;
  const smallest = [...sources].sort((left, right) => (left.width ?? Number.MAX_SAFE_INTEGER) - (right.width ?? Number.MAX_SAFE_INTEGER))[0];
  if (!smallest || smallest.url === displayed) return undefined;
  return smallest.url;
}

function typeFor(url: string): string {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (path.endsWith('.webp')) return ' type="image/webp"';
  if (path.endsWith('.avif')) return ' type="image/avif"';
  return '';
}

function escapeCss(value: string): string {
  return value.replaceAll('\\', '').replaceAll("'", '').replaceAll('(', '%28').replaceAll(')', '%29');
}
