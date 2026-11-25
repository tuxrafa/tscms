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

export interface PictureInput {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcset?: string;
}

export function renderPicture(input: PictureInput, eager = false): string {
  const src = escapeAttr(input.src);
  const alt = escapeAttr(input.alt);
  const webp = input.srcset ? escapeAttr(input.srcset) : src.replace(/\.(jpe?g|png)$/i, '.webp');
  const loading = eager ? 'eager' : 'lazy';
  const fetchPriority = eager ? ' fetchpriority="high"' : '';
  return `<picture><source type="image/webp" srcset="${webp}"><img src="${src}" alt="${alt}" loading="${loading}"${fetchPriority}></picture>`;
}
