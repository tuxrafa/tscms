# Metadados

Os metadados técnicos extraídos no upload são tipo, tamanho, checksum, largura e altura. Eles ficam nas colunas do asset e da versão.

Os metadados editáveis são título, descrição, texto alternativo, copyright, tags e ponto focal. Uma nova extração não regrava esses campos: a substituição de arquivo atualiza o binário, o checksum e as dimensões, e preserva o título e a descrição já salvos.

O ponto focal é uma instrução, com coordenadas de 0 a 1. Ele não recorta o original. Schemas de campos personalizados por organização, site ou pasta ainda não têm editor; os valores previstos continuam sendo JSONB quando essa parte for adicionada.
