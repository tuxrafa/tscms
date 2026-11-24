# Agentes no TSCMS

O nome TSCMS é a identidade atual do produto. Tabelas, contratos e pacotes podem ser renomeados; a arquitetura não depende da marca.

## Direção das dependências

- `content-schema` não importa React, Nest ou EDS.
- `core-domain` não importa banco, HTTP, React ou renderer.
- `database` não importa a API nem o Author.
- `publishing` não importa `eds-compat`.
- A API pode compor HTML. O Author só chama a Management API.
- Um site vive em outro repositório. O CLI não sobrescreve CSS, blocos ou `scripts.js`.

## Verificação

```bash
pnpm install
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec eslint .
pnpm exec vitest run
```

PostgreSQL e Redis locais estão descritos no README. Os testes de API usam o banco `tscms_test`.

## Compatibilidade EDS

Os testes descrevem o comportamento observado no boilerplate pinado. Isso não é certificação da Adobe. Não copie `aem.js` para dentro do CMS e não substitua o `scripts.js` de um site.
