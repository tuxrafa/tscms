# Monorepo

`apps/api` é o servidor. `apps/author` é o estúdio. `apps/worker` processa a fila de webhooks. `apps/reference-renderer` serve o HTML com os arquivos de um site e uma ponte de preview fora do `main`.

`packages/core-domain` concentra regras sem I/O. `packages/content-schema` concentra os contratos Zod. `packages/database` concentra o Drizzle. Os SDKs de entrega, autoria e embed são clientes.

O starter em `starter-kits/eds-site` é copiado uma vez pelo `create-tscms-site`. Depois disso, o site evolui pelo próprio Git e por dependências semver.
