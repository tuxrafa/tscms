# Contas de serviço

`POST /v1/management/service-accounts` cria uma identidade `service`, com responsável humano, descrição e um grant explícito. A resposta mostra o segredo `tscms_...` uma única vez. O banco guarda o SHA-256. A credencial vale 90 dias, registra `last_used_at` e pode ser revogada em `POST /v1/management/service-accounts/:id/revoke`. Depois da revogação o mesmo segredo recebe 401.

A automação não usa a conta admin e não entra com senha. No cenário editorial, "12 Pontos Automation" cria e edita em `/noticias` e recebe 403 ao publicar, porque `pages.publish` não foi concedido.

A auditoria da página mostra `actorKind: service` na criação e `human` quando uma pessoa edita ou publica depois. O ator é o id da conta de serviço, não a palavra genérica `system`.
