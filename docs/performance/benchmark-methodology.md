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

## Isolamento de extensões (obrigatório)

Relatórios do DevTools / extensão Lighthouse no Chrome do autor frequentemente incluem `chrome-extension://` em `third-parties-insight` e inflacionam TBT / long tasks.

Antes de alterar código por TBT:

1. Rodar Lighthouse CLI (ou equivalente) com `--user-data-dir` temporário e `--disable-extensions`.
2. Confirmar no JSON: **zero** URLs `chrome-extension://` em `network-requests`.
3. Comparar mediana de 5+ corridas limpas com o relatório contaminado.
4. **Não** estimar a nota final subtraindo main-thread de extensões do TBT.
5. Se a mediana limpa já atingir a meta (ex.: Performance 100 com TBT 0), **não** introduzir mudanças especulativas no site ou no CMS.

Referência de caso (12 Pontos, 2026-11-25): relatório do usuário mobile Performance 94 / TBT 265,5 ms com AdBlock (~77 ms) + outras extensões; ambiente limpo → TBT 0 e mediana Performance 100 sem patch de produção.

## Evidência comercial

Usar apenas dados verificáveis (relatórios JSON + condições de rede/CPU). Não inventar benchmarks ou testes de usabilidade.
Em demos comerciais do F2W Portal Studio, sempre declarar o ambiente limpo (sem extensões) e publicar mediana — nunca uma única corrida cherry-picked.
