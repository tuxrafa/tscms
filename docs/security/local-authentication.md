# Autenticação local

## Bootstrap

```bash
TSCMS_ADMIN_EMAIL=admin@example.com TSCMS_ADMIN_PASSWORD='uma frase longa' pnpm portal:bootstrap-admin
```

O comando cria o administrador global só se ainda não existir um. Usa trava de transação, grava só o hash Argon2id e registra `platform.bootstrapped`. Não há endpoint público de instalação. Senhas com menos de 12 caracteres ou presentes na lista interna de senhas comuns são recusadas. Não existe senha padrão.

## Entrada e sessão

`POST /v1/management/auth/login` aceita `email` ou `login`. A resposta traz o token para clientes de API e envia os cookies `tscms_session` (HttpOnly, Secure em produção, SameSite=Lax) e `tscms_csrf`. O Author não guarda o token no `localStorage`. Mutações feitas só com cookie exigem o cabeçalho `x-csrf-token`.

A sessão expira com `TOKEN_TTL` (12 horas por padrão). Logout, troca de senha, desativação e reset revogam as sessões no banco. Oito falhas seguidas para o mesmo identificador bloqueiam novas tentativas por 15 minutos neste processo.

## Senha

- Troca da própria senha: `POST /v1/management/auth/password` com a senha atual. As sessões anteriores caem e uma nova é aberta.
- Reset administrativo: `POST /v1/management/users/:id/password-reset` devolve um token de uso único, válido por uma hora. O administrador não vê a senha antiga. Sem SMTP, o token é entregue na resposta para repasse manual. Ele não entra na auditoria.
- Convite: o usuário nasce `invited`, sem senha escolhida por outra pessoa. `POST /v1/management/auth/invitations/accept` define a senha e ativa a conta. O link do Author é `/tscms/login?invite=...`.

Hashes antigos em scrypt continuam válidos no login. Senhas novas usam Argon2id (19 MiB, 2 iterações, paralelismo 1).
