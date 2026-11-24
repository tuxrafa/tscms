import { componentCatalog, globalComponents } from './catalog.js';
import type { ComponentDefinition, ComponentsManifest } from './types.js';

const all = [...componentCatalog, ...globalComponents];
const byName = new Map(all.map((item) => [item.name, item]));

export function listComponents(): ComponentDefinition[] {
  return componentCatalog;
}

export function getComponent(name: string): ComponentDefinition | undefined {
  return byName.get(name);
}

export function assertKnownComponent(name: string, manifestNames: string[] = []): void {
  if (byName.has(name) || manifestNames.includes(name)) return;
  throw new Error(`Componente ${name} não está no catálogo nem no manifesto do site.`);
}

export function classNamesFor(name: string, variant?: string, options: string[] = []): string[] {
  const definition = byName.get(name);
  const classes = [name];
  if (variant) {
    const known = definition?.variants.find((item) => item.name === variant);
    if (definition && !known) throw new Error(`Variante ${variant} não existe em ${name}.`);
    for (const className of known?.classes ?? [variant]) {
      assertClassToken(className);
      classes.push(className);
    }
  }
  for (const option of options) {
    const token = toClassName(option);
    assertClassToken(token);
    classes.push(token);
  }
  return classes;
}

export function assertClassToken(value: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new Error(`Classe inválida: ${value}`);
  }
}

export function toClassName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function manifestFromCatalog(siteId: string): ComponentsManifest {
  return {
    schemaVersion: 1,
    siteId,
    generatedAt: new Date(0).toISOString(),
    components: componentCatalog.map((item) => ({
      name: item.name,
      label: item.label,
      category: item.category,
      kind: item.kind,
      variants: item.variants,
      fields: item.fields,
    })),
  };
}

export function compatibilityMatrix() {
  return all.map((item) => ({
    name: item.name,
    origin: item.origin,
    version: item.version,
    kind: item.kind,
    compatibility: item.compatibility,
    category: item.category,
  }));
}
