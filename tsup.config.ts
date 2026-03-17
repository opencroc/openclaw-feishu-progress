import { defineConfig } from 'tsup';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node18',
  splitting: false,
  shims: true,
  onSuccess: async () => {
    // Only publish the built frontend bundle, not the source workspace.
    const src = resolve('src/web/dist');
    const webDest = resolve('dist/web');
    const dest = resolve(webDest, 'dist');
    if (existsSync(src)) {
      rmSync(webDest, { recursive: true, force: true });
      mkdirSync(dest, { recursive: true });
      cpSync(src, dest, { recursive: true });
      console.log('Copied built web bundle to dist/web/dist/');
    }
  },
});
