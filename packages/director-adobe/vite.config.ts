import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const sourceRoot = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  build: {
    target: 'node22',
    ssr: true,
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        cli: `${sourceRoot}cli.ts`,
        index: `${sourceRoot}index.ts`,
      },
      output: { entryFileNames: '[name].js' },
    },
  },
});
