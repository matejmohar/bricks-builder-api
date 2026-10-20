import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'BricksBuilderAPI',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'es' ? 'index.js' : 'bricks-builder-api.iife.js'),
    },
  },
});
