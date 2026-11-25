# DAM

O DAM faz parte do CMS. Ele não é uma biblioteca isolada e não depende do Author nem do renderer EDS.

Há duas camadas:

- O repositório de assets fica no PostgreSQL: identidade, pasta, metadados, versões, renditions, coleções e auditoria.
- Os binários ficam fora do banco, atrás de um `StorageProvider`. O padrão é o sistema de arquivos local (`MEDIA_ROOT`). Um provedor S3 compatível, inclusive Cloudflare R2, entra quando `STORAGE_DRIVER=s3` estiver configurado. Segredos de storage não são gravados no asset nem enviados ao navegador.

O fluxo que já funciona de ponta a ponta:

1. O Author pede o upload em `POST /v1/management/sites/:siteId/media`.
2. A API valida o conteúdo pelo MIME real, calcula o SHA-256 e recusa SVG.
3. O original é gravado em `site/asset/vN/original`.
4. Imagens estáticas geram renditions WebP com Sharp, sem ampliar além do original.
5. O asset fica `ready` e só passa a ser público depois de `publish`.
6. A Delivery API entrega metadados e a rendition.
7. Uma página que referencia `assetId` é renderizada com `<picture>` e `srcset`.
8. `versionPolicy: "pinned"` preserva a versão escolhida. Sem isso, a página acompanha a versão publicada atual.

Versões antigas não são sobrescritas. Mover o asset de pasta não muda o id nem a chave do arquivo.

Ainda não fazem parte deste corte: fila BullMQ para o processamento, upload resumível, vídeo, áudio, prévia de PDF, schemas de metadados editáveis, conectores de DAM externo e transformação sob demanda. O processamento da imagem acontece na requisição de upload para que o arquivo já volte com miniatura.
