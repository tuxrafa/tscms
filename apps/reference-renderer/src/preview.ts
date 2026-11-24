import { parsePreviewMessage } from '@tscms/renderer-contracts';

export function withPreviewBridge(html: string): string {
  const bridge = '<script type="module" src="/preview-bridge.js"></script>';
  if (html.includes(bridge)) return html;
  if (html.includes('</body>')) return html.replace('</body>', `${bridge}</body>`);
  return `${html}${bridge}`;
}

export function previewBridgeSource(allowedOrigin: string): string {
  return `const allowed = ${JSON.stringify(allowedOrigin)};
window.addEventListener('message', (event) => {
  if (event.origin !== allowed) return;
  const message = event.data;
  if (!message || message.protocol !== 'tscms.preview' || message.version !== 1) return;
  if (message.type === 'highlight') {
    document.querySelectorAll('[data-preview-highlight]').forEach((node) => node.removeAttribute('data-preview-highlight'));
    const target = document.querySelector('[data-node-id="' + CSS.escape(message.nodeId) + '"]');
    target?.setAttribute('data-preview-highlight', 'true');
  }
});
parent.postMessage({ protocol: 'tscms.preview', version: 1, type: 'ready' }, allowed);
`;
}

export function acceptPreviewMessage(input: unknown, origin: string, allowed: string[]) {
  const message = parsePreviewMessage(input, origin, allowed);
  if (!message) throw new Error('Origem de preview não autorizada.');
  return message;
}
