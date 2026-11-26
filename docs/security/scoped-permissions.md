# Permissões por escopo

Os escopos são `platform`, `organization`, `site`, `page_folder`, `asset_folder` e `resource`. Um grant de pasta guarda o id da pasta e `include_descendants`. A avaliação sobe pelos `parent_id` atuais. Renomear a pasta não muda o direito.

Exemplo: o grupo Autores de notícias recebe `pages.read`, `pages.create` e `pages.edit` em `/noticias`, com descendentes. A pessoa edita `/noticias/eurovision` e recebe 403 em `/podcasts`. Publicar exige `pages.publish` no mesmo escopo.

Mover uma página exige `pages.move` na origem e `pages.create` no destino. O mesmo vale para asset (`assets.move` e `assets.upload`). A listagem de páginas e de assets devolve só as pastas visíveis. Consultar um id fora do escopo responde 403, não o conteúdo.

Um fragmento ou template global continua com as permissões próprias (`fragments.*`, `templates.*`). Editar uma página que o referencia não edita o fragmento. A publicação de página continua exigindo o template vinculado já publicado.
