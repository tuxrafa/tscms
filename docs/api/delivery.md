# Delivery API

Base: `/v1/delivery`. Leitura do que está publicado.

- `GET /sites/{siteKey}/pages/by-path?path=/&format=json|html|plain`
- `GET /sites/{siteKey}/content/{id}`
- `GET /sites/{siteKey}/collections/{name}`
- `GET /sites/{siteKey}/fragments/{id}`
- `GET /sites/{siteKey}/search?q=`
- `GET /sites/{siteKey}/feed.xml`
- `GET /sites/{siteKey}/sitemap.xml`
- `GET /sites/{siteKey}/robots.txt`

A resposta JSON traz ETag e `Cache-Control: public, max-age=60`. `If-None-Match` pode responder 304. Rascunho não aparece.

Voto e formulário ficam em `/v1/public`.
