# Permissões

O DAM usa o mesmo `AuthorizationService` das páginas. Os papéis antigos da organização continuam valendo no site inteiro:

- `content:read` lista assets, pastas e renditions de gestão (`assets.read`, `assets.download`).
- `media:manage` envia arquivos, cria pastas, coleções e edita metadados (`assets.upload`, `assets.edit`, `assets.manage_metadata`, `assets.manage_versions`).
- `content:publish` publica e despublica (`assets.publish`, `assets.unpublish`).

Um grant de pasta usa os códigos `assets.*` e só cobre aquela árvore. Mover um asset exige permissão na origem e no destino. O modelo completo está em `docs/security/authorization-model.md`.

Um usuário de outra organização recebe 403 ao consultar o asset pelo id do site alheio. A Delivery API só encontra o asset se ele pertencer ao site da URL e estiver publicado. O checksum duplicado é consultado apenas dentro do site, então a existência de um arquivo privado de outro tenant não é revelada.
