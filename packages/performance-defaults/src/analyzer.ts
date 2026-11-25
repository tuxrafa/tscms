import type { CanonicalDocument, ContentNode } from '@tscms/content-schema';
import type { PageKind } from './defaults.js';
import { performanceBudgets } from './defaults.js';

export type PerformanceFindingSeverity = 'info' | 'warning' | 'blocking';

export interface PerformanceFinding {
  code: string;
  severity: PerformanceFindingSeverity;
  /** Author-facing Portuguese message (simple mode). */
  message: string;
  /** Optional technical detail for advanced mode. */
  detail?: string;
  nodeId?: string;
}

export interface PublicationPerformanceReport {
  pageKind: PageKind;
  findings: PerformanceFinding[];
  /** True when no blocking findings — soft warnings never block publish. */
  okToPublish: boolean;
  lcpCandidate?: {
    nodeId?: string;
    src: string;
    eager: boolean;
  };
}

interface ImageRef {
  nodeId?: string;
  src: string;
  alt: string;
  eager: boolean;
  width?: number;
  height?: number;
  srcset?: string;
}

/**
 * Fast, deterministic checks for the publishing pipeline.
 * Not a full Lighthouse run — suitable for synchronous publish gates.
 */
export function analyzePublicationPerformance(
  document: CanonicalDocument,
  options?: { pageKind?: PageKind },
): PublicationPerformanceReport {
  const pageKind = options?.pageKind ?? inferPageKind(document);
  const images = collectImages(document);
  const findings: PerformanceFinding[] = [];
  const budget = performanceBudgets[pageKind];

  for (const image of images) {
    if (!image.alt.trim()) {
      findings.push({
        code: 'image-missing-alt',
        severity: 'warning',
        message: 'Uma imagem está sem texto alternativo. Adicione uma descrição curta para acessibilidade.',
        detail: `src=${image.src}`,
        nodeId: image.nodeId,
      });
    }
    if (!image.width || !image.height) {
      findings.push({
        code: 'image-missing-dimensions',
        severity: 'info',
        message: 'O Portal Studio pode reservar o espaço da imagem automaticamente quando as dimensões estiverem disponíveis.',
        detail: `src=${image.src}`,
        nodeId: image.nodeId,
      });
    }
    if (image.eager && image.width && image.width > 2400) {
      findings.push({
        code: 'image-oversized-for-viewport',
        severity: 'info',
        message: 'Esta imagem é maior do que o necessário na tela. O Studio pode escolher uma versão otimizada sem alterar o original.',
        detail: `width=${image.width} budgetAboveFoldKiB≈${budget.aboveFoldImagesKiB}`,
        nodeId: image.nodeId,
      });
    }
    if (image.eager && !image.srcset) {
      findings.push({
        code: 'image-missing-srcset',
        severity: 'info',
        message: 'Imagens em destaque ficam mais rápidas com versões em vários tamanhos. O DAM gera isso automaticamente no upload.',
        nodeId: image.nodeId,
      });
    }
  }

  const lcp = images.find((item) => item.eager) ?? images[0];
  return {
    pageKind,
    findings,
    okToPublish: !findings.some((item) => item.severity === 'blocking'),
    lcpCandidate: lcp
      ? { nodeId: lcp.nodeId, src: lcp.src, eager: lcp.eager }
      : undefined,
  };
}

function inferPageKind(document: CanonicalDocument): PageKind {
  const template = String(document.metadata?.template || '').toLowerCase();
  if (template.includes('article') || template.includes('blog')) return 'article';
  if (template.includes('list') || template.includes('index')) return 'listing';
  if (template.includes('landing')) return 'landing';
  if (template.includes('home') || document.id === 'home') return 'home';
  return 'article';
}

function collectImages(document: CanonicalDocument): ImageRef[] {
  const images: ImageRef[] = [];
  for (const slot of Object.values(document.slots)) {
    for (const section of slot.sections) {
      for (const node of section.children) walkNode(node, images);
    }
  }
  return images;
}

function walkNode(node: ContentNode, images: ImageRef[]): void {
  if (node.type === 'fragmentReference') return;
  if (node.type === 'defaultContent') {
    if (node.element === 'image') {
      images.push(imageFromData(node.id, node.data as Record<string, unknown>, Boolean((node.data as { eager?: boolean }).eager)));
    }
    return;
  }
  const data = (node.data ?? {}) as Record<string, unknown>;
  const eager = loadsEager(data, node.options);
  if (data.image && typeof data.image === 'object') {
    images.push(imageFromData(node.id, data.image as Record<string, unknown>, eager));
  }
  if (data.src && typeof data.src === 'string' && (node.name === 'image' || data.alt !== undefined)) {
    images.push(imageFromData(node.id, data, eager));
  }
  const cards = Array.isArray(data.cards) ? data.cards : [];
  for (const card of cards) {
    if (card && typeof card === 'object' && (card as { image?: unknown }).image) {
      images.push(imageFromData(node.id, (card as { image: Record<string, unknown> }).image, eager));
    }
  }
}

function loadsEager(data: Record<string, unknown>, options?: string[]): boolean {
  if (options?.includes('eager')) return true;
  if (data.eager === true) return true;
  if (data.loading === 'eager') return true;
  return false;
}

function imageFromData(nodeId: string | undefined, data: Record<string, unknown>, eager: boolean): ImageRef {
  const asset = typeof data.asset === 'object' && data.asset ? (data.asset as Record<string, unknown>) : null;
  const src = String(data.src ?? asset?.src ?? '');
  const alt = String(data.alt ?? asset?.alt ?? '');
  const width = numberOrUndefined(data.width ?? asset?.width);
  const height = numberOrUndefined(data.height ?? asset?.height);
  const srcset = typeof data.srcset === 'string' ? data.srcset : typeof asset?.srcset === 'string' ? asset.srcset : undefined;
  return { nodeId, src, alt, eager, width, height, srcset };
}

function numberOrUndefined(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
