# Atualizações

Atualizar o CMS é trocar a versão dos pacotes `@tscms/eds-runtime` e `@tscms/delivery-sdk` no site.

`tscms upgrade --dry-run` lista o que mudaria. Sem `--dry-run`, o comando recusa a execução. Não existe comando que sobrescreva `styles.css`, `tokens.css`, CSS de bloco ou `scripts.js`.
