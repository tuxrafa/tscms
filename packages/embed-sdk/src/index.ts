export function embedIframe(input: { src: string; title: string }): string {
  const src = input.src.replaceAll('"', '%22');
  const title = input.title.replaceAll('"', '&quot;').replaceAll('<', '');
  return `<iframe src="${src}" title="${title}" loading="lazy" referrerpolicy="strict-origin"></iframe>`;
}
