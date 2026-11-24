/**
 * Identidade atual do produto. A arquitetura lê estes metadados
 * em vez de espalhar a marca por nomes de tabela, contratos ou pastas internas.
 * Uma renomeação futura altera este módulo, o escopo npm e a documentação.
 */
export const product = {
  code: 'tscms',
  displayName: 'TSCMS',
  packageScope: '@tscms',
  schemaNamespace: 'https://schemas.tscms.local',
  localeDefault: 'pt-BR',
  supportedAuthorLocales: ['pt-BR', 'en'] as const,
} as const;

export const siteConfigSchemaId = `${product.schemaNamespace}/site-v1.json`;
