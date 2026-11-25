# Portal Performance Defaults

Políticas reutilizáveis do F2W Portal Studio para que sites gerados pelo CMS nasçam rápidos, acessíveis e estáveis **sem exigir que o autor configure cache, `srcset` ou `fetchpriority`**.

Pacote: `@tscms/performance-defaults`

## Princípio

1. **12 Pontos é caso de referência**, não prova de desempenho de todos os sites.
2. Defaults são automáticos; overrides ficam para desenvolvedores de site.
3. O CMS **não sobrescreve** CSS, blocos ou `scripts.js` de repositórios de site.

## O que o default cobre

| Área | Comportamento padrão |
|---|---|
| Imagens | Renditions + `srcset`, lazy abaixo da dobra, LCP com `fetchpriority=high`, `decoding=sync`, paint imediato (`data-eager`) |
| HTML | Preload da imagem LCP no `<head>` antes do CSS bloqueante |
| Fontes | WOFF2 / subset quando o site optar; sem forçar tipografia de outro site |
| CSS / JS | Minificação e progressive enhancement no pipeline do site; o CMS não reescreve o design system |
| Cache | Hash + cache longo para estáticos imutáveis; revalidação de HTML mutável |
| Publicação | `analyzePublicationPerformance()` — checagens determinísticas (alt, dimensões, LCP candidate) |

## Budgets (orientação de lab)

Exportados em `performanceBudgets` por tipo de página (`home`, `listing`, `article`, `landing`). São tetos suaves para templates de referência, não SLA comercial.

## API principal

```ts
import {
  portalPerformanceDefaults,
  performanceBudgets,
  pictureLoadingAttrs,
  buildImagePreloadHtml,
  buildImagePreloadLinkHeader,
  analyzePublicationPerformance,
  defaultSizesForRole,
} from '@tscms/performance-defaults';
```

- `pictureLoadingAttrs(eager)` — usado por `@tscms/eds-compat` ao renderizar `<picture>`.
- `buildImagePreloadHtml` / `buildImagePreloadLinkHeader` — descoberta antecipada do LCP (HTML ou header `Link` na edge).
- `analyzePublicationPerformance(document)` — relatório amigável para o Author / pipeline (warnings não bloqueiam por padrão).

## Integração atual

- `@tscms/eds-compat` aplica loading/decoding/`data-eager` e injeta o preload LCP no HTML de página.
- `@tscms/publishing` reexporta o analyzer para o fluxo de publicação.

## O que não fazer

- Não declarar 100/100 Lighthouse como garantia universal do CMS.
- Não exigir que autores conheçam DPR, AVIF ou headers de cache.
- Não misturar otimizações específicas de um site editorial no núcleo sem contrato versionado.
