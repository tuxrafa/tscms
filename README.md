# TSCMS

TSCMS é uma plataforma headless para criar, revisar e distribuir conteúdo. O nome é a identidade atual e pode mudar sem reescrever os contratos.

O conteúdo fica no CMS. A apresentação fica com quem consome. O design fica no repositório do site.

## O que já funciona

- Organizações, workspaces e sites isolados por permissão.
- Contas administrativas com senha e token Bearer.
- Content types, entradas, revisão, publicação, despublicação e rollback.
- Páginas, templates, content fragments e experience fragments.
- Composer com políticas e detecção de ciclo.
- Delivery API em JSON e HTML sem React.
- Enquetes públicas, RSS, busca publicada, mídia em disco e webhooks assinados.
- Author em React para login, sites, páginas, canvas e biblioteca de blocos.
- CLI que valida um site e recusa atualização silenciosa.
- Starter de site EDS com Hero, Cards e Accordion próprios.

## Limites conhecidos

- A compatibilidade EDS foi verificada contra o boilerplate `9a904130e124feebeee199f35eddb8fc8931488e` e a block collection `303bac5b9680e87e802262296a255f4a782888c9`. Não é certificação da Adobe. O `hero.js` pinado está vazio.
- O runtime Adobe pinado não trata `section-metadata`. O HTML para esse modo coloca as classes na seção.
- Revisões pinadas de fragmento ainda não são recarregadas na entrega.
- Mídia usa o disco local. As variáveis S3 estão documentadas e o cliente não está ligado.
- Jobs BullMQ existem no worker, mas a API dispara webhooks na própria requisição.
- Enquetes permitem votos repetidos. Não há CAPTCHA.
- OpenTelemetry está apenas como API, sem coletor.
- Nem todo bloco do catálogo tem decoração própria no navegador. A matriz de compatibilidade marca isso.

## Desenvolvimento

Requisitos: Node 22, pnpm 10.33, PostgreSQL 16 e Redis ou Valkey.

```bash
cp .env.example .env
pnpm install
pnpm db:migrate
pnpm --filter @tscms/api dev
pnpm --filter @tscms/author dev
```

A API fica em `http://127.0.0.1:3000` e o estúdio em `http://127.0.0.1:5173`. A documentação HTTP fica em `/docs`.

```bash
pnpm exec tsc -p tsconfig.json --noEmit
pnpm exec eslint .
pnpm exec vitest run
```

`pnpm db:seed` cria a conta de demonstração definida em `DEMO_EMAIL` e `DEMO_PASSWORD`. Essa senha é só para a máquina local.

## Site separado

```bash
pnpm --filter create-tscms-site exec tsx src/bin.ts ../meu-site
```

O comando cria um diretório novo, escreve o design inicial uma única vez e pede um Git próprio. `tscms upgrade` sem `--dry-run` não altera arquivo nenhum.
