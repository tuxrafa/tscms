# Compatibilidade com EDS

O renderer não importa o DAM. A Delivery API resolve `assetId` antes de gerar o HTML e preenche as renditions. Cada componente de imagem vira um `<picture>` com um `<source>` por faixa de tela: até 480 px, até 768 px, até 1200 px e acima disso. A imagem usa `loading="lazy"`, salvo quando o bloco pede carregamento imediato.

Enquanto o arquivo não carrega, o quadro pulsa. Se existe uma miniatura diferente, ela aparece desfocada nesse quadro. Sem renditions, a URL disponível é repetida em todas as faixas e o quadro usa um brilho animado, sem baixar o arquivo duas vezes.

Blocos que esperam uma imagem no DOM, como hero e cards, recebem esse HTML e não precisam conhecer o DAM.

Uma URL assinada e privada não é enviada para publicação. O que vai para a página é a URL pública da rendition, e somente depois que o asset foi publicado. Imagens acima da dobra continuam podendo usar o carregamento imediato já existente no bloco.
