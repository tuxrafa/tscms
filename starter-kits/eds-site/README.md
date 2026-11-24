# Site EDS

Este diretório é um site, não o CMS. Crie um repositório Git separado para ele.

O TSCMS entrega o documento. Este repositório decide cores, tipos, CSS e o JavaScript de cada bloco. Uma atualização do CMS não substitui `styles.css`, `tokens.css` nem o CSS dos blocos.

```bash
pnpm install
pnpm tscms:validate
pnpm dev
```

`pnpm dev` busca o HTML publicado na Delivery API e serve os arquivos daqui. Não há React nesta página.
