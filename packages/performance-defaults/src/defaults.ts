/**
 * Portal Performance Defaults — product policies for F2W Portal Studio.
 * Sites may override; authors should not need to configure these.
 *
 * These are platform defaults derived from measured 12 Pontos work.
 * They are not a guarantee that every site scores 100/100.
 */

export type PageKind = 'home' | 'article' | 'landing' | 'listing';

export interface PerformanceBudget {
  /** Soft ceiling for initial JS transfer (KiB). */
  initialJsKiB: number;
  /** Soft ceiling for critical CSS (KiB). */
  criticalCssKiB: number;
  /** Soft ceiling for webfonts (KiB). */
  fontsKiB: number;
  /** Soft ceiling for above-the-fold images (KiB). */
  aboveFoldImagesKiB: number;
  /** Target LCP (ms) for lab guidance — not a SLA. */
  lcpMs: number;
  /** Target CLS. */
  cls: number;
  /** Target TBT (ms). */
  tbtMs: number;
}

export const portalPerformanceDefaults = {
  images: {
    generateRenditions: true,
    generateSrcset: true,
    preserveAspectRatio: true,
    preserveFocalPoint: true,
    lazyBelowFold: true,
    prioritizeLcp: true,
    avoidDuplicateDownloads: true,
    requireAlt: true,
    /** Eager LCP candidates decode synchronously to cut element-render-delay. */
    eagerDecoding: 'sync' as const,
    lazyDecoding: 'async' as const,
    /** Skip decorative fade-in on eager images so paint is not gated on onload. */
    eagerVisibleImmediately: true,
  },
  fonts: {
    preferWoff2: true,
    subsetWhenPossible: true,
    avoidLayoutShift: true,
    selectivePreload: true,
  },
  css: {
    minify: true,
    avoidExcessBlocking: true,
    criticalInlineOnlyWhenMeasured: true,
    preserveSiteCss: true,
  },
  javascript: {
    minify: true,
    progressiveEnhancement: true,
    avoidHeavyBundlesForPublicPages: true,
  },
  html: {
    semantic: true,
    prioritizeCriticalResources: true,
    stableLayout: true,
  },
  cache: {
    hashImmutableStatics: true,
    longCacheImmutable: true,
    revalidateMutableContent: true,
    invalidateOnPublish: true,
  },
} as const;

export const performanceBudgets: Record<PageKind, PerformanceBudget> = {
  home: {
    initialJsKiB: 80,
    criticalCssKiB: 24,
    fontsKiB: 80,
    aboveFoldImagesKiB: 120,
    lcpMs: 800,
    cls: 0.05,
    tbtMs: 50,
  },
  listing: {
    initialJsKiB: 80,
    criticalCssKiB: 24,
    fontsKiB: 80,
    aboveFoldImagesKiB: 150,
    lcpMs: 900,
    cls: 0.05,
    tbtMs: 50,
  },
  article: {
    initialJsKiB: 60,
    criticalCssKiB: 20,
    fontsKiB: 80,
    aboveFoldImagesKiB: 180,
    lcpMs: 1000,
    cls: 0.05,
    tbtMs: 50,
  },
  landing: {
    initialJsKiB: 100,
    criticalCssKiB: 32,
    fontsKiB: 100,
    aboveFoldImagesKiB: 200,
    lcpMs: 1000,
    cls: 0.08,
    tbtMs: 80,
  },
};

export type ImageRole = 'hero' | 'card' | 'content' | 'thumbnail';

/** Default `sizes` hints by component role — authors never set these. */
export function defaultSizesForRole(role: ImageRole): string {
  switch (role) {
    case 'hero':
      return '(max-width: 900px) 100vw, 42vw';
    case 'card':
      return '(max-width: 768px) 100vw, 33vw';
    case 'thumbnail':
      return '160px';
    default:
      return '(max-width: 768px) 100vw, 50vw';
  }
}
