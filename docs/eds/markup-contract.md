# Contrato de markup

Uma página começa com `<main>`. Cada seção é um `div`. Conteúdo padrão fica em sequência. Um bloco é um `div` cuja primeira classe é o nome.

Filhos diretos do bloco são linhas. Filhos da linha são colunas. Variantes são classes adicionais que casam com `^[a-z][a-z0-9-]*$`.

O runtime pode acrescentar `.section`, `.block`, wrappers e `data-block-status`. Esse DOM decorado não é o HTML de origem e não é persistido.
