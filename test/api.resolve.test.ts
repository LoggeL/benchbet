import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.ts';

const DAY = 24 * 3600 * 1000;
const TEXT = { template: 'codename', answerType: 'text', fields: [], prompt: 'Welches Modell steckt hinter Nova?', benchmark: 'Codename' };

test('dryRun bei open → 409 GAME_OPEN; bei closed Werte + Gewinner-Vorschau', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    await t.tip(g.id, 'LZH', [35]);
    await t.tip(g.id, 'Nöl', [45]);
    await t.tip(g.id, 'Logge', [47]);
    const open = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [38], dryRun: true });
    assert.equal(open.status, 409);
    assert.deepEqual(open.body.error, { code: 'GAME_OPEN', message: 'Close the bet first.' });
    await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    const pre = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [38], dryRun: true });
    assert.equal(pre.status, 200, pre.text);
    assert.deepEqual(pre.body.preview.winners, ['LZH']);
    assert.deepEqual(pre.body.preview.tips.map((x: any) => [x.playerName, x.values[0], x.distance, x.rank, x.isWinner]), [
      ['LZH', 35, 3, 1, true], ['Nöl', 45, 7, 2, false], ['Logge', 47, 9, 3, false],
    ]);
    assert.equal(pre.body.preview.suggestions, undefined);
    assert.equal(t.ctx.repo.getGame(g.id)!.resolvedAt, null, 'dryRun speichert nichts');
    // Ergebnis darf feiner sein als die Tipp-Schritte, aber nicht außerhalb des Bereichs
    assert.equal((await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [38.123], dryRun: true })).status, 200);
    const out = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [120], dryRun: true });
    assert.equal(out.body.error.field, 'result');
    const foreign = await t.post(`/api/games/${g.id}/resolve`, { name: 'Nöl', result: [38], dryRun: true });
    assert.equal(foreign.status, 403, 'Vorschau nur für Verwalter');
  } finally {
    await t.close();
  }
});

test('Auflösen aus open schließt mit; Ergebnis, Wertung, Statistik', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({ closesAt: '2026-10-23T18:00:00.000Z' });
    await t.tip(g.id, 'LZH', [42]);
    await t.tip(g.id, 'Nöl', [44]);
    await t.tip(g.id, 'Nikjay', [44]);
    await t.tip(g.id, 'Logge', [50]);
    t.clock.advance(60_000);
    const r = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [43] });
    assert.equal(r.status, 200, r.text);
    const game = r.body.game;
    assert.equal(game.phase, 'resolved');
    assert.equal(game.closedAt, t.clock.iso());
    assert.equal(game.resolvedAt, t.clock.iso());
    assert.equal(game.resolvedBy, 'Logge');
    assert.deepEqual(game.result, [43]);
    assert.equal(game.archiveAt, new Date(t.clock.now() + 7 * DAY).toISOString());
    assert.deepEqual(game.tips.map((x: any) => x.rank), [1, 1, 1, 4], '1-1-1-4 bei gleicher Abweichung');
    assert.equal(game.answersRevealed, true);
    assert.equal(game.viewer.resultSeen, false, 'Reveal beim ersten Ansehen');
    const again = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [43] });
    assert.equal(again.body.error.code, 'GAME_RESOLVED');
    const s = await t.get('/api/state');
    const lzh = s.body.stats.players.find((p: any) => p.name === 'LZH');
    assert.equal(lzh.wins, 1);
    assert.equal(s.body.stats.resolvedCount, 1);
    // gesehen
    const seen = await t.post(`/api/games/${g.id}/seen`, { name: 'LZH' });
    assert.equal(seen.status, 204);
    assert.equal((await t.get(`/api/games/${g.id}?name=LZH`)).body.game.viewer.resultSeen, true);
    assert.equal((await t.post(`/api/games/${g.id}/seen`, { name: 'Unbekannt' })).status, 204);
    assert.equal(t.ctx.repo.getPlayer('unbekannt'), null, 'seen legt keinen Spieler an');
    const g2 = await t.createGame();
    assert.equal((await t.post(`/api/games/${g2.id}/seen`, { name: 'LZH' })).body.error.code, 'GAME_NOT_RESOLVED');
  } finally {
    await t.close();
  }
});

