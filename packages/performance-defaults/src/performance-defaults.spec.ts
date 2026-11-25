import { describe, expect, it } from 'vitest';
import { emptyDocument } from '@tscms/content-schema';
import {
  analyzePublicationPerformance,
  buildImagePreloadHtml,
  buildImagePreloadLinkHeader,
  buildSrcsetFromRenditions,
  defaultSizesForRole,
  performanceBudgets,
  pictureLoadingAttrs,
  portalPerformanceDefaults,
  preferPreloadHref,
  sameOriginPath,
} from './index.js';

describe('portal performance defaults', () => {
  it('exposes reusable image policies and budgets by page kind', () => {
    expect(portalPerformanceDefaults.images.prioritizeLcp).toBe(true);
    expect(portalPerformanceDefaults.images.eagerDecoding).toBe('sync');
    expect(performanceBudgets.home.lcpMs).toBeLessThanOrEqual(1000);
    expect(defaultSizesForRole('hero')).toContain('100vw');
  });

  it('marks eager pictures for immediate paint and high priority', () => {
    expect(pictureLoadingAttrs(true)).toEqual({
      loading: 'eager',
      fetchpriority: 'high',
      decoding: 'sync',
      dataEager: true,
    });
    expect(pictureLoadingAttrs(false)).toEqual({
      loading: 'lazy',
      decoding: 'async',
      dataEager: false,
    });
  });

  it('builds srcset and preload markup for DAM renditions', () => {
    const renditions = [
      { url: '/v1/a/small', width: 480, preset: 'small' },
      { url: '/v1/a/medium', width: 768, preset: 'medium' },
      { url: '/v1/a/large', width: 1200, preset: 'large' },
    ];
    expect(buildSrcsetFromRenditions(renditions)).toBe('/v1/a/small 480w, /v1/a/medium 768w, /v1/a/large 1200w');
    expect(preferPreloadHref(renditions, '/v1/a/large')).toBe('/v1/a/medium');
    const html = buildImagePreloadHtml({
      href: '/v1/a/medium',
      imagesrcset: buildSrcsetFromRenditions(renditions),
      imagesizes: defaultSizesForRole('hero'),
    });
    expect(html).toContain('rel="preload"');
    expect(html).toContain('as="image"');
    expect(html).toContain('fetchpriority="high"');
    expect(html).toContain('imagesrcset=');
    expect(buildImagePreloadLinkHeader({ href: '/v1/a/medium' })).toContain('rel=preload');
    expect(sameOriginPath('https://rafaellain.com/v1/a/medium', 'https://rafaellain.com')).toBe('/v1/a/medium');
  });

  it('analyzes publication documents with author-friendly findings', () => {
    const document = emptyDocument({ id: 'home', type: 'page', title: 'Home' });
    document.metadata = { title: 'Home', template: 'home', language: 'pt-BR' };
    document.slots.main?.sections[0]?.children.push({
      id: 'hero',
      type: 'block',
      name: 'hero',
      options: ['eager'],
      data: { title: 'Capa', image: { src: '/media/capa.webp', alt: '' } },
    });
    const report = analyzePublicationPerformance(document);
    expect(report.pageKind).toBe('home');
    expect(report.okToPublish).toBe(true);
    expect(report.lcpCandidate?.src).toBe('/media/capa.webp');
    expect(report.lcpCandidate?.eager).toBe(true);
    expect(report.findings.some((item) => item.code === 'image-missing-alt')).toBe(true);
    expect(report.findings.every((item) => item.severity !== 'blocking')).toBe(true);
  });
});
