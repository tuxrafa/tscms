# Testes de segurança

`packages/core-domain/src/iam.spec.ts` cobre descendente contra irmão, a recusa de delegar `platform.manage`, Argon2id e a redação de segredos.

`apps/api/src/iam.spec.ts` usa PostgreSQL de teste e a API real:

- bootstrap idempotente e recusa de senha comum;
- login do administrador e falha de senha;
- site, pastas `/noticias` e `/podcasts`, grupos de autoria, publicação e administração de podcasts;
- convite, definição de senha, edição no descendente, publicação negada, pasta irmã negada e movimentação para fora do escopo negada;
- publicação por quem tem `pages.publish`;
- o mesmo `explain` do backend, com negação e concessão;
- administrador de podcasts cria autora na própria pasta, não concede `/noticias`, não cria administrador global e não se promove;
- conta de serviço cria a pauta, não publica, e o histórico distingue automação e humano;
- o token de reset e as senhas não aparecem na auditoria;
- o último administrador global não é desativado;
- desativar a autora revoga a sessão e preserva os eventos;
- outra organização recebe 403 no id da página;
- credencial revogada recebe 401.

`apps/api/src/vertical-slice.spec.ts` continua cobrindo o papel antigo de proprietária, inclusive o isolamento entre organizações. Não há suíte de navegador nesta mudança.
