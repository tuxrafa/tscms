export async function loadSite(document) {
  const runtime = await import('@tscms/eds-runtime');
  await runtime.loadPage(document, { codeBasePath: '' });
}
