# Arquitetura

O TSCMS é um monólito modular. Um processo NestJS expõe a Management API, a Delivery API e os endpoints públicos de enquete e formulário. Controllers, permissões e contratos são separados.

O documento canônico é JSON com slots, seções e nós. Ele não é HTML e não é um componente React. O compositor aplica o template, valida políticas e resolve fragmentos antes de qualquer renderer.

O adaptador EDS é um cliente desse documento. Ele produz `main`, seções e blocos com linhas e colunas. O site, em outro repositório, carrega o CSS e o `decorate(block)` de cada bloco.

Identidade, organização, workspace e site são validados no servidor em toda operação. Filtro de tela não é autorização.
