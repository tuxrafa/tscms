# Autenticação

O registro cria usuário, organização, papéis de sistema, membership de owner e o workspace Principal. A senha é guardada com scrypt. O token é JWT HS256 no header `Authorization: Bearer`.

Não há cookie de sessão do Author na entrega pública. Credencial de API e rotação ficam como próximo incremento; o segredo de webhook é devolvido na criação e não vai para o JavaScript público.
