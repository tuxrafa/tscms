const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!slugPattern.test(normalized)) {
    throw new Error('Não foi possível gerar um slug válido.');
  }
  return normalized;
}

export function joinPath(parent: string, slug: string): string {
  const base = parent === '/' ? '' : parent.replace(/\/$/, '');
  return `${base}/${slug}`;
}

export function assertSafePath(path: string): string {
  if (!path.startsWith('/') || path.includes('..') || path.includes('//')) {
    throw new Error('Caminho de página inválido.');
  }
  return path;
}
