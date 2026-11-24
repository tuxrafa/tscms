# Fragmentos

Há quatro ideias diferentes:

- Content fragment: dados estruturados, sem layout.
- Experience fragment: composição reutilizável de blocos.
- Referência no documento: `linked`, `pinned` ou `detached`.
- Bloco EDS `fragment`: busca `caminho.plain.html` no runtime do site.

O compositor recusa ciclo. Referência destacada não é expandida. Header e footer globais continuam sendo fragmentos do site, apontados pelas metas `nav` e `footer`.
