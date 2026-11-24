# Regras de dependência

O backend não importa o Author. O núcleo não importa o renderer EDS. O modelo de conteúdo não importa um framework de tela. Publicação não importa o adaptador HTML.

Essas regras têm teste em `tests/architecture.spec.ts`. Um site de exemplo pode depender de `@tscms/delivery-sdk` e `@tscms/eds-runtime`. Não pode depender do Author.
