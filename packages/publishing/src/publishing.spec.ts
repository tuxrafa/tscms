import { describe, expect, it } from 'vitest';
import { parseRss, renderRss, signWebhook, verifyWebhook } from './index.js';

describe('publicação e feeds', () => {
  it('gera RSS escapado e confere assinatura', () => {
    const rss = renderRss({
      title: 'Revista & Cia',
      link: 'https://example.com',
      description: 'Edição',
      language: 'pt-BR',
      items: [
        {
          title: 'Título <novo>',
          link: 'https://example.com/blog/novo',
          description: 'Resumo',
          guid: '1',
          pubDate: 'Tue, 24 Nov 2026 12:00:00 GMT',
          categories: ['cidade'],
        },
      ],
    });
    expect(rss).toContain('Revista &amp; Cia');
    expect(rss).toContain('Título &lt;novo&gt;');
    expect(rss).not.toContain('<novo>');
    const signature = signWebhook('segredo', rss);
    expect(verifyWebhook('segredo', rss, signature)).toBe(true);
    expect(verifyWebhook('outro', rss, signature)).toBe(false);
  });

  it('lê um feed sem resolver entidades externas', () => {
    const items = parseRss(`<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><item><title>Nota</title><link>https://example.com/a</link><description>Texto</description><guid>a</guid></item></channel></rss>`);
    expect(items[0]?.title).toBe('Nota');
    expect(JSON.stringify(items)).not.toContain('root:');
  });
});
