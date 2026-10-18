import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const sha = (process.env.GIT_SHA ?? 'dev').slice(0, 7);
export const APP_VERSION = `${pkg.version}+${sha}`;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: 'public',
  // The client is written against the React 19 API (types from @types/react) but ships
  // Preact via preact/compat to stay inside the 80 KB gzip JS budget (SPEC §1.10).
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  resolve: {
    alias: [
      { find: /^react\/jsx-(dev-)?runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react$/, replacement: 'preact/compat' },
    ],
  },
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false },
      '/healthz': { target: 'http://127.0.0.1:3000' },
    },
  },
  preview: { port: 4173 },
});
