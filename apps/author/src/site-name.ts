export function normalizeSiteName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidSiteName(value: string): boolean {
  const name = normalizeSiteName(value);
  return name.length >= 2 && name.length <= 160;
}

export function confirmsSiteRemoval(typed: string, site: { name: string }): boolean {
  return normalizeSiteName(typed).toLowerCase() === normalizeSiteName(site.name).toLowerCase();
}
