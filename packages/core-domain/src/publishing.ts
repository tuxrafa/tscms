import type { EditorialStatus } from '@tscms/content-schema';

const transitions: Record<EditorialStatus, readonly EditorialStatus[]> = {
  draft: ['in_review', 'published', 'archived'],
  in_review: ['draft', 'published', 'archived'],
  published: ['draft', 'archived'],
  archived: ['draft'],
  scheduled: ['published', 'draft', 'archived'],
};

export function assertTransition(from: EditorialStatus, to: EditorialStatus): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new Error(`Transição de ${from} para ${to} não é permitida.`);
  }
}

export interface ReleasePointer {
  pageRevisionId?: string;
  templateRevisionId?: string;
  fragmentRevisionIds: string[];
  contentRevisionIds: string[];
  assetIds: string[];
  siteBuildVersion?: string;
  rendererVersion?: string;
}

export function releaseIsComplete(pointer: ReleasePointer): boolean {
  return Boolean(pointer.rendererVersion);
}
