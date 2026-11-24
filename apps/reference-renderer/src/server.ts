import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { previewBridgeSource, withPreviewBridge } from './preview.js';

const siteRoot = path.resolve(process.env.SITE_ROOT ?? 'starter-kits/eds-site');
const delivery = process.env.DELIVERY_PAGE_URL ?? 'http://127.0.0.1:3000/v1/delivery/sites/site-inicial/pages/by-path?path=/&format=html';
const authorOrigin = process.env.AUTHOR_ORIGIN ?? 'http://127.0.0.1:5173';

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/preview-bridge.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(previewBridgeSource(authorOrigin));
    return;
  }
  if (url.pathname === '/') {
    const page = await fetch(delivery);
    const html = withPreviewBridge(await page.text());
    response.writeHead(page.status, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
    return;
  }
  const file = path.resolve(siteRoot, `.${url.pathname}`);
  if (!file.startsWith(siteRoot)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    response.writeHead(200);
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('não encontrado');
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(Number(process.env.RENDERER_PORT ?? 3001), '127.0.0.1');
}

export { server };
