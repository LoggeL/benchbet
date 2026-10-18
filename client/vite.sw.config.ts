// Zweiter Build: Service Worker als klassisches Script (iife) → dist/client/sw.js (SPEC §4.3).
// Liest das Manifest des Haupt-Builds und setzt __SW_VERSION__ und __PRECACHE__ per define.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const APP_VERSION = `${pkg.version}+${(process.env.GIT_SHA ?? 'dev').slice(0, 7)}`;

const outDir = fileURLToPath(new URL('../dist/client', import.meta.url));
const manifestPath = `${outDir}/.vite/manifest.json`;

type ManifestChunk = { file: string; css?: string[]; assets?: string[] };
function assetUrls(): string[] {
  if (!existsSync(manifestPath)) throw new Error(`build:sw braucht zuerst build:client (${manifestPath} fehlt).`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, ManifestChunk>;
  const files = new Set<string>();
  for (const chunk of Object.values(manifest)) {
    if (/\.(js|css)$/.test(chunk.file)) files.add('/' + chunk.file);
    for (const c of chunk.css ?? []) files.add('/' + c);
  }
  return [...files].sort();
}

const PRECACHE = [
  '/', '/index.html', '/manifest.webmanifest', '/theme-init.js', '/favicon.svg',
  '/icons/icon-192.png', '/icons/badge-96.png',
  ...assetUrls(),
];

// Cache-Name hängt am Inhalt (gehashte Asset-Namen), nicht nur an GIT_SHA: sonst bliebe er bei GIT_SHA=dev
// über Deploys gleich, alte /assets/* würden nie aufgeräumt.
const SW_VERSION = `${APP_VERSION}-${createHash('sha256').update(PRECACHE.join('\n')).digest('hex').slice(0, 8)}`;
if (process.env.NODE_ENV === 'production' && (process.env.GIT_SHA ?? 'dev') === 'dev') {
  console.warn('\n⚠  GIT_SHA is not set – the app version stays "+dev" across deploys (set the GIT_SHA build arg to the commit).\n');
}

export default defineConfig({
  publicDir: false,
  define: {
    __SW_VERSION__: JSON.stringify(SW_VERSION),
    __PRECACHE__: JSON.stringify(PRECACHE),
  },
  build: {
    outDir,
    emptyOutDir: false,
    copyPublicDir: false,
    target: 'es2022',
    minify: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL('./src/sw/sw.ts', import.meta.url)),
      formats: ['iife'],
      name: 'benchbetSW',
      fileName: () => 'sw.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
