import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const delivery = process.env.DELIVERY_URL ?? 'http://127.0.0.1:3000/v1/delivery/sites/site-inicial/pages/by-path?path=/&format=html';

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    const page = await fetch(delivery);
    response.writeHead(page.status, { 'content-type': 'text/html; charset=utf-8' });
    response.end(await page.text());
    return;
  }
  const file = path.join(root, url.pathname);
  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const body = await readFile(file);
    response.writeHead(200);
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('não encontrado');
  }
}).listen(Number(process.env.SITE_PORT ?? 4180), '127.0.0.1');
