import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: apiRoot,
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    sequence: { concurrent: false },
    // All files share one database; running them one at a time keeps list totals and pages stable.
    fileParallelism: false,
  },
  resolve: { alias: { '@api': path.join(apiRoot, 'src') } },
});
