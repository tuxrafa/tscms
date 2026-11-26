# Administração delegada

Um grant com `delegable` e `users.invite` permite convidar pessoas para o mesmo escopo ou um descendente. O grupo Administradores de podcasts é criado assim, limitado a `/podcasts`.

Quem delega só entrega permissões da lista `delegablePermissions` e que ela mesma possui. Não entram `platform.manage`, gestão de sites, integrações, contas de serviço nem convite para outra pasta. O novo grant não nasce delegável: a pessoa convidada não ganha o poder de convidar, a menos que entre num grupo que a administração da organização marcou como delegável.

Criar ou alterar a definição de um grupo exige administração da organização. Um administrador de pasta que tenta criar um grupo chamado Administradores globais, atribuir `platform.manage` ou apontar o grant para outra pasta recebe 403. A interface esconder botões não substitui essa checagem.

Desativar a conta global de alguém que participa de outra organização fica com a administração da organização ou com o administrador global, não com o administrador da pasta.
