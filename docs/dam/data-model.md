# Modelo de dados

As tabelas existentes de mídia foram estendidas. Não há um segundo cadastro de arquivos.

- `assets` guarda a identidade estável, a pasta, o checksum, as dimensões, o ponto focal, o status editorial e a versão corrente.
- `asset_versions` guarda cada binário enviado. A versão anterior permanece no storage.
- `asset_variants` guarda as renditions da versão correspondente (`thumbnail`, `small`, `medium`, `large`, `xlarge`).
- `asset_folders` organiza o acervo. O caminho é só organização.
- `asset_collections` e `asset_collection_items` agrupam assets sem movê-los.

O status separa o processamento do uso público: `processing`, `ready`, `published`. Despublicar volta para `ready`. Arquivo não publicado responde 404 na Delivery API.

A deduplicação por SHA-256 vale dentro do site. Outro site, mesmo com o mesmo arquivo, não recebe a informação de que o binário existe.

A auditoria reutiliza `audit_events`. Referências de página guardam `assetId` no documento canônico, sem copiar o binário.
