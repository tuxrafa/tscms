# Começar

1. Suba PostgreSQL e Redis.
2. Copie `.env.example` para `.env`.
3. Rode `pnpm install` e `pnpm db:migrate`.
4. Inicie a API e o Author.
5. Crie uma conta no estúdio. A primeira conta vira dona da organização e do workspace Principal.
6. Crie um site, um content type e uma página.
7. Publique a página e leia o HTML em `/v1/delivery/sites/{siteKey}/pages/by-path?path=/&format=html`.

O HTML publicado não contém React. Um aplicativo pode ler o mesmo conteúdo em JSON, sem importar o Author.
