import { defineConfig } from 'vitest/config';
import path from 'node:path';
import swc from 'unplugin-swc';

const alias = {
  '@tscms/content-schema': path.resolve('packages/content-schema/src/index.ts'),
  '@tscms/core-domain': path.resolve('packages/core-domain/src/index.ts'),
  '@tscms/api-contracts': path.resolve('packages/api-contracts/src/index.ts'),
  '@tscms/database': path.resolve('packages/database/src/index.ts'),
  '@tscms/block-registry': path.resolve('packages/block-registry/src/index.ts'),
  '@tscms/template-engine': path.resolve('packages/template-engine/src/index.ts'),
  '@tscms/fragment-resolver': path.resolve('packages/fragment-resolver/src/index.ts'),
  '@tscms/content-composer': path.resolve('packages/content-composer/src/index.ts'),
  '@tscms/publishing': path.resolve('packages/publishing/src/index.ts'),
  '@tscms/media': path.resolve('packages/media/src/index.ts'),
  '@tscms/delivery-sdk': path.resolve('packages/delivery-sdk/src/index.ts'),
  '@tscms/author-sdk': path.resolve('packages/author-sdk/src/index.ts'),
  '@tscms/eds-compat': path.resolve('packages/eds-compat/src/index.ts'),
  '@tscms/eds-runtime': path.resolve('packages/eds-runtime/src/index.ts'),
  '@tscms/renderer-contracts': path.resolve('packages/renderer-contracts/src/index.ts'),
  '@tscms/embed-sdk': path.resolve('packages/embed-sdk/src/index.ts'),
  '@tscms/performance-defaults': path.resolve('packages/performance-defaults/src/index.ts'),
  '@tscms/cli': path.resolve('packages/cli/src/index.ts'),
  '@tscms/ui': path.resolve('packages/ui/src/index.ts'),
};

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true, dynamicImport: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['packages/**/*.spec.ts', 'apps/**/*.spec.ts', 'tests/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
