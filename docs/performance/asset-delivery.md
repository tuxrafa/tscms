# Asset delivery defaults

Como o DAM e o renderer cooperam sob Portal Performance Defaults.

## Upload → publicação

1. Autor envia o original (até 20 MB; tipos permitidos).
2. Sharp gera renditions WebP (`thumbnail` … `xlarge`) sem ampliar.
3. Delivery expõe URLs públicas por preset / versão.
4. Páginas com `assetId` recebem `src` + `srcset` antes do HTML.
5. `@tscms/eds-compat` renderiza `<picture>` com faixas de tela.
6. Candidatas eager recebem prioridade LCP + preload no head.

## O autor vê

- Enquadramento / ponto focal (quando disponível)
- Texto alternativo
- Legenda

## O autor não precisa configurar

- `srcset` / `sizes`
- `fetchpriority` / `decoding`
- Headers `Link` / cache imutável
- AVIF vs WebP (formato das renditions atuais: WebP)

## Edge (opcional)

Sites podem espelhar `buildImagePreloadLinkHeader()` num `Link` HTTP na edge. Isso é configuração de hosting, não parte obrigatória do Author.
