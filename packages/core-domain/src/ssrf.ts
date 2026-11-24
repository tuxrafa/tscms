const blockedHosts = new Set(['localhost', 'metadata.google.internal', 'instance-data']);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  if (a === undefined || b === undefined) return false;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL inválida.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Somente HTTP e HTTPS são aceitos.');
  }
  if (url.username || url.password) throw new Error('Credenciais na URL não são aceitas.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (blockedHosts.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Destino de rede não permitido.');
  }
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
    throw new Error('Destino de rede não permitido.');
  }
  if (isPrivateIpv4(host)) throw new Error('Destino de rede não permitido.');
  return url;
}
