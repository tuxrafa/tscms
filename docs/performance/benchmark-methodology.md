# Benchmark methodology

Como medir performance do F2W Portal Studio sem confundir produto com um site específico.

## Separar quatro camadas

1. **Site de referência** (ex.: 12 Pontos) — otimizações editoriais + edge + assets reais.
2. **Renderer / Delivery** — HTML semântico, `<picture>`, preload LCP, contratos EDS.
3. **Templates oficiais do CMS** — budgets e defaults aplicados.
4. **Sites de terceiros** — design system e JS próprios; medir de forma independente.

Nunca apresentar o score de (1) como prova automática de (4).

## Procedimento mínimo

1. Chrome isolado (sem extensões).
2. Lighthouse desktop e mobile em relatórios separados.
3. Pelo menos 5 corridas cold-cache; registrar mediana, mín e máx.
4. Conteúdo editorial realista + imagens processadas pelo DAM.
5. Não remover funcionalidades para o teste.

## Evidência comercial

Usar apenas dados verificáveis (relatórios JSON + condições de rede/CPU). Não inventar benchmarks ou testes de usabilidade.
