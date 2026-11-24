# Ciclo de carregamento

`decorateMain` decora seções, blocos e botões. `loadEager` mostra a primeira seção e carrega o JavaScript e o CSS dos blocos dela. `loadLazy` faz o mesmo com o restante, header e footer. `loadDelayed` fica para o que não é necessário na primeira pintura.

O modo `runtime: tscms` aponta para o runtime deste repositório. O modo `runtime: adobe` aponta para o `aem.js` já presente no site. O CMS não substitui esse arquivo.
