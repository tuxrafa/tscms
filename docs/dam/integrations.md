# Integrações

O conector de importação ainda não está implementado. O contrato previsto para um DAM externo é listar um lote, ler metadados e obter uma origem do binário, com paginação e checkpoint. Adobe AEM Assets, Acquia DAM, Azure Blob, S3, R2, CSV e manifesto JSON são alvos possíveis, não integrações prontas.

O storage S3 compatível, incluindo R2, é o destino dos binários do próprio DAM quando `STORAGE_DRIVER=s3`. As variáveis são `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`. Sem essa configuração, os arquivos ficam em `MEDIA_ROOT`.
