import {
  type CanonicalDocument,
  type ContentNode,
  type EditableTemplate,
  type SlotPolicy,
  emptyDocument,
} from '@tscms/content-schema';

export interface TemplateImpact {
  compatible: boolean;
  reasons: string[];
}

export function applyTemplate(template: EditableTemplate, page: CanonicalDocument): CanonicalDocument {
  const locked = collectLocked(template.initial, template.policies);
  const next = structuredClone(page);
  for (const [slotName, slot] of Object.entries(locked.slots)) {
    const pageSlot = next.slots[slotName] ?? { sections: [] };
    const editableSections = pageSlot.sections.filter((section) => !section.id.startsWith('locked-'));
    next.slots[slotName] = {
      sections: [...slot.sections, ...editableSections],
    };
  }
  next.templateId = page.templateId;
  return next;
}

function collectLocked(document: CanonicalDocument, policies: SlotPolicy[]): CanonicalDocument {
  const lockedIds = new Set(policies.filter((policy) => policy.policy === 'locked' || policy.policy === 'shared').map((policy) => policy.id));
  if (lockedIds.size === 0) {
    return { ...document, slots: {} };
  }
  const slots = Object.fromEntries(
    Object.entries(document.slots)
      .filter(([name]) => lockedIds.has(name))
      .map(([name, slot]) => [name, { sections: slot.sections.map((section) => ({ ...section, id: `locked-${section.id}` })) }]),
  );
  return { ...document, slots };
}

export function validatePolicies(template: EditableTemplate, page: CanonicalDocument): string[] {
  const issues: string[] = [];
  for (const policy of template.policies) {
    const slot = page.slots[policy.id];
    const count = slot?.sections.reduce((total, section) => total + section.children.length, 0) ?? 0;
    if (policy.required && count === 0) issues.push(`O slot ${policy.name} é obrigatório.`);
    if (policy.minItems !== undefined && count < policy.minItems) issues.push(`O slot ${policy.name} está abaixo do mínimo.`);
    if (policy.maxItems !== undefined && count > policy.maxItems) issues.push(`O slot ${policy.name} ultrapassa o máximo.`);
    if (!policy.editable && slot) {
      const initial = template.initial.slots[policy.id];
      if (JSON.stringify(initial) !== JSON.stringify(slot)) {
        issues.push(`O slot ${policy.name} está bloqueado e foi alterado.`);
      }
    }
    for (const section of slot?.sections ?? []) {
      for (const node of section.children) {
        if (node.type === 'block' && policy.allowedBlocks.length > 0 && !policy.allowedBlocks.includes(node.name) && !policy.allowedBlocks.includes('*')) {
          issues.push(`O bloco ${node.name} não é permitido em ${policy.name}.`);
        }
      }
    }
  }
  return issues;
}

export function diffTemplate(previous: EditableTemplate, next: EditableTemplate): TemplateImpact {
  const reasons: string[] = [];
  const before = new Map(previous.policies.map((policy) => [policy.id, policy]));
  for (const policy of next.policies) {
    const old = before.get(policy.id);
    if (!old) continue;
    const removed = old.allowedBlocks.filter((name) => !policy.allowedBlocks.includes(name) && !policy.allowedBlocks.includes('*'));
    if (removed.length > 0) reasons.push(`O slot ${policy.name} deixou de permitir: ${removed.join(', ')}.`);
    if ((policy.maxItems ?? Infinity) < (old.maxItems ?? Infinity)) {
      reasons.push(`O slot ${policy.name} reduziu o máximo de itens.`);
    }
  }
  for (const policy of previous.policies) {
    if (!next.policies.some((item) => item.id === policy.id)) reasons.push(`O slot ${policy.name} foi removido.`);
  }
  return { compatible: reasons.length === 0, reasons };
}

function node(id: string, name: string, data: Record<string, unknown>): ContentNode {
  return { id, type: 'block', name, data };
}

function page(id: string, title: string, children: ContentNode[]): CanonicalDocument {
  const document = emptyDocument({ id, type: 'template', title });
  document.slots.main = { sections: [{ id: 'section-main', children }] };
  return document;
}

export function blueprintTemplates(): Array<{ key: string; name: string; description: string; template: EditableTemplate }> {
  const article = page('template-article', 'Artigo', [
    node('breadcrumbs', 'breadcrumbs', { items: [] }),
    { id: 'title', type: 'defaultContent', element: 'heading', data: { text: 'Título do artigo', level: 1 } },
    node('image', 'image', { alt: '' }),
  ]);
  article.slots.body = { sections: [{ id: 'section-body', children: [] }] };
  article.slots.footer = {
    sections: [{ id: 'section-related', children: [node('related', 'related-posts', { contentType: 'article' })] }],
  };
  return [
    { key: 'home', name: 'Home', description: 'Abertura institucional.', template: template('template-home', 'Home', ['hero', 'logo-cloud', 'cards', 'split-content', 'testimonial-cards', 'faq', 'cta']) },
    { key: 'landing', name: 'Landing page', description: 'Página de campanha.', template: template('template-landing', 'Landing', ['hero', 'feature-cards', 'steps', 'testimonial-cards', 'pricing-cards', 'faq', 'form']) },
    { key: 'blog-listing', name: 'Lista do blog', description: 'Índice editorial.', template: template('template-blog', 'Blog', ['featured-posts', 'blog-listing', 'tags', 'newsletter']) },
    {
      key: 'article',
      name: 'Artigo',
      description: 'Matéria com corpo editável.',
      template: {
        schemaVersion: 1,
        policies: [
          { id: 'main', name: 'Cabeçalho', allowedBlocks: ['breadcrumbs', 'image', 'author-profile'], policy: 'initial', editable: true, reorderable: false },
          { id: 'body', name: 'Corpo', allowedBlocks: ['*'], policy: 'editable', editable: true, reorderable: true, required: true, minItems: 1 },
          { id: 'footer', name: 'Relacionados', allowedBlocks: ['related-posts'], policy: 'locked', editable: false, reorderable: false },
        ],
        initial: article,
      },
    },
    { key: 'institutional', name: 'Institucional', description: 'Página sobre a organização.', template: template('template-about', 'Institucional', ['hero', 'split-content', 'team-cards', 'statistics', 'cta']) },
    { key: 'contact', name: 'Contato', description: 'Contato e mapa.', template: template('template-contact', 'Contato', ['contact-information', 'form', 'map']) },
    { key: 'pricing', name: 'Preços', description: 'Comparação editorial de planos.', template: template('template-pricing', 'Preços', ['hero', 'pricing-cards', 'comparison-table', 'faq', 'cta']) },
  ];
}

function template(id: string, title: string, blocks: string[]): EditableTemplate {
  return {
    schemaVersion: 1,
    policies: [{ id: 'main', name: 'Principal', allowedBlocks: ['*'], policy: 'editable', editable: true, reorderable: true }],
    initial: page(id, title, blocks.map((name, index) => node(`${name}-${index}`, name, {}))),
  };
}
