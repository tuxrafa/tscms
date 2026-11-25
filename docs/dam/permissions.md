# Permissões

O DAM usa o RBAC que já existe.

- `content:read` lista assets, pastas e renditions de gestão.
- `media:manage` envia arquivos, cria pastas, coleções e edita metadados.
- `content:publish` publica e despublica.

Um usuário de outra organização recebe 403 ao consultar o asset pelo id do site alheio. A Delivery API só encontra o asset se ele pertencer ao site da URL e estiver publicado. O checksum duplicado é consultado apenas dentro do site, então a existência de um arquivo privado de outro tenant não é revelada.
