#!/usr/bin/env node
// Budget-Prüfung (SPEC §1.10): JS ≤ 80 KB gzip, CSS ≤ 15 KB gzip über dist/client/assets.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUDGET = { js: 80 * 1024, css: 15 * 1024 };
const dir = fileURLToPath(new URL('../dist/client/assets/', import.meta.url));
if (!existsSync(dir)) {
  console.error('size: dist/client/assets missing – run npm run build:client first.');
  process.exit(1);
}
const total = { js: 0, css: 0 };
const rows = [];
for (const f of readdirSync(dir)) {
  const ext = f.endsWith('.js') ? 'js' : f.endsWith('.css') ? 'css' : null;
  if (!ext) continue;
  const gz = gzipSync(readFileSync(join(dir, f)), { level: 9 }).length;
  total[ext] += gz;
  rows.push(`  ${f.padEnd(40)} ${(gz / 1024).toFixed(1).padStart(6)} KB gzip`);
}
console.log(rows.join('\n'));
let ok = true;
for (const k of /** @type {const} */ (['js', 'css'])) {
  const pass = total[k] <= BUDGET[k];
  ok &&= pass;
  console.log(`${pass ? '✓' : '✗'} ${k.toUpperCase()} ${(total[k] / 1024).toFixed(1)} KB / ${BUDGET[k] / 1024} KB`);
}
if (!ok) {
  console.error('size: budget exceeded.');
  process.exit(1);
}
