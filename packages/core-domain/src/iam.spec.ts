import { describe, expect, it } from 'vitest';
import { decideAccess, grantCovers, permissionGrantError, type GrantRef } from './iam.js';
import { hashPassword, redactSecrets, verifyPassword } from './security.js';

const parents = new Map<string, string | null>([
  ['noticias', null],
  ['eurovision', 'noticias'],
  ['podcasts', null],
]);

const news: GrantRef = {
  id: 'g-news',
  scopeType: 'page_folder',
  scopeId: 'noticias',
  includeDescendants: true,
  permissions: ['pages.read', 'pages.create', 'pages.edit'],
  label: 'Autores de notícias',
};

describe('autorização por escopo', () => {
  it('permite o descendente e nega o irmão', () => {
    expect(grantCovers(news, { kind: 'page', folderId: 'eurovision' }, parents)).toBe(true);
    expect(grantCovers(news, { kind: 'page', folderId: 'podcasts' }, parents)).toBe(false);
    const denied = decideAccess({
      platformAdmin: false,
      orgRole: 'member',
      siteAllowed: true,
      grants: [news],
      permission: 'pages.publish',
      resource: { kind: 'page', folderId: 'eurovision' },
      parents,
    });
    expect(denied.allowed).toBe(false);
    const allowed = decideAccess({
      platformAdmin: false,
      orgRole: 'member',
      siteAllowed: true,
      grants: [news],
      permission: 'pages.edit',
      resource: { kind: 'page', folderId: 'eurovision' },
      parents,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.matchedGrantIds).toEqual(['g-news']);
  });

  it('não deixa um administrador de pasta delegar poder global', () => {
    expect(permissionGrantError({ orgAdmin: false, held: ['pages.edit', 'users.invite'] }, ['platform.manage'])).toMatch(/global/i);
    expect(permissionGrantError({ orgAdmin: false, held: ['pages.edit'] }, ['pages.publish'])).toMatch(/não possui/);
    expect(permissionGrantError({ orgAdmin: true, held: [] }, ['pages.publish'])).toBeNull();
  });

  it('guarda senha com Argon2id e remove segredos do registro', async () => {
    const hash = await hashPassword('frase-longa-de-teste');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword('frase-longa-de-teste', hash)).toBe(true);
    expect(await verifyPassword('outra-frase-longa', hash)).toBe(false);
    expect(redactSecrets({ password: 'x', nested: { token: 'y', title: 'ok' } })).toEqual({
      password: '[redacted]',
      nested: { token: '[redacted]', title: 'ok' },
    });
  });
});
