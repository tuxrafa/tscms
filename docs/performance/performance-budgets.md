# Performance budgets

Budgets padrão do F2W Portal Studio (`performanceBudgets` em `@tscms/performance-defaults`).

Valores são **orientação de lab** para templates de referência. Sites personalizados devem medir as próprias páginas.

| Tipo | JS inicial (KiB) | CSS crítico (KiB) | Fontes (KiB) | Imagens above-fold (KiB) | LCP (ms) | CLS | TBT (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| home | 80 | 24 | 80 | 120 | 800 | 0.05 | 50 |
| listing | 80 | 24 | 80 | 150 | 900 | 0.05 | 50 |
| article | 60 | 20 | 80 | 180 | 1000 | 0.05 | 50 |
| landing | 100 | 32 | 100 | 200 | 1000 | 0.08 | 80 |

## Como usar

- Templates oficiais do Studio devem buscar ficar dentro desses tetos.
- O Publication Performance Analyzer usa os budgets só como contexto em mensagens informativas.
- Não bloquear publicação por estouro de budget de baixa gravidade.
