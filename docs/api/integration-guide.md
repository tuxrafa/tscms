# Integração

Um site usa `tscms.site.json` sem segredo. A URL de entrega é pública. Tokens ficam em variável de ambiente.

Um aplicativo chama `@tscms/delivery-sdk` ou a OpenAPI em `/docs-json`. Não precisa do runtime EDS.

Um embed usa iframe:

```html
<iframe src="https://cms.example/v1/delivery/sites/revista/embed/fragments/promo" title="Promoção" loading="lazy"></iframe>
```

O preview usa `postMessage` com protocolo `tscms.preview` versão 1 e lista de origens. A ponte fica fora do `main`.
