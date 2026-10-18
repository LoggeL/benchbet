#!/usr/bin/env node
// Renders the PNG icons from the SVG sources in client/public/icons (SPEC §4.2, BenchBet branding).
// The PNGs are committed, so the Docker build never needs resvg.
//
//   icon.svg      app icon (dark tile, violet slash, lime "B" highlighter, violet dot)
//   maskable.svg  same motif on a full-bleed tile, scaled into the 40 % safe-zone circle
//   badge.svg     white-on-transparent silhouette for the Android status bar
//   og.svg        1200×630 social card (uses system fonts – rendered here, committed as og.png)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const pub = fileURLToPath(new URL('../client/public/', import.meta.url));
const icons = `${pub}icons/`;
const src = (name) => {
  const p = `${icons}${name}`;
  if (!existsSync(p)) {
    console.error(`gen-icons: ${p} missing.`);
    process.exit(1);
  }
  return readFileSync(p, 'utf8');
};

function render(svg, width, out, { background, fonts = false } = {}) {
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background,
    font: { loadSystemFonts: fonts, defaultFontFamily: 'Helvetica Neue' },
  }).render().asPng();
  writeFileSync(`${icons}${out}`, png);
  console.log(`  ${out.padEnd(22)} ${String(width).padStart(4)}px  ${(png.length / 1024).toFixed(1)} KB`);
}

const icon = src('icon.svg');
const maskable = src('maskable.svg');
const badge = src('badge.svg');
const og = src('og.svg');

render(icon, 192, 'icon-192.png');
render(icon, 512, 'icon-512.png');
render(maskable, 192, 'maskable-192.png');
render(maskable, 512, 'maskable-512.png');
// Apple: no transparency, no rounding (iOS masks it itself), background #101211
render(icon.replace(/(<rect width="512" height="512") rx="[^"]*"/, '$1'), 180, 'apple-touch-icon.png', { background: '#101211' });
render(badge, 96, 'badge-96.png');
render(og, 1200, 'og.png', { background: '#101211', fonts: true });
copyFileSync(`${icons}icon.svg`, `${pub}favicon.svg`);
console.log('  favicon.svg            (copy of icon.svg)');
