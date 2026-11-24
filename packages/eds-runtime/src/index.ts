/**
 * Runtime compatível com o ciclo externo observado em
 * adobe/aem-boilerplate@9a904130e124feebeee199f35eddb8fc8931488e.
 * Não é o script da Adobe e não afirma certificação.
 */

export interface RuntimeHooks {
  codeBasePath?: string;
  loadModule?: (specifier: string) => Promise<{ default?: (block: Element) => unknown }>;
  loadCSS?: (href: string) => Promise<void>;
  onDelayed?: () => void;
}

const validWrappers = new Set(['P', 'PRE', 'UL', 'OL', 'PICTURE', 'TABLE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function childDivs(element: Element): Element[] {
  return [...element.children].filter((child) => child.tagName === 'DIV');
}

export function decorateSections(main: Element): void {
  childDivs(main).forEach((section) => {
    consumeSectionMetadata(section);
    const wrappers: HTMLDivElement[] = [];
    let defaultContent = false;
    [...section.children].forEach((element) => {
      if (element.tagName === 'DIV' || !defaultContent) {
        const wrapper = section.ownerDocument.createElement('div');
        wrappers.push(wrapper);
        defaultContent = element.tagName !== 'DIV';
        if (defaultContent) wrapper.classList.add('default-content-wrapper');
      }
      wrappers[wrappers.length - 1]?.append(element);
    });
    wrappers.forEach((wrapper) => section.append(wrapper));
    section.classList.add('section');
    section.setAttribute('data-section-status', 'initialized');
    if ('style' in section) (section as HTMLElement).style.display = 'none';
  });
}

function consumeSectionMetadata(section: Element): void {
  const metadata = [...section.children].find((element) => element.classList.contains('section-metadata'));
  if (!metadata) return;
  childDivs(metadata).forEach((row) => {
    const cells = [...row.children];
    const key = cells[0]?.textContent?.trim().toLowerCase();
    const value = cells[1]?.textContent?.trim() ?? '';
    if (key === 'style') {
      value
        .split(',')
        .map((item) => item.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'))
        .filter((item) => /^[a-z][a-z0-9-]*$/.test(item))
        .forEach((item) => section.classList.add(item));
    } else if (key) {
      section.setAttribute(`data-${key}`, value);
    }
  });
  metadata.remove();
}

export function decorateBlocks(main: Element): void {
  childDivs(main)
    .filter((section) => section.classList.contains('section'))
    .forEach((section) => {
      childDivs(section).forEach((wrapper) => {
        childDivs(wrapper).forEach((block) => decorateBlock(block));
      });
    });
}

export function decorateBlock(block: Element): void {
  const shortBlockName = block.getAttribute('class')?.split(/\s+/).find(Boolean);
  if (!shortBlockName) return;
  block.classList.add('block');
  block.setAttribute('data-block-name', shortBlockName);
  block.setAttribute('data-block-status', 'initialized');
  wrapTextNodes(block);
  block.parentElement?.classList.add(`${shortBlockName}-wrapper`);
  block.closest('.section')?.classList.add(`${shortBlockName}-container`);
}

function wrapTextNodes(block: Element): void {
  childDivs(block).forEach((row) => {
    childDivs(row).forEach((column) => {
    if (!column.hasChildNodes()) return;
    const first = column.firstElementChild;
    const hasWrapper = !!first && validWrappers.has(first.tagName);
    if (!hasWrapper || (first?.tagName === 'PICTURE' && (column.children.length > 1 || !!column.textContent?.trim()))) {
      const wrapper = column.ownerDocument.createElement('p');
      wrapper.append(...column.childNodes);
      column.append(wrapper);
    }
    });
  });
}

export function decorateButtons(main: Element): void {
  main.querySelectorAll('p a[href]').forEach((anchor) => {
    if (anchor.tagName !== 'A') return;
    const paragraph = anchor.closest('p');
    if (!paragraph) return;
    const text = anchor.textContent?.trim() ?? '';
    if (anchor.querySelector('img') || paragraph.textContent?.trim() !== text) return;
    const strong = anchor.closest('strong');
    const em = anchor.closest('em');
    if (!strong && !em) return;
    paragraph.className = 'button-wrapper';
    anchor.className = 'button';
    if (strong && em) {
      anchor.classList.add('accent');
      (strong.contains(em) ? strong : em).replaceWith(anchor);
    } else if (strong) {
      anchor.classList.add('primary');
      strong.replaceWith(anchor);
    } else {
      anchor.classList.add('secondary');
      em?.replaceWith(anchor);
    }
  });
}

export function decorateMain(main: Element): void {
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}

export async function loadBlock(block: Element, hooks: RuntimeHooks = {}): Promise<void> {
  const status = block.getAttribute('data-block-status');
  if (status === 'loading' || status === 'loaded') return;
  block.setAttribute('data-block-status', 'loading');
  const blockName = block.getAttribute('data-block-name');
  if (!blockName) return;
  const base = hooks.codeBasePath ?? '';
  const css = `${base}/blocks/${blockName}/${blockName}.css`;
  const specifier = `${base}/blocks/${blockName}/${blockName}.js`;
  const loadCSS = hooks.loadCSS ?? (async () => undefined);
  const loadModule =
    hooks.loadModule ??
    ((url: string) => import(/* @vite-ignore */ url) as Promise<{ default?: (block: Element) => unknown }>);
  await Promise.all([
    loadCSS(css),
    (async () => {
      try {
        const module = await loadModule(specifier);
        if (module.default) await module.default(block);
      } catch (error) {
        console.error(`falha ao carregar ${blockName}`, error);
      }
    })(),
  ]);
  block.setAttribute('data-block-status', 'loaded');
}

export async function loadSection(section: Element, hooks: RuntimeHooks = {}): Promise<void> {
  const status = section.getAttribute('data-section-status');
  if (status && status !== 'initialized') return;
  section.setAttribute('data-section-status', 'loading');
  for (const block of section.querySelectorAll('div.block')) {
    await loadBlock(block, hooks);
  }
  section.setAttribute('data-section-status', 'loaded');
  if ('style' in section) (section as HTMLElement).style.display = '';
}

export async function loadEager(documentRef: Document, hooks: RuntimeHooks = {}): Promise<void> {
  const main = documentRef.querySelector('main');
  if (!main) return;
  decorateMain(main);
  documentRef.body.classList.add('appear');
  const first = main.querySelector('.section');
  if (first) await loadSection(first, hooks);
}

export async function loadLazy(documentRef: Document, hooks: RuntimeHooks = {}): Promise<void> {
  const main = documentRef.querySelector('main');
  if (!main) return;
  const sections = [...main.querySelectorAll('.section')].slice(1);
  for (const section of sections) await loadSection(section, hooks);
}

export function loadDelayed(hooks: RuntimeHooks = {}): void {
  hooks.onDelayed?.();
}

export async function loadPage(documentRef: Document, hooks: RuntimeHooks = {}): Promise<void> {
  await loadEager(documentRef, hooks);
  await loadLazy(documentRef, hooks);
  loadDelayed(hooks);
}
