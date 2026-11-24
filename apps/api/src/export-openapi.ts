import { writeFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test';
const { createApp } = await import('./main.js');
const app = await createApp();
const response = await app.inject({ method: 'GET', url: '/docs-json' });
if (response.statusCode !== 200) {
  throw new Error(`OpenAPI indisponível: ${response.statusCode}`);
}
await writeFile(new URL('../../../docs/api/openapi.json', import.meta.url), response.body);
console.log('OpenAPI gravado em docs/api/openapi.json');
await app.close();
