# Usuários e grupos

Humanos têm status `invited`, `active`, `suspended` ou `disabled`. Automações têm `kind = service` e não entram com senha.

O Author mostra Usuários, Grupos e Auditoria. A lista de usuários traz nome, e-mail, tipo, status, grupos e papel na organização. Convidar devolve o link de uso único quando a conta é nova. Se o e-mail já existe, a pessoa é associada à organização sem a resposta listar as outras organizações dela.

Grupos personalizados são criados pela administração da organização. A tela marca ações em linguagem comum (`Ler`, `Editar`, `Publicar`) e grava os códigos do catálogo. O nome técnico aparece ao lado. Publicar não está incluído em editar.

Papéis de sistema (`owner`, `admin`, `editor`, `publisher`, `viewer`) continuam sendo o acesso amplo já existente. Um administrador que não é proprietário nem administrador global não pode promover alguém a `owner`. O último administrador global ativo não pode ser desativado. Criar outro administrador global exige a senha atual de quem já é administrador global.
