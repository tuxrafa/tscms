# Desenvolvimento do site

O site tem `blocks/<nome>/<nome>.js`, o CSS ao lado e, se quiser, `<nome>.author.json`. O JavaScript exporta `decorate(block)`.

`tscms site validate` confere a configuração e esse export. `tscms components sync` grava `dist/components.manifest.json`. Sem token, o manifesto não sai do site.

Depois da criação, o repositório do site é independente. Alterar o design não altera o CMS. Publicar conteúdo não exige novo deploy quando a página é lida pela Delivery API.
