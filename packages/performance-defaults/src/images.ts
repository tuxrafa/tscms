import { portalPerformanceDefaults } from './defaults.js';

export interface RenditionRef {
  url: string;
  width: number;
  height?: number | null;
  preset?: string;
}

export interface PictureLoadingAttrs {
  loading: 'eager' | 'lazy';
  fetchpriority?: 'high';
  decoding: 'sync' | 'async';
  /** When set, picture should paint without waiting for data-loaded. */
  dataEager: boolean;
}

/** Loading attributes for a DAM/public picture under Portal Performance Defaults. */
export function pictureLoadingAttrs(eager: boolean): PictureLoadingAttrs {
  const images = portalPerformanceDefaults.images;
  if (eager) {
    return {
      loading: 'eager',
      fetchpriority: 'high',
      decoding: images.eagerDecoding,
      dataEager: images.eagerVisibleImmediately,
    };
  }
  return {
    loading: 'lazy',
    decoding: images.lazyDecoding,
    dataEager: false,
  };
}

/** Width-descriptor srcset from ordered renditions (thumbnail → xlarge). */
export function buildSrcsetFromRenditions(renditions: RenditionRef[]): string {
  return renditions
    .filter((item) => item.url && item.width > 0)
    .sort((a, b) => a.width - b.width)
    .map((item) => `${item.url} ${item.width}w`)
    .join(', ');
}

export interface ImagePreloadOptions {
  href: string;
  imagesrcset?: string;
  imagesizes?: string;
  fetchpriority?: 'high' | 'low' | 'auto';
}

/** `<link rel="preload" as="image">` for the LCP candidate (HTML head). */
export function buildImagePreloadHtml(options: ImagePreloadOptions): string {
  const priority = options.fetchpriority ?? 'high';
  const parts = [
    `rel="preload"`,
    `as="image"`,
    `href="${escapeAttr(options.href)}"`,
    `fetchpriority="${priority}"`,
  ];
  if (options.imagesrcset) parts.push(`imagesrcset="${escapeAttr(options.imagesrcset)}"`);
  if (options.imagesizes) parts.push(`imagesizes="${escapeAttr(options.imagesizes)}"`);
  return `<link ${parts.join(' ')}>`;
}

/**
 * Value for an HTTP `Link` response header (nginx/CDN).
 * Caller must quote safely for their edge config.
 */
export function buildImagePreloadLinkHeader(options: ImagePreloadOptions): string {
  const priority = options.fetchpriority ?? 'high';
  let value = `<${options.href}>; rel=preload; as=image; fetchpriority=${priority}`;
  if (options.imagesrcset) value += `; imagesrcset="${options.imagesrcset}"`;
  if (options.imagesizes) value += `; imagesizes="${options.imagesizes}"`;
  return value;
}

/** Prefer same-origin absolute paths so preload and <img> share one connection. */
export function sameOriginPath(url: string, origin?: string): string {
  const value = String(url || '');
  if (!value) return value;
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value, origin || 'https://example.invalid');
    if (!origin || parsed.origin === new URL(origin).origin) {
      return parsed.pathname + parsed.search;
    }
  } catch {
    // keep
  }
  return value;
}

/**
 * Pick a mid-band href for early preload when multiple renditions exist.
 * Medium (≈768w) matches typical desktop hero CSS width × DPR without over-fetching.
 */
export function preferPreloadHref(renditions: RenditionRef[], fallback: string): string {
  const byPreset = Object.fromEntries(
    renditions.filter((item) => item.preset).map((item) => [item.preset, item.url]),
  ) as Record<string, string>;
  if (byPreset.medium) return byPreset.medium;
  const sorted = [...renditions].filter((item) => item.width > 0).sort((a, b) => a.width - b.width);
  const mid = sorted.find((item) => item.width >= 640) ?? sorted[sorted.length - 1];
  return mid?.url || fallback;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
