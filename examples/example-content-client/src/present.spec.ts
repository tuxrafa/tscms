import { DeliveryClient } from '@tscms/delivery-sdk';
import { describe, expect, it } from 'vitest';
import { loadArticle } from './present.js';

describe('cliente externo', () => {
  it('apresenta um artigo sem renderer e sem React', async () => {
    const client = new DeliveryClient({
      baseUrl: 'http://cms.test',
      siteKey: 'revista',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            id: '11111111-1111-4111-8111-111111111111',
            type: 'article',
            locale: 'pt-BR',
            slug: 'capa',
            revisionId: '22222222-2222-4222-8222-222222222222',
            data: { title: 'Capa da semana', body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Resumo curto.' }] }] } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    });
    await expect(loadArticle(client, '11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      title: 'Capa da semana',
      summary: 'Resumo curto.',
    });
  });
});
