import { describe, expect, it } from 'vitest';
import { confirmsSiteRemoval, isValidSiteName, normalizeSiteName } from './site-name';

describe('cartão de site', () => {
  it('normaliza e valida o nome ao renomear', () => {
    expect(normalizeSiteName('  12   Pontos  ')).toBe('12 Pontos');
    expect(isValidSiteName('12 Pontos')).toBe(true);
    expect(isValidSiteName(' a ')).toBe(false);
    expect(isValidSiteName('x'.repeat(161))).toBe(false);
  });

  it('exige o nome do site para confirmar a remoção', () => {
    expect(confirmsSiteRemoval('12 pontos', { name: '12 Pontos' })).toBe(true);
    expect(confirmsSiteRemoval(' 12  Pontos ', { name: '12 Pontos' })).toBe(true);
    expect(confirmsSiteRemoval('', { name: '12 Pontos' })).toBe(false);
    expect(confirmsSiteRemoval('outro', { name: '12 Pontos' })).toBe(false);
  });
});