test('Text: Vorschläge (checked/similar), manuelle Gewinner, „Niemand lag richtig“', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame(TEXT);
    const a = (await t.tip(g.id, 'Nöl', 'Nova-2')).body.tip.id;
    const b = (await t.tip(g.id, 'LZH', 'nova 2')).body.tip.id;
    const c = (await t.tip(g.id, 'Logge', '  NOVA-2 ')).body.tip.id;
    const d = (await t.tip(g.id, 'Nikjay', 'Gemini')).body.tip.id;
    await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    const pre = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: 'Nova-2', dryRun: true });
    assert.equal(pre.status, 200, pre.text);
    assert.deepEqual(pre.body.preview.suggestions.checked.sort(), [a, c].sort());
    assert.deepEqual(pre.body.preview.suggestions.similar, [b]);
    assert.ok(!pre.body.preview.suggestions.similar.includes(d));
    const noResult = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', dryRun: true });
    assert.equal(noResult.status, 200, 'bei text ist result im dryRun optional');

    const bad = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: 'Nova-2', winnerTipIds: [999] });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.field, 'winnerTipIds');

    const r = await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: 'Nova-2', winnerTipIds: [a, b] });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.game.winnerMode, 'manual');
    const winners = r.body.game.tips.filter((x: any) => x.isWinner).map((x: any) => x.playerName).sort();
    assert.deepEqual(winners, ['LZH', 'Nöl']);
    assert.equal(r.body.game.ruleSummary, 'Right answer wins · Logge decides what counts');

    const none = await t.post(`/api/games/${g.id}/correct`, { name: 'Logge', result: 'Nova-2', winnerTipIds: [], reason: 'Doch keiner' });
    assert.equal(none.status, 200, none.text);
    assert.ok(none.body.game.tips.every((x: any) => !x.isWinner));
    const auto = await t.post(`/api/games/${g.id}/correct`, { name: 'Logge', result: 'Nova-2' });
    assert.equal(auto.body.game.winnerMode, 'auto');
    assert.deepEqual(auto.body.game.tips.filter((x: any) => x.isWinner).map((x: any) => x.id).sort(), [a, c].sort());
  } finally {
    await t.close();
  }
});

test('Korrektur: bis 7 Tage Verwalter, danach nur Admin; Statistik ändert sich', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    await t.tip(g.id, 'LZH', [30]);
    await t.tip(g.id, 'Nikjay', [60]);
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Nöl', result: [31] });
    let s = await t.get('/api/state');
    assert.equal(s.body.stats.players.find((p: any) => p.name === 'LZH').wins, 1);

    const notRes = await t.post(`/api/games/${(await t.createGame()).id}/correct`, { name: 'Logge', result: [1] });
    assert.equal(notRes.body.error.code, 'GAME_NOT_RESOLVED');

    const pre = await t.post(`/api/games/${g.id}/correct`, { name: 'Nöl', result: [59], dryRun: true });
    assert.deepEqual(pre.body.preview.winners, ['Nikjay']);
    t.clock.advance(6 * DAY);
    const c = await t.post(`/api/games/${g.id}/correct`, { name: 'Nöl', result: [59], reason: 'Official value changed' });
    assert.equal(c.status, 200, c.text);
    assert.equal(c.body.game.correctedAt, t.clock.iso());
    assert.equal(c.body.game.resolvedAt, '2026-10-18T16:00:00.000Z', 'resolvedAt bleibt, Archivuhr läuft weiter');
    s = await t.get('/api/state');
    assert.equal(s.body.stats.players.find((p: any) => p.name === 'LZH').wins, 0);
    assert.equal(s.body.stats.players.find((p: any) => p.name === 'Nikjay').wins, 1);
    const act = await t.get(`/api/games/${g.id}/activity`);
    assert.ok(act.body.events.some((e: any) => e.text === 'Nöl corrected the result: 59 points (was 31 points). Reason: “Official value changed”.'));

    t.clock.advance(1 * DAY);
    const archived = await t.post(`/api/games/${g.id}/correct`, { name: 'Nöl', result: [58] });
    assert.equal(archived.status, 409);
    assert.deepEqual(archived.body.error, { code: 'GAME_ARCHIVED', message: 'Only an admin can correct archived bets.' });
    const admin = await t.post(`/api/games/${g.id}/correct`, { name: 'Logge', result: [58] });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.game.phase, 'archived');
  } finally {
    await t.close();
  }
});
