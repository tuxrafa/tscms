import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { emptyDocument } from '@tscms/content-schema';
import { decorateMain, loadPage } from '@tscms/eds-runtime';
import { applyAutoBlocks, renderPageHtml, renderPlainMain } from './index.js';

const context = { siteKey: 'revista', publicBaseUrl: 'http://127.0.0.1:3000', runtime: 'tscms' as const };

describe('imagens', () => {
  it('carrega lazy por padrão e só antecipa com a opção do componente', () => {
    const document = emptyDocument({ id: 'fotos', type: 'page', title: 'Fotos' });
    document.slots.main = {
      sections: [
        {
          id: 's1',
          children: [
            { id: 'capa', type: 'block', name: 'hero', data: { title: 'Capa', image: { src: '/media/capa.webp', alt: 'Capa' } } },
            { id: 'foto', type: 'defaultContent', element: 'image', data: { src: '/media/foto.jpg', alt: 'Foto' } },
            { id: 'agora', type: 'defaultContent', element: 'image', data: { src: '/media/agora.jpg', alt: 'Agora', eager: true } },
          ],
        },
        {
          id: 's2',
          children: [
            { id: 'hero-eager', type: 'block', name: 'hero', options: ['eager'], data: { title: 'Já', image: { src: '/media/ja.webp', alt: 'Já' } } },
            { id: 'cards', type: 'block', name: 'cards', data: { eager: true, cards: [{ title: 'Card', image: { src: '/media/card.webp', alt: 'Card' } }] } },
          ],
        },
      ],
    };
    const html = renderPlainMain(document, context);
    expect(html).toContain('<img src="/media/capa.webp" alt="Capa" loading="lazy"');
    expect(html).toContain('<img src="/media/foto.jpg" alt="Foto" loading="lazy"');
    expect(html).toContain('<img src="/media/agora.jpg" alt="Agora" loading="eager" fetchpriority="high"');
    expect(html).toContain('<img src="/media/ja.webp" alt="Já" loading="eager" fetchpriority="high"');
    expect(html).toContain('<img src="/media/card.webp" alt="Card" loading="eager" fetchpriority="high"');
    for (const url of ['/media/capa.webp', '/media/foto.jpg', '/media/card.webp']) {
      expect(html).toContain(`media="(max-width: 480px)" srcset="${url}"`);
      expect(html).toContain(`media="(max-width: 768px)" srcset="${url}"`);
      expect(html).toContain(`media="(max-width: 1200px)" srcset="${url}"`);
      expect(html).toContain(`media="(min-width: 1201px)" srcset="${url}"`);
    }
    expect(html).toContain('asset-picture-shimmer');
  });

  it('escolhe a rendition pela tela e usa a miniatura como placeholder', () => {
    const document = emptyDocument({ id: 'hero', type: 'page', title: 'Hero' });
    document.slots.main?.sections[0]?.children.push({
      id: 'foto',
      type: 'defaultContent',
      element: 'image',
      data: {
        alt: 'Capa',
        src: '/a/large.webp',
        srcset: '/a/thumbnail.webp 200w, /a/small.webp 480w, /a/medium.webp 768w, /a/large.webp 1200w, /a/xlarge.webp 1920w',
      },
    });
    const html = renderPlainMain(document, context);
    expect(html).toContain('media="(max-width: 480px)" srcset="/a/small.webp"');
    expect(html).toContain('media="(max-width: 768px)" srcset="/a/medium.webp"');
    expect(html).toContain('media="(max-width: 1200px)" srcset="/a/large.webp"');
    expect(html).toContain('media="(min-width: 1201px)" srcset="/a/xlarge.webp"');
    expect(html).toContain('<img src="/a/xlarge.webp" alt="Capa" loading="lazy"');
    expect(html).toContain("--asset-preview:url('/a/thumbnail.webp')");
  });
});

describe('basePath no HTML', () => {
  it('prefixa assets e feed quando basePath está definido', () => {
    const document = emptyDocument({ id: 'home', type: 'page', title: 'Home' });
    document.metadata = { title: 'Home', language: 'pt-BR' };
    const html = renderPageHtml(document, { ...context, basePath: '/12pontos' });
    expect(html).toContain('href="/12pontos/styles/styles.css"');
    expect(html).toContain('src="/12pontos/scripts/scripts.js"');
    expect(html).toContain('href="/12pontos/feed.xml"');
    expect(html).toContain('content="/12pontos/nav"');
  });
});

