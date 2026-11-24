# Modelo de dados

PostgreSQL guarda organizações, workspaces, sites, ambientes, usuários, memberships, papéis, content types e versões, entradas e revisões, páginas, pastas, templates, fragmentos, assets, referências, releases, taxonomia, redirects, enquetes, votos, feeds, auditoria e webhooks.

Identificadores são UUID. Slugs são separados dos IDs. Revisões são imutáveis. Estruturas flexíveis ficam em JSONB. O HTML publicado não é a fonte da verdade.

Arquivos binários ficam fora do banco, no diretório `MEDIA_ROOT` durante o desenvolvimento.
