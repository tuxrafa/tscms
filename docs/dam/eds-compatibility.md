# Compatibilidade com EDS

O renderer não importa o DAM. A Delivery API resolve `assetId` antes de gerar o HTML e preenche `src` e `srcset` com as renditions reais. O HTML resultante continua sendo um `<picture>` com `<source type="image/webp">` e `<img>`.

Uma imagem sem `assetId` segue o caminho antigo: o endereço gravado no documento é usado como está. Blocos que esperam uma imagem no DOM, como hero e cards, recebem esse HTML e não precisam conhecer o DAM.

Uma URL assinada e privada não é enviada para publicação. O que vai para a página é a URL pública da rendition, e somente depois que o asset foi publicado. Imagens acima da dobra continuam podendo usar o carregamento imediato já existente no bloco.