describe('HTML compatível com EDS', () => {
  it('gera default content sem transformar títulos em blocos e escapa HTML', () => {
    const document = emptyDocument({ id: 'pagina', type: 'page', title: 'Minha página' });
    document.slots.main?.sections[0]?.children.push(
      { id: 'h', type: 'defaultContent', element: 'heading', data: { text: 'Minha <página>', level: 1 } },
      { id: 'p', type: 'defaultContent', element: 'text', data: { body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Parágrafo introdutório.' }] }] } } },
      { id: 'b', type: 'defaultContent', element: 'button', data: { label: 'Contato', href: '/contato', variant: 'primary' } },
    );
    const html = renderPlainMain(document, context);
    expect(html).toContain('<h1>Minha &lt;página&gt;</h1>');
    expect(html).toContain('<p>Parágrafo introdutório.</p>');
    expect(html).toContain('<strong><a href="/contato">Contato</a></strong>');
    expect(html).not.toContain('class="heading"');
  });

  it('produz rows e columns para hero, cards, columns e accordion', () => {
    const document = emptyDocument({ id: 'home', type: 'page', title: 'Home' });
    document.metadata = { title: 'Home', description: 'Descrição', language: 'pt-BR', template: 'home', theme: 'neutral' };
    document.slots.main = {
      sections: [
        {
          id: 's1',
          metadata: { style: ['highlight'] },
          children: [
            { id: 'hero', type: 'block', name: 'hero', variant: 'centered', data: { title: 'Nosso site', description: 'Exemplo', image: { src: '/media/hero.webp', alt: 'Capa' }, primaryLabel: 'Começar', primaryHref: '/start' } },
          ],
        },
        {
          id: 's2',
          children: [
            { id: 'cards', type: 'block', name: 'cards', data: { cards: [{ title: 'Card A', text: 'Descrição do card.', image: { src: '/media/a.webp', alt: 'A' } }] } },
            { id: 'columns', type: 'block', name: 'columns', options: ['wide'], data: { columns: ['Um', 'Dois'] } },
            { id: 'accordion', type: 'block', name: 'accordion', data: { items: [{ title: 'Pergunta', body: 'Resposta' }] } },
          ],
        },
      ],
    };
    const html = renderPageHtml(document, context);
    expect(html).toContain('<meta name="description" content="Descrição">');
    expect(html).toContain('<meta name="template" content="home">');
    expect(html).toContain('class="highlight"');
    expect(html).toContain('class="hero centered"');
    expect(html).toContain('class="cards"');
    expect(html).toContain('class="columns wide"');
    expect(html).toContain('class="accordion"');
    const { document: dom } = parseHTML(html);
    const main = dom.querySelector('main');
    expect(main).toBeTruthy();
    decorateMain(main!);
    const hero = main!.querySelector('.hero');
    expect(hero?.classList.contains('block')).toBe(true);
    expect(hero?.getAttribute('data-block-name')).toBe('hero');
    expect(hero?.parentElement?.classList.contains('hero-wrapper')).toBe(true);
    expect(main!.querySelector('.section.highlight')).toBeTruthy();
    expect(main!.querySelector('.cards .cards-card-body')).toBeNull();
    const cards = main!.querySelector('.cards');
    if (!cards) throw new Error('cards ausente');
    decorateCards(cards);
    expect(cards.querySelector('.cards-card-image')).toBeTruthy();
    expect(cards.querySelector('.cards-card-body h3')?.textContent).toBe('Card A');
    const accordion = main!.querySelector('.accordion');
    if (!accordion) throw new Error('accordion ausente');
    decorateAccordion(accordion);
    expect(accordion.querySelector('details.accordion-item summary')?.textContent).toContain('Pergunta');
    const button = main!.querySelector('a.button.primary');
    expect(button?.textContent).toBe('Começar');
  });

  it('não altera o documento canônico ao aplicar auto-blocking', () => {
    const document = emptyDocument({ id: 'auto', type: 'page', title: 'Auto' });
    document.slots.main?.sections[0]?.children.push({
      id: 'link',
      type: 'defaultContent',
      element: 'text',
      data: { body: { type: 'doc', content: [{ type: 'paragraph', children: [{ type: 'link', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', text: 'vídeo' }] }] } },
    });
    const before = JSON.stringify(document);
    const derived = applyAutoBlocks(document, ['video-link']);
    expect(JSON.stringify(document)).toBe(before);
    expect(derived.slots.main?.sections[0]?.children[0]).toMatchObject({ type: 'block', name: 'video' });
  });

  it('carrega o primeiro section na fase eager e o restante na lazy', async () => {
    const html = `<!DOCTYPE html><html><head></head><body><header></header><main><div><h1>Topo</h1><div class="hero"><div><div><p>A</p></div></div></div></div><div><div class="cards"><div><div><p>B</p></div></div></div></div></main><footer></footer></body></html>`;
    const { document } = parseHTML(html);
    const loaded: string[] = [];
    await loadPage(document, {
      loadModule: async (specifier) => {
        loaded.push(specifier);
        return { default: () => undefined };
      },
      loadCSS: async () => undefined,
    });
    expect(loaded.join('|')).toContain('/blocks/hero/hero.js');
    expect(loaded.some((item) => item.includes('/blocks/cards/cards.js'))).toBe(true);
    expect(document.querySelector('.hero')?.getAttribute('data-block-status')).toBe('loaded');
    expect(document.body.classList.contains('appear')).toBe(true);
  });
});

function decorateCards(block: Element) {
  const ul = block.ownerDocument.createElement('ul');
  [...block.children].forEach((row) => {
    const li = block.ownerDocument.createElement('li');
    while (row.firstElementChild) li.append(row.firstElementChild);
    [...li.children].forEach((div) => {
      if (div.children.length === 1 && div.querySelector('picture')) div.className = 'cards-card-image';
      else div.className = 'cards-card-body';
    });
    ul.append(li);
  });
  block.replaceChildren(ul);
}

function decorateAccordion(block: Element) {
  [...block.children].forEach((row) => {
    const label = row.children[0];
    const body = row.children[1];
    if (!label || !body) return;
    const summary = block.ownerDocument.createElement('summary');
    summary.className = 'accordion-item-label';
    summary.append(...label.childNodes);
    body.className = 'accordion-item-body';
    const details = block.ownerDocument.createElement('details');
    details.className = 'accordion-item';
    details.append(summary, body);
    row.replaceWith(details);
  });
}
