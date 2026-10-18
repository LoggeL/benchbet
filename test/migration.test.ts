import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_TOKEN, fixtureLeaks, loadFixture, makeApp, toSnapshot } from './helpers.ts';
import { legacyTime, checkSnapshot } from '../server/services/importLegacy.ts';

const FIXTURE_TABLE = [
  ['1', 'Logge', 14, 7, 3, 1, '42.9%'],
  ['2', 'LZH', 11, 7, 2, 0, '28.6%'],
  ['2', 'Nöl', 13, 7, 2, 0, '28.6%'],
  ['4', 'Nikjay', 7, 2, 1, 1, '50%'],
  ['–', 'BigDick69', 1, 0, 0, 0, '–'],
];

const importUrl = (q: string) => `/api/admin/import?${q}`;
const H = { 'x-admin-token': ADMIN_TOKEN };

test('legacyTime: SQLite-Zeit als UTC, ISO normalisiert', () => {
  assert.equal(legacyTime('2026-10-06 13:25:28'), '2026-10-06T13:25:28.000Z');
  assert.equal(legacyTime('2026-10-23T18:00:00Z'), '2026-10-23T18:00:00.000Z');
  assert.equal(legacyTime(null), null);
  assert.equal(legacyTime('kein Datum'), undefined);
});

test('Import der Fixture: Anzahlen, IDs, Sequenz, Wertung, Rangliste', async () => {
  const t = await makeApp();
  try {
    const r = await t.post(importUrl('mode=empty'), toSnapshot(), H);
    assert.equal(r.status, 200, r.text);
    const rep = r.body;
    assert.equal(rep.ok, true);
    assert.equal(rep.dryRun, false);
    assert.equal(rep.format, 'tipplab-legacy-snapshot@2');
    assert.deepEqual(rep.imported, { games: 14, tips: 46, players: 5 });
    assert.deepEqual(rep.sequence, { games: 1062, tips: 68 });
    assert.equal(rep.checks.scoring.compared, 23);
    assert.deepEqual(rep.checks.scoring.mismatches, []);
    assert.equal(rep.checks.archiveAt.ok, 7);
    assert.deepEqual(rep.checks.archiveAt.mismatches, []);
    assert.equal(rep.checks.phases.ok, 14);
    assert.deepEqual(rep.checks.phases.warnings, []);
    assert.deepEqual(rep.checks.stats.table, FIXTURE_TABLE);
    assert.deepEqual([rep.checks.stats.gameCount, rep.checks.stats.resolvedCount, rep.checks.stats.playerCount, rep.checks.stats.tipCount], [14, 7, 5, 46]);

    // IDs und Zeitstempel
    const g1059 = t.ctx.repo.getGame(1059)!;
    assert.equal(g1059.createdAt, '2026-10-06T13:25:28.000Z');
    assert.equal(g1059.resolvedAt, '2026-10-06T13:34:27.000Z');
    assert.equal(g1059.closedAt, '2026-10-06T13:34:27.000Z', 'closed_at = resolvedAt ohne closesAt');
    assert.equal(g1059.closedBy, null);
    assert.equal(g1059.resolvedBy, 'Logge');
    assert.equal(g1059.template, 'legacy');
    assert.equal(g1059.winnerTipIds, null);
    assert.ok(g1059.pushNewSentAt && g1059.creatorDueSentAt && g1059.creatorOverdueSentAt);
    assert.equal(t.ctx.repo.getTip(56)!.gameId, 1059);
    assert.equal(t.ctx.repo.getTip(56)!.createdAt, null);
    for (const g of t.ctx.repo.listGames()) assert.match(g.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);

    // Neue IDs danach ≥ 1063 / ≥ 69
    const created = await t.createGame();
    assert.equal(created.id, 1063);
    const tip = await t.tip(1063, 'Nöl', [61.5]);
    assert.equal(tip.status, 201, tip.text);
    assert.equal(tip.body.tip.id, 69);

    // Spieler: Farben nach erstem Auftreten, kanonische Namen
    const players = t.ctx.repo.listPlayers();
    assert.equal(players.length, 5);
    assert.deepEqual(new Set(players.map((p) => p.color)), new Set([0, 1, 2, 3, 4]));
    assert.equal(t.ctx.repo.getPlayer('logge')!.color, 0, 'Logge taucht als Erster auf (Ersteller der ältesten Wette)');

    // result_seen für alle Spieler × aufgelöste Wetten → kein Reveal-Schwall
    for (const p of players) assert.equal(t.ctx.repo.seenGames(p.key).size, 7);
    // Verlauf: „Aus der alten App übernommen“
    const act = await t.get('/api/games/1059/activity');
    assert.equal(act.status, 200);
    assert.ok(act.body.events.some((e: { text: string }) => e.text === 'Imported from the old app.'));
  } finally {
    await t.close();
  }
});

