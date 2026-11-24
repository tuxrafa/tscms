# EDS sem certificação

As referências lidas durante a implementação:

- `adobe/aem-boilerplate` em `9a904130e124feebeee199f35eddb8fc8931488e`, de 21 de novembro de 2026.
- `adobe/aem-block-collection` em `303bac5b9680e87e802262296a255f4a782888c9`, de 7 de novembro de 2026.
- Documentação pública de markup, anatomia do projeto, blocos e fragmentos em aem.live.

O runtime TSCMS reproduz o comportamento externo observado: decorar seções, decorar blocos, carregar o primeiro eager e o restante lazy, botões a partir de link com `strong` ou `em`. O `hero.js` pinado tem zero bytes. O `aem.js` pinado não consome `section-metadata`; por isso o modo Adobe recebe as classes direto na seção.

Isso não é certificação Adobe e não usa API proprietária do AEM.
