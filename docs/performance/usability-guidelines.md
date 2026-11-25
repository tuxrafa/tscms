# Usability guidelines — performance invisível

A performance do Portal Studio não pode depender de o autor ser especialista em web.

## Fluxo simples

```text
Criar página → template → componentes → conteúdo → DAM → pré-visualizar → publicar
```

Tudo que for técnico (renditions, `srcset`, preload, cache) deve acontecer automaticamente.

## Mensagens

| Evitar | Preferir |
|---|---|
| "Asset exceeds recommended intrinsic dimensions relative to DPR" | "Esta imagem é maior do que o necessário. O Portal Studio pode otimizá-la sem alterar o original." |
| "Missing fetchpriority on LCP candidate" | (não mostrar — o renderer aplica sozinho) |

## Painel (futuro Author)

Resumo amigável baseado em `analyzePublicationPerformance()`:

- Imagens com texto alternativo
- Recursos críticos priorizados
- Avisos de acessibilidade / dimensões

Estados devem refletir checagens reais, nunca badges fictícios.

## Modo avançado

Controles de focal point, crop e alt permanecem. Headers, codecs e budgets ficam fora do modo simples.
