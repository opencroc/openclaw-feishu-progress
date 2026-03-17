import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webRoot = __dirname;
const appRoot = resolve(__dirname, 'src');

export default defineConfig({
  root: webRoot,
  base: '/dist/',
  publicDir: resolve(webRoot, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@app': resolve(appRoot, 'app'),
      '@pages': resolve(appRoot, 'pages'),
      '@features': resolve(appRoot, 'features'),
      '@shared': resolve(appRoot, 'shared'),
      '@runtime': resolve(appRoot, 'runtime'),
      '@styles': resolve(appRoot, 'styles'),
    },
  },
  server: {
    host: 'localhost',
    port: 5173,
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 520,
    rollupOptions: {
      input: {
        main: resolve(webRoot, 'index.html'),
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.split('\\').join('/');

          if (normalizedId.includes('/node_modules/')) {
            if (
              normalizedId.includes('/node_modules/react/') ||
              normalizedId.includes('/node_modules/react-dom/') ||
              normalizedId.includes('/node_modules/scheduler/')
            ) {
              return 'react-vendor';
            }
            if (normalizedId.includes('/node_modules/three/')) {
              if (normalizedId.includes('/node_modules/three/examples/')) {
                return 'three-addons';
              }
              if (
                normalizedId.includes('/node_modules/three/build/') ||
                normalizedId.includes('/node_modules/three/src/')
              ) {
                return 'three-core';
              }
              return 'three-vendor';
            }
            return 'vendor';
          }

          if (
            normalizedId.includes('/src/web/src/features/office/') ||
            normalizedId.includes('/src/web/src/features/three/') ||
            normalizedId.includes('/src/web/src/pages/office/') ||
            normalizedId.includes('/src/web/src/runtime/')
          ) {
            return 'office-runtime';
          }

          if (
            normalizedId.includes('/src/web/src/app/routes') ||
            normalizedId.includes('/src/web/src/app/AppRouter') ||
            normalizedId.includes('/src/web/src/pages/studio/') ||
            normalizedId.includes('/src/web/src/features/studio/runtime/')
          ) {
            return 'studio-page';
          }

          if (
            normalizedId.includes('/src/web/src/app/routes') ||
            normalizedId.includes('/src/web/src/pages/pixel/') ||
            normalizedId.includes('/src/web/src/features/pixel/runtime/')
          ) {
            return 'pixel-page';
          }

          return undefined;
        },
      },
    },
  },
});
