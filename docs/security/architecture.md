# Arquitetura de identidade e acesso

O Portal Studio separa identidade, autenticação, autorização, grupos, sessões e auditoria. Tudo isso vive na API NestJS, mas a autorização não depende de como a pessoa entrou.

- A identidade é a linha em `users`, com id imutável. E-mail e login podem mudar sem reescrever a auditoria.
- A autenticação desta fase é local: senha Argon2id para humanos e credencial de serviço para automações. A tabela `iam_external_identities` existe para um vínculo futuro, e nenhum conector grava nela.
- A autorização passa por `AuthorizationService`. Papéis antigos da organização (`owner`, `admin`, `editor`, `publisher`, `viewer`) continuam liberando o site inteiro. Contas com papel `member` só agem por grants.
- Grupos reutilizam `roles`. A associação fica em `iam_group_members`. O grant do grupo fica em `iam_access_grants`, ligado ao id da pasta, não ao texto do caminho.
- Sessões ficam em `iam_sessions`. O cookie `tscms_session` é HttpOnly. O JWT de API carrega o id da sessão e deixa de valer quando ela é revogada.
- A auditoria continua em `audit_events`, agora com resultado, tipo de ator e caminho do recurso no momento da ação.

Um administrador global é `users.platform_admin = true`. O texto do login `admin` não concede esse poder.
