#!/usr/bin/env node
// Leak guard for the public repo (SPEC §6.6): fails if git tracks – or would pick up with `git add -A` – files that
// may contain hidden guesses. Runs in `npm test`. Skipped without git (e.g. the Docker build has no .git).
// If the local legacy snapshot exists, it also scans those files for the hidden text guesses of unresolved bets
// (prints file names only, never the values).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

const FORBIDDEN_DIRS = ['legacy/', 'data/', 'docs/internal/', 'docs/audit/'];

let out;
try {
  // tracked files + untracked files that are not ignored (= what the next `git add -A` would commit)
  out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  console.log('check-public: no git repo or git missing – skipped.');
  process.exit(0);
}

const files = [...new Set(out.split('\0').filter(Boolean))];
const bad = files.filter((f) => {
  if (FORBIDDEN_DIRS.some((d) => f.startsWith(d))) return true;
  const base = f.split('/').pop() ?? '';
  if (/snapshot/i.test(base) && base.toLowerCase().endsWith('.json') && !f.startsWith('test/fixtures/')) return true;
  return false;
});

if (bad.length > 0) {
  console.error('check-public: these files must not go into the public repo (hidden guesses!):');
  for (const f of bad) console.error('  - ' + f);
  console.error('Remove with: git rm --cached <file>');
  process.exit(1);
}

// Fixtures are anonymous API answers: every guess on an unresolved bet must be null there.
const fixtureLeaks = [];
for (const f of files.filter((x) => /^test\/fixtures\/.+\.json$/.test(x) && existsSync(x))) {
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    const games = Array.isArray(j) ? j : j.games ?? [];
    if (games.some((g) => !g?.resolvedAt && (g?.tips ?? []).some((t) => t?.values != null))) fixtureLeaks.push(f);
  } catch {
    /* not a snapshot-shaped JSON */
  }
}
if (fixtureLeaks.length) {
  console.error('check-public: these fixtures contain values of unresolved bets (must be null):');
  for (const f of fixtureLeaks) console.error('  - ' + f);
  process.exit(1);
}

const SNAPSHOT = 'legacy/snapshot.json';
let scanned = 0;
if (existsSync(SNAPSHOT)) {
  /** text guesses (≥ 4 chars): matched anywhere */
  const texts = [];
  /** number guesses: matched only in context (game id + player name within ±WINDOW chars), else every "50" would hit */
  const numbers = [];
  try {
    for (const g of JSON.parse(readFileSync(SNAPSHOT, 'utf8')).games ?? []) {
      if (g.resolvedAt) continue;
      for (const t of g.tips ?? []) {
        if (typeof t.values === 'string' && t.values.trim().length >= 4) texts.push(t.values.trim().toLowerCase());
        else if (Array.isArray(t.values)) {
          const nums = t.values.filter((v) => typeof v === 'number' && Number.isFinite(v));
          if (nums.length) numbers.push({ gameId: String(g.id), player: String(t.playerName ?? '').toLowerCase(), nums });
        }
      }
    }
  } catch {
    /* unreadable snapshot → only the path check */
  }
  const WINDOW = 300;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const numRes = numbers.map((n) => ({
    ...n,
    res: n.nums.map((v) => {
      const forms = [...new Set([String(v), String(v).replace('.', ',')])].map(esc).join('|');
      return new RegExp(`(?<![\\d.,])(?:${forms})(?![\\d]|[.,]\\d)`, 'g');
    }),
  }));
  const numberLeak = (text) => numRes.some((n) => n.player && text.includes(n.player) && text.includes(n.gameId) && n.res.some((re) => {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const w = text.slice(Math.max(0, m.index - WINDOW), m.index + m[0].length + WINDOW);
      if (w.includes(n.player) && new RegExp(`(?<!\\d)${n.gameId}(?!\\d)`).test(w)) return true;
    }
    return false;
  }));
  const leaking = [];
  if (texts.length || numRes.length) {
    for (const f of files) {
      if (!existsSync(f) || statSync(f).size > 2_000_000 || /\.(png|jpe?g|webp|ico|gz|woff2?)$/i.test(f)) continue;
      const text = readFileSync(f, 'utf8').toLowerCase();
      scanned++;
      if (texts.some((x) => text.includes(x)) || numberLeak(text)) leaking.push(f);
    }
  }
  if (leaking.length) {
    console.error('check-public: these files contain a hidden guess of an unresolved bet:');
    for (const f of leaking) console.error('  - ' + f);
    process.exit(1);
  }
}
console.log(`check-public: ok (${files.length} files checked${scanned ? `, ${scanned} scanned for hidden guesses` : ''}).`);
