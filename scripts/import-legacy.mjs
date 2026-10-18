#!/usr/bin/env node
// Legacy-Import (SPEC §6.5): zieht die alte App anonym + pro Spielername, baut einen v2-Snapshot,
// schreibt ihn nur an gitignored Pfade und postet ihn optional an /api/admin/import.
// Gibt nie verdeckte Tippwerte aus – nur Anzahlen, IDs und Namen.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { nameKey } from '../shared/names.ts';

const DEFAULT_SOURCE = 'https://ki-score-tippspiel.logge.chatgpt.site';
const UA = 'benchbet-import/1.0';
const STRIP_GAME = ['canManage', 'hasTipped', 'answersRevealed', 'viewerTip', 'tipCount'];

const { values: args } = parseArgs({
  options: {
    source: { type: 'string', default: DEFAULT_SOURCE },
    out: { type: 'string', default: 'data/legacy-snapshot.json' },
    post: { type: 'string' },
    token: { type: 'string' },
    mode: { type: 'string', default: 'empty' },
    'dry-run': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    'from-file': { type: 'string' },
    'unsafe-path': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  console.log(`node scripts/import-legacy.mjs [--source URL] [--out data/legacy-snapshot.json]
                               [--post https://bet.logge.top] [--token $ADMIN_TOKEN]
                               [--mode empty|replace] [--dry-run] [--force] [--from-file legacy/snapshot.json]
                               [--unsafe-path]`);
  process.exit(0);
}
if (args.mode !== 'empty' && args.mode !== 'replace') fail(`--mode must be empty or replace (got: ${args.mode}).`, 1);

function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`${url}: ${lastErr?.message ?? lastErr}`);
}

function checkGames(data, label) {
  if (!data || !Array.isArray(data.games)) fail(`${label}: response has no games[].`, 1);
  return data.games;
}

async function capture() {
  const base = args.source.replace(/\/+$/, '');
  console.log(`Source: ${base}`);
  const anon = checkGames(await getJson(`${base}/api/games`), 'anonym');

  // Namen sammeln (exakte Schreibweisen, dedupliziert über nameKey)
  const names = new Map();
  for (const g of anon) {
    if (g.createdBy && !names.has(nameKey(g.createdBy))) names.set(nameKey(g.createdBy), g.createdBy);
    for (const t of g.tips ?? []) if (!names.has(nameKey(t.playerName))) names.set(nameKey(t.playerName), t.playerName);
  }

  // Grundgerüst aus der anonymen Antwort
  const games = new Map();
  for (const g of anon) {
    const copy = { ...g };
    for (const k of STRIP_GAME) delete copy[k];
    copy.tips = (g.tips ?? []).map((t) => ({ gameId: g.id, id: t.id, playerName: t.playerName, values: t.values ?? null,
      ...(g.resolvedAt ? { expected: { distance: t.distance, rank: t.rank, isWinner: t.isWinner } } : {}) }));
    games.set(g.id, copy);
  }

  const capturedAs = [''];
  for (const name of names.values()) {
    await sleep(300);
    const data = checkGames(await getJson(`${base}/api/games?playerName=${encodeURIComponent(name)}`), name);
    capturedAs.push(name);
    let filled = 0;
    for (const g of data) {
      const target = games.get(g.id);
      if (!target) continue;
      for (const t of g.tips ?? []) {
        const tt = target.tips.find((x) => x.id === t.id);
        if (!tt) continue;
        if (tt.values == null && t.values != null) { tt.values = t.values; filled++; }
        if (g.resolvedAt && !tt.expected) tt.expected = { distance: t.distance, rank: t.rank, isWinner: t.isWinner };
      }
    }
    console.log(`  as ${name}: filled in ${filled} values`);
  }

  const missing = [];
  for (const g of games.values()) for (const t of g.tips) if (t.values == null) missing.push(`${g.id}/${t.id}/${t.playerName}`);
  if (missing.length) {
    console.error(`Incomplete: ${missing.length} guess values missing (gameId/tipId/playerName):`);
    for (const m of missing) console.error(`  ${m}`);
    process.exit(2);
  }

  return {
    format: 'tipplab-legacy-snapshot@2',
    source: base,
    fetchedAt: new Date().toISOString(),
    capturedAs,
    games: [...games.values()],
  };
}

