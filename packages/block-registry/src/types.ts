import type { FieldDefinition } from '@tscms/content-schema';

export type ComponentKind = 'default-content' | 'eds-block' | 'widget' | 'structural' | 'fragment';
export type CompatibilityState = 'native' | 'adapter' | 'manual' | 'unsupported';

export interface ComponentVariant {
  name: string;
  label: string;
  classes: string[];
}

export interface ComponentDefinition {
  name: string;
  label: string;
  category: string;
  description: string;
  kind: ComponentKind;
  compatibility: CompatibilityState;
  origin: string;
  version: string;
  variants: ComponentVariant[];
  fields: FieldDefinition[];
  example: Record<string, unknown>;
  nesting: 'none' | 'default-content';
  preview: 'structural' | 'site-iframe';
}

export interface ComponentsManifest {
  schemaVersion: 1;
  siteId: string;
  generatedAt: string;
  components: Array<Pick<ComponentDefinition, 'name' | 'label' | 'category' | 'kind' | 'variants' | 'fields'>>;
}
