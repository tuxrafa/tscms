import { describe, expect, it } from 'vitest';
import { componentCatalog } from './catalog.js';
import { classNamesFor, compatibilityMatrix } from './registry.js';

describe('catálogo de componentes', () => {
  it('cobre os 56 componentes editoriais com exemplos', () => {
    expect(componentCatalog.length).toBeGreaterThanOrEqual(56);
    const names = componentCatalog.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
    for (const item of componentCatalog) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.example).toBeTypeOf('object');
      expect(item.fields).toBeInstanceOf(Array);
    }
    expect(compatibilityMatrix().some((item) => item.name === 'hero' && item.compatibility === 'adapter')).toBe(true);
  });

  it('rejeita variante e classe inválidas', () => {
    expect(classNamesFor('hero', 'centered')).toEqual(['hero', 'centered']);
    expect(() => classNamesFor('hero', 'inexistente')).toThrow();
    expect(() => classNamesFor('cards', undefined, ['Classe Má'])).not.toThrow();
    expect(classNamesFor('cards', undefined, ['Super Wide'])).toContain('super-wide');
  });
});