function assertIgnored(path) {
  if (args['unsafe-path']) return;
  let inRepo = false;
  try {
    inRepo = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dirname(path), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() === 'true';
  } catch {
    inRepo = false;
  }
  if (!inRepo) return;
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: dirname(path), stdio: 'ignore' });
  } catch {
    fail('Target is not gitignored – the snapshot contains hidden guesses.', 1);
  }
}

function writeSnapshot(snap) {
  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  assertIgnored(out);
  writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', { mode: 0o600 });
  chmodSync(out, 0o600);
  const tips = snap.games.reduce((n, g) => n + g.tips.length, 0);
  console.log(`Snapshot written: ${out} (${snap.games.length} bets, ${tips} guesses)`);
}

async function post(snap) {
  const token = args.token ?? process.env.ADMIN_TOKEN;
  if (!token) fail('No admin token (--token or env ADMIN_TOKEN).', 1);
  const url = `${args.post.replace(/\/+$/, '')}/api/admin/import?mode=${args.mode}&dryRun=${args['dry-run']}&force=${args.force}`;
  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-admin-token': token, 'User-Agent': UA },
    body: JSON.stringify(snap),
  });
  let body;
  try { body = await res.json(); } catch { body = null; }
  if (!res.ok) {
    console.error(`Import failed: HTTP ${res.status} ${body?.error?.code ?? ''} – ${body?.error?.message ?? ''}`);
    for (const d of body?.error?.details ?? []) console.error(`  ${d}`);
    process.exit(3);
  }
  const r = body ?? {};
  console.log(`${r.dryRun ? 'Dry run' : 'Import'} ok · mode ${r.mode} · format ${r.format ?? 'v1'}`);
  console.log(`Imported: ${r.imported?.games} bets, ${r.imported?.tips} guesses, ${r.imported?.players} players · sequence ${r.sequence?.games}/${r.sequence?.tips}`);
  for (const c of r.checks?.phases?.changed ?? []) console.log(`  Phase ${c.id}: ${c.legacy} → ${c.now}${c.note ? ` (${c.note})` : ''}`);
  for (const w of r.checks?.phases?.warnings ?? []) console.log(`  Phase warning: ${JSON.stringify(w)}`);
  for (const m of r.checks?.archiveAt?.mismatches ?? []) console.log(`  archiveAt differs: ${JSON.stringify(m)}`);
  const sc = r.checks?.scoring;
  if (sc) console.log(`Scoring: ${sc.compared} compared, ${sc.mismatches?.length ?? 0} mismatches`);
  for (const m of sc?.mismatches ?? []) console.log(`  Mismatch: ${typeof m === 'string' ? m : JSON.stringify({ gameId: m.gameId, tipId: m.tipId })}`);
  const st = r.checks?.stats;
  if (st) {
    console.log(`\n${st.gameCount} bets · ${st.resolvedCount} resolved · ${st.playerCount} players · ${st.tipCount} guesses`);
    console.log('Rank   Name             Guesses    Scored   Wins  Exact  Rate');
    for (const [rank, name, tips, settled, wins, exact, rate] of st.table ?? []) {
      console.log(`${String(rank).padEnd(6)} ${String(name).padEnd(16)} ${String(tips).padStart(7)} ${String(settled).padStart(9)} ${String(wins).padStart(6)} ${String(exact).padStart(6)}  ${rate}`);
    }
  }
  for (const w of r.warnings ?? []) console.log(`Warning: ${typeof w === 'string' ? w : JSON.stringify(w)}`);
}

let snap;
if (args['from-file']) {
  snap = JSON.parse(readFileSync(resolve(args['from-file']), 'utf8'));
  checkGames(snap, args['from-file']);
  const tips = snap.games.reduce((n, g) => n + (g.tips?.length ?? 0), 0);
  console.log(`File: ${args['from-file']} (${snap.games.length} bets, ${tips} guesses)`);
} else {
  snap = await capture();
  writeSnapshot(snap);
}
if (args.post) await post(snap);
else if (args['from-file']) console.log('Nothing to do: --from-file without --post.');
