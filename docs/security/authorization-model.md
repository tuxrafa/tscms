# Modelo de autorização

`AuthorizationService.can` é exposto como `assert`, `scope` e `explain`. A decisão é negada por padrão.

```ts
const decision = await authorization.explain(user, siteId, 'pages.publish', { kind: 'page', folderId });
// { allowed, reason, matchedGrantIds }
```

Ordem:

1. Administrador global ativo.
2. Papel da organização, se o papel antigo já permitia a ação equivalente e o site está na lista da membership.
3. União dos grants da pessoa e dos grupos dela, se o escopo cobre o recurso e a permissão está no grant.

Não há negação explícita nesta fase. Falha de leitura ou conta inativa resulta em negação. A decisão não fica gravada num JWT de longa duração: cada pedido consulta o banco.

O catálogo versionado está em `packages/core-domain/src/iam.ts` (`permissionCatalogVersion`). Códigos desconhecidos e `platform.manage` dentro de um grant são recusados. Ser administrador global continua sendo a coluna protegida, não uma permissão de pasta.

`GET /v1/management/access/explain` usa essa mesma função. A razão cita o grant que liberou, sem listar políticas de outros escopos.

Páginas, publicação, movimentação e o DAM chamam esse serviço. Um papel antigo de editor continua editando o site inteiro. Uma conta só de grant não atravessa a pasta.