test('Import: Rangliste in /api/state exakt nach §2.8, Wertung von 1059 und 1055', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const s = await t.get('/api/state?name=N%C3%B6l');
    assert.equal(s.status, 200);
    const rows = s.body.stats.players.map((p: any) => [p.rank === null ? '–' : String(p.rank), p.name, p.tips, p.settled, p.wins, p.exact]);
    assert.deepEqual(rows, FIXTURE_TABLE.map((r) => r.slice(0, 6)));
    assert.equal(s.body.games.length, 14);
    const g = s.body.games.find((x: any) => x.id === 1059);
    assert.deepEqual(g.tips.map((x: any) => [x.playerName, x.values[0], x.distance, x.rank, x.isWinner]), [
      ['LZH', 35, 3, 1, true], ['Nöl', 45, 7, 2, false], ['Logge', 47, 9, 3, false],
    ]);
    assert.equal(g.phase, 'archived');
    assert.equal(g.viewer.resultSeen, true);
    const g1055 = s.body.games.find((x: any) => x.id === 1055);
    assert.deepEqual(g1055.tips.map((x: any) => x.rank), [1, 2, 2, 4]);
  } finally {
    await t.close();
  }
});

test('Import: keine Pushes fällig (kein Schwall „Neue Wette“)', async () => {
  const t = await makeApp({ fixture: true });
  try {
    await t.subscribe('Nöl', 'https://push.example/noel');
    await t.subscribe('Logge', 'https://push.example/logge');
    t.sent.length = 0;
    t.clock.advance(10 * 60 * 1000);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.deepEqual(t.sent, []);
  } finally {
    await t.close();
  }
});

test('Import: mode=empty zweimal → 409, replace idempotent', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const again = await t.post(importUrl('mode=empty'), toSnapshot(), H);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'IMPORT_NOT_EMPTY');
    const r1 = await t.post(importUrl('mode=replace'), toSnapshot(), H);
    assert.equal(r1.status, 200, r1.text);
    const r2 = await t.post(importUrl('mode=replace'), toSnapshot(), H);
    assert.equal(r2.status, 200);
    assert.deepEqual(r2.body.imported, { games: 14, tips: 46, players: 5 });
    assert.deepEqual(r2.body.checks.stats.table, FIXTURE_TABLE);
    assert.equal(t.ctx.repo.listPlayers().length, 5);
    assert.equal(t.ctx.repo.listGames().length, 14);
  } finally {
    await t.close();
  }
});

test('Import: dryRun schreibt nichts', async () => {
  const t = await makeApp();
  try {
    const r = await t.post(importUrl('mode=empty&dryRun=true'), toSnapshot(), H);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.dryRun, true);
    assert.deepEqual(r.body.imported, { games: 14, tips: 46, players: 5 });
    assert.equal(t.ctx.repo.countGames(), 0);
    assert.equal(t.ctx.repo.countPlayers(), 0);
    assert.equal(t.ctx.repo.getMeta('imported_at'), null);
  } finally {
    await t.close();
  }
});

test('Import: manipulierter expected → 422 IMPORT_MISMATCH (Rollback), mit force → 200', async () => {
  const t = await makeApp();
  try {
    const snap = toSnapshot();
    const tip = snap.games.find((g) => g.id === 1059)!.tips.find((x) => x.id === 56)!;
    tip.expected = { ...tip.expected!, rank: 2 };
    const r = await t.post(importUrl('mode=empty'), snap, H);
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'IMPORT_MISMATCH');
    assert.ok(r.body.error.details.some((d: string) => d.includes('Bet 1059, guess 56: rank')));
    assert.equal(t.ctx.repo.countGames(), 0, 'Rollback');
    const f = await t.post(importUrl('mode=empty&force=true'), snap, H);
    assert.equal(f.status, 200, f.text);
    assert.equal(f.body.checks.scoring.mismatches.length, 1);
    assert.equal(t.ctx.repo.countGames(), 14);
  } finally {
    await t.close();
  }
});

test('Import: Strukturfehler → 422 IMPORT_INVALID mit allen Befunden', async () => {
  const t = await makeApp();
  try {
    const snap = toSnapshot() as any;
    snap.games[0].tips[0].gameId = 999;
    snap.games[1].answerType = 'bild';
    snap.games[2].tips.push({ ...snap.games[2].tips[0] });
    const r = await t.post(importUrl('mode=empty'), snap, H);
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'IMPORT_INVALID');
    assert.ok(r.body.error.details.length >= 3, r.text);
    assert.equal(t.ctx.repo.countGames(), 0);
  } finally {
    await t.close();
  }
});

test('Import v1 (ohne format/expected) wird akzeptiert, unbekannte Felder nur als Warnung', async () => {
  const snap = toSnapshot() as any;
  delete snap.format;
  delete snap.capturedAs;
  for (const g of snap.games) {
    g.canManage = false;
    for (const tip of g.tips) delete tip.expected;
  }
  const c = checkSnapshot(snap);
  assert.equal(c.ok, true);
  if (c.ok) {
    assert.equal(c.snap.format, 'tipplab-legacy-snapshot@1');
    assert.ok(c.warnings.some((w) => w.includes('games[].canManage')));
  }
});

test('Leck-Schutz: Fixture enthält keine Werte nicht aufgelöster Wetten', () => {
  assert.deepEqual(fixtureLeaks(loadFixture()), []);
});
