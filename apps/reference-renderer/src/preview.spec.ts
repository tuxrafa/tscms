import { describe, expect, it } from 'vitest';
import { acceptPreviewMessage, withPreviewBridge } from './preview.js';

describe('preview do site', () => {
  it('coloca a ponte fora do main', () => {
    const html = withPreviewBridge('<main><div class="hero"></div></main><body></body>');
    const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
    expect(main).not.toContain('preview-bridge');
    expect(html.indexOf('preview-bridge')).toBeGreaterThan(html.indexOf('</main>'));
  });

  it('recusa origem fora da lista', () => {
    expect(() => acceptPreviewMessage({ protocol: 'tscms.preview', version: 1, type: 'ready' }, 'https://outro.example', ['http://127.0.0.1:5173'])).toThrow(/Origem/);
  });
});
