export const previewProtocol = 'tscms.preview';
export const previewProtocolVersion = 1;

export type PreviewMessage =
  | { protocol: typeof previewProtocol; version: 1; type: 'ready' }
  | { protocol: typeof previewProtocol; version: 1; type: 'select'; nodeId: string }
  | { protocol: typeof previewProtocol; version: 1; type: 'highlight'; nodeId: string }
  | { protocol: typeof previewProtocol; version: 1; type: 'navigate'; breakpoint: 'desktop' | 'tablet' | 'mobile' };

export function parsePreviewMessage(value: unknown, origin: string, allowedOrigins: string[]): PreviewMessage | null {
  if (!allowedOrigins.includes(origin)) return null;
  if (typeof value !== 'object' || value === null) return null;
  const message = value as Partial<PreviewMessage>;
  if (message.protocol !== previewProtocol || message.version !== previewProtocolVersion) return null;
  if (message.type === 'ready') return { protocol: previewProtocol, version: 1, type: 'ready' };
  if (message.type === 'highlight' || message.type === 'select') {
    if (typeof message.nodeId !== 'string') return null;
    return { protocol: previewProtocol, version: 1, type: message.type, nodeId: message.nodeId };
  }
  if (message.type === 'navigate' && (message.breakpoint === 'desktop' || message.breakpoint === 'tablet' || message.breakpoint === 'mobile')) {
    return { protocol: previewProtocol, version: 1, type: 'navigate', breakpoint: message.breakpoint };
  }
  return null;
}
