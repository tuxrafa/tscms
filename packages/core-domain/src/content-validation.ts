import type { ContentTypeDefinition, FieldDefinition } from '@tscms/content-schema';

export interface FieldIssue {
  path: string;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkField(field: FieldDefinition, value: unknown, path: string, issues: FieldIssue[]): void {
  if (value === undefined || value === null || value === '') {
    if (field.required) issues.push({ path, message: 'Campo obrigatório.' });
    return;
  }
  switch (field.type) {
    case 'text':
    case 'date':
    case 'datetime':
      if (typeof value !== 'string') issues.push({ path, message: 'Texto esperado.' });
      return;
    case 'richtext':
      if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content)) {
        issues.push({ path, message: 'Rich text estruturado esperado.' });
      }
      return;
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) issues.push({ path, message: 'Inteiro esperado.' });
      return;
    case 'decimal':
      if (typeof value !== 'number' || Number.isNaN(value)) issues.push({ path, message: 'Número esperado.' });
      return;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ path, message: 'Booleano esperado.' });
      return;
    case 'enum':
      if (typeof value !== 'string' || !(field.enumValues ?? []).includes(value)) {
        issues.push({ path, message: 'Valor fora da enumeração.' });
      }
      return;
    case 'url':
    case 'email':
      if (typeof value !== 'string') {
        issues.push({ path, message: 'Texto esperado.' });
        return;
      }
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        issues.push({ path, message: 'E-mail inválido.' });
      }
      if (field.type === 'url') {
        try {
          const url = new URL(value, 'https://content.local');
          if (value.includes(':') && !['http:', 'https:', 'mailto:'].includes(url.protocol) && !value.startsWith('/')) {
            issues.push({ path, message: 'URL inválida.' });
          }
        } catch {
          issues.push({ path, message: 'URL inválida.' });
        }
      }
      return;
    case 'media':
    case 'reference':
      if (!isRecord(value) || typeof value.id !== 'string') issues.push({ path, message: 'Referência { id } esperada.' });
      return;
    case 'multiReference':
      if (!Array.isArray(value) || value.some((item) => !isRecord(item) || typeof item.id !== 'string')) {
        issues.push({ path, message: 'Lista de referências esperada.' });
      }
      return;
    case 'object':
      if (!isRecord(value)) {
        issues.push({ path, message: 'Objeto esperado.' });
        return;
      }
      for (const child of field.fields ?? []) {
        checkField(child, value[child.name], `${path}.${child.name}`, issues);
      }
      return;
    case 'array':
      if (!Array.isArray(value)) {
        issues.push({ path, message: 'Lista esperada.' });
        return;
      }
      if (field.items) {
        value.forEach((item, index) => checkField(field.items!, item, `${path}[${index}]`, issues));
      }
      return;
    case 'json':
      return;
    case 'localized':
      if (!isRecord(value)) {
        issues.push({ path, message: 'Mapa de locales esperado.' });
        return;
      }
      if (!field.of) return;
      for (const [locale, localized] of Object.entries(value)) {
        checkField({ ...field.of, required: field.required }, localized, `${path}.${locale}`, issues);
      }
      return;
    default:
      issues.push({ path, message: 'Tipo de campo desconhecido.' });
  }
}

export function validateEntryData(definition: ContentTypeDefinition, data: Record<string, unknown>): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const known = new Set(definition.fields.map((field) => field.name));
  for (const key of Object.keys(data)) {
    if (!known.has(key)) issues.push({ path: key, message: 'Campo não faz parte do modelo.' });
  }
  for (const field of definition.fields) {
    checkField(field, data[field.name], field.name, issues);
  }
  return issues;
}

export interface SchemaChange {
  breaking: boolean;
  reasons: string[];
}

function signature(field: FieldDefinition): string {
  return JSON.stringify({
    type: field.type,
    target: field.target ?? null,
    enumValues: field.enumValues ?? null,
    of: field.of ? signature(field.of) : null,
    items: field.items ? signature(field.items) : null,
  });
}

export function diffContentType(previous: ContentTypeDefinition, next: ContentTypeDefinition): SchemaChange {
  const reasons: string[] = [];
  if (previous.name !== next.name) reasons.push('O identificador do modelo mudou.');
  const previousFields = new Map(previous.fields.map((field) => [field.name, field]));
  for (const field of next.fields) {
    const before = previousFields.get(field.name);
    if (!before) continue;
    if (signature(before) !== signature(field)) {
      reasons.push(`O campo ${field.name} mudou de tipo de forma incompatível.`);
    }
    if (!before.required && field.required) {
      reasons.push(`O campo ${field.name} passou a ser obrigatório.`);
    }
  }
  for (const field of previous.fields) {
    if (!next.fields.some((candidate) => candidate.name === field.name)) {
      reasons.push(`O campo ${field.name} foi removido.`);
    }
  }
  return { breaking: reasons.length > 0, reasons };
}
