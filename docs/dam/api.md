# API

Gestão, com autenticação e permissão `media:manage` ou `content:publish` para publicar:

```http
GET    /v1/management/sites/:siteId/media
POST   /v1/management/sites/:siteId/media
GET    /v1/management/sites/:siteId/assets/:assetId
PATCH  /v1/management/sites/:siteId/assets/:assetId
POST   /v1/management/sites/:siteId/assets/:assetId/versions
POST   /v1/management/sites/:siteId/assets/:assetId/publish
POST   /v1/management/sites/:siteId/assets/:assetId/unpublish
GET    /v1/management/sites/:siteId/assets/:assetId/renditions/:preset
GET    /v1/management/sites/:siteId/asset-folders
POST   /v1/management/sites/:siteId/asset-folders
GET    /v1/management/sites/:siteId/asset-collections
POST   /v1/management/sites/:siteId/asset-collections
```

O upload é `multipart/form-data` no campo `file`. A resposta traz `{ duplicate, asset }`. Um arquivo idêntico no mesmo site devolve o asset existente, sem criar outro.

Entrega pública, somente para asset `published`:

```http
GET /v1/delivery/sites/:siteKey/assets/:id
GET /v1/delivery/sites/:siteKey/assets/:id/renditions/:preset
GET /v1/delivery/sites/:siteKey/assets/:id/versions/:version/renditions/:preset
```

A URL sem versão aponta para a versão corrente e usa cache curto. A URL com versão é imutável. Nenhuma das duas devolve credencial de storage.

Uma imagem na página pode ser:

```json
{ "assetId": "…", "alt": "Descrição", "versionPolicy": "latestPublished" }
```

`versionPolicy: "pinned"` com `version` numérico mantém a rendition daquela versão.
