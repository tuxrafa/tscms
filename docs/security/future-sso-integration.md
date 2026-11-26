# SSO, diretório e SCIM no futuro

Nenhum conector está implementado. Não há login por OpenID Connect, SAML, LDAP, Active Directory ou SCIM.

O que já fica preparado:

- `users.auth_method` distingue `local` de um método futuro. A mesma linha de usuário, com o mesmo id, conserva grupos, grants, revisões e auditoria.
- `iam_external_identities` guarda provedor, emissor, subject externo, tenant do provedor e estado do vínculo. A unicidade é do subject no provedor, não do e-mail.
- A autorização não lê o provedor. Depois de identificar a pessoa, `AuthorizationService` consulta grants e papéis internos.
- Não há vínculo automático por e-mail. Ligar uma conta externa à identidade interna precisa de um fluxo futuro, com verificação e ação de um administrador.
- Um nome de grupo vindo de um provedor não concede administrador global. Esse poder só existe na coluna `platform_admin`, alterada por outro administrador global que confirma a própria senha.

Quando um cliente sair da senha local para um provedor, o id interno permanece. O que muda é o método de autenticação, depois do vínculo ser aceito.
