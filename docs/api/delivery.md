# Delivery API

Base: `/v1/delivery`. Leitura do que está publicado.

- `GET /sites/{siteKey}/pages/by-path?path=/&format=json|html|plain`
- `GET /sites/{siteKey}/content/{id}`
- `GET /sites/{siteKey}/collections/{name}`
- `GET /sites/{siteKey}/fragments/{id}?format=json|html`
- `GET /sites/{siteKey}/search?q=`
- `GET /sites/{siteKey}/feed.xml`
- `GET /sites/{siteKey}/sitemap.xml`
- `GET /sites/{siteKey}/robots.txt`

A resposta JSON traz ETag e `Cache-Control: public, max-age=60`. `If-None-Match` pode responder 304. Rascunho não aparece.

## Fragmentos e chrome do site

`GET /sites/{siteKey}/fragments/{id}` devolve o fragmento publicado. Em fragmentos de experiência, `format=html` acrescenta `html` e `etag` com o markup já composto e renderizado, para apps de terceiros usarem o mesmo cabeçalho, rodapé e textos fixos que o site.

O site pode declarar fragmentos de chrome em `config.chrome`:

```json
{ "chrome": { "headerFragmentId": "<uuid>", "footerFragmentId": "<uuid>" } }
```

Páginas sem slot `header` ou `footer` recebem uma referência `linked` a esses fragmentos na entrega (`pages/by-path`), sem alterar o documento salvo. Uma página que declare o slot vazio (`{ "sections": [] }`) não recebe o chrome. As seções formadas só por blocos `site-header` ou `site-footer` são renderizadas sem o `<div>` de seção.

Voto e formulário ficam em `/v1/public`.
