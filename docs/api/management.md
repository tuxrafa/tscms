# Management API

Base: `/v1/management`. Exige Bearer, exceto registro e login.

Cobre organizações, workspaces, sites, content types, entradas, templates, pastas, árvore de páginas, fragmentos, enquetes, mídia, redirects, feeds e webhooks.

Erros seguem `{ error: { code, message, details } }`. Conflito de versão otimista responde 409. A lista usa `{ data, page }` quando a coleção é paginada.

O Author consome esta API. Não acessa o PostgreSQL.
