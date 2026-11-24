import { describe, expect, it } from 'vitest';
import { verifyWebhook } from '@tscms/publishing';
import { deliverWebhook } from './deliver.js';

describe('entrega de webhook', () => {
  it('assina o corpo e marca nova tentativa quando o destino falha', async () => {
    let signature = '';
    const failed = await deliverWebhook(
      { url: 'https://example.com/hook', secret: 'segredo', event: 'page.published', payload: { id: '1' }, attempts: 0 },
      async (_url, init) => {
        signature = String((init?.headers as Record<string, string>)['x-tscms-signature']);
        return new Response('não', { status: 500 });
      },
    );
    expect(verifyWebhook('segredo', JSON.stringify({ id: '1' }), signature)).toBe(true);
    expect(failed).toEqual({ status: 'retry', attempts: 1, error: 'HTTP 500' });
  });
});
