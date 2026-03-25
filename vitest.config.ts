import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  cacheDir: 'node_modules/.vitest',
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/web/src/app'),
      '@pages': resolve(__dirname, 'src/web/src/pages'),
      '@features': resolve(__dirname, 'src/web/src/features'),
      '@shared': resolve(__dirname, 'src/web/src/shared'),
      '@runtime': resolve(__dirname, 'src/web/src/runtime'),
      '@styles': resolve(__dirname, 'src/web/src/styles'),
    },
  },
  test: {
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    fileParallelism: false,
  },
});
