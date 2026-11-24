# Multi-tenancy

A hierarquia é organização, workspace e site. Um workspace pode ter vários sites. Páginas, templates, conteúdo, fragmentos, mídia e enquetes pertencem a um site.

Papéis iniciais: owner, admin, editor, publisher e viewer. Permissões incluem gestão da organização, gestão do site, leitura, escrita, publicação, templates, mídia, enquetes e configuração.

Um membership pode restringir sites. A checagem acontece na API, com o identificador do site na rota. Soft delete não libera o slug de uma página ativa: o caminho é reescrito.
