# Trilha de auditoria

`audit_events` é append-only na aplicação. Não há endpoint para editar ou apagar um evento, nem para o administrador global. O registro nasce na mesma operação: login, convite, grant, página, publicação e negação de acesso. A publicação grava o evento na mesma transação da revisão.

Cada evento tem id, instante, organização, site, ator, tipo de ator, ação, resultado, tipo e id do recurso, caminho naquele momento e metadados. Senhas, hashes, tokens, cookies e chaves são trocados por `[redacted]` antes de gravar. O token de reset nem chega a ser colocado no metadado.

A alteração de página guarda o que mudou (`title`, `path`, `document`) e as versões antes e depois, não o documento inteiro. O histórico da página (`GET /v1/management/sites/:siteId/pages/:pageId/history`) junta esses eventos com as revisões e o nome de quem agiu. Restaurar uma revisão cria uma versão nova pela edição normal; o passado permanece.

No Author, Auditoria filtra por organização, ação e tipo de ator. Quem tem `audit.read` só numa pasta vê eventos cujo caminho está nessa árvore. Exportar CSV exige `audit.export`, que os papéis de administração da organização já possuem. Desativar uma pessoa não apaga o histórico.

Uma tabela PostgreSQL não é imutável contra quem administra o banco. Retenção externa e trilha em armazenamento imutável ficam para uma fase posterior. O código não oferece uma forma comum de alterar o passado.
