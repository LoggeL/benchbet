import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, statsFor, statsTable, statsHeadline } from '../shared/stats.ts';
import type { StatsSourceGame } from '../shared/stats.ts';
import { nameKey } from '../shared/names.ts';
import { toSnapshot } from './helpers-shared.ts';

/** Snapshot (v2) → Eingabe für statsFor (alle Legacy-Wetten: winnerTipIds = null). */
function fixtureGames(): StatsSourceGame[] {
  return toSnapshot().games.map((g) => ({
    id: g.id,
    answerType: g.answerType,
    resolvedAt: g.resolvedAt ? g.resolvedAt.replace(' ', 'T') + '.000Z' : null,
    result: g.result,
    winnerTipIds: null,
    tips: g.tips.map((t) => ({ id: t.id, playerName: t.playerName, playerKey: nameKey(t.playerName), values: t.values })),
  }));
}

const FIXTURE_TABLE = [
  ['1', 'Logge', 14, 7, 3, 1, '42.9%'],
  ['2', 'LZH', 11, 7, 2, 0, '28.6%'],
  ['2', 'Nöl', 13, 7, 2, 0, '28.6%'],
  ['4', 'Nikjay', 7, 2, 1, 1, '50%'],
  ['–', 'BigDick69', 1, 0, 0, 0, '–'],
];

test('Pflicht-Fixture §2.8: exakt die alte Rangliste', () => {
  const s = statsFor(fixtureGames());
  assert.equal(statsHeadline(s), '14 bets · 7 resolved · 5 players · 46 guesses');
  assert.deepEqual([s.gameCount, s.resolvedCount, s.playerCount, s.tipCount], [14, 7, 5, 46]);
  assert.deepEqual(statsTable(s), FIXTURE_TABLE);
  const big = s.players.find((p) => p.name === 'BigDick69')!;
  assert.equal(big.rank, null);
  assert.equal(big.winRate, null);
  const lzh = s.players.find((p) => p.name === 'LZH')!;
  const noel = s.players.find((p) => p.name === 'Nöl')!;
  assert.equal(lzh.rank, 2);
  assert.equal(noel.rank, 2, 'Gleichstand = gleicher Platz');
});

test('Formkurve: neueste zuerst, max. 10, nur gewertete', () => {
  const s = statsFor(fixtureGames());
  const logge = s.players.find((p) => p.key === 'logge')!;
  assert.equal(logge.form.length, 7);
  assert.deepEqual(logge.form.map((f) => f.gameId), [1055, 1059, 1054, 629, 502, 747, 492]);
  assert.deepEqual(logge.form.map((f) => f.isWinner), [false, false, true, true, true, false, false]);
  const noel = s.players.find((p) => p.key === 'nöl')!;
  assert.equal(noel.form.find((f) => f.gameId === 747)!.rank, null, 'Text ohne Treffer: rank null');
});

test('kanonischer Anzeigename aus players', () => {
  const s = statsFor(fixtureGames(), new Map([['nöl', { name: 'NÖL' }]]));
  assert.ok(s.players.some((p) => p.name === 'NÖL' && p.tips === 13));
});

test('Schreibweisen desselben Schlüssels werden zusammengezählt', () => {
  const games: StatsSourceGame[] = [
    { id: 1, answerType: 'number', resolvedAt: '2026-10-01T00:00:00.000Z', result: [10], tips: [{ id: 1, playerName: 'nöl', values: [10] }] },
    { id: 2, answerType: 'number', resolvedAt: null, result: null, tips: [{ id: 2, playerName: 'NÖL', values: [3] }] },
  ];
  const s = statsFor(games);
  assert.equal(s.players.length, 1);
  assert.deepEqual([s.players[0]!.tips, s.players[0]!.settled, s.players[0]!.wins, s.players[0]!.exact, s.players[0]!.name], [2, 1, 1, 1, 'nöl']);
});

test('gelöschte Wetten und entfernte Tipps zählen nicht', () => {
  const games = fixtureGames();
  // Logge-Sieg in 1054 entfernen: Siege 3 → 2, Tipps 14 → 13
  const g1054 = games.find((g) => g.id === 1054)!;
  g1054.tips = g1054.tips.map((t) => (t.playerName === 'Logge' ? { ...t, removedAt: '2026-10-18T00:00:00.000Z' } : t));
  // 1059 löschen: LZH verliert einen Sieg
  games.find((g) => g.id === 1059)!.deletedAt = '2026-10-18T00:00:00.000Z';
  const s = statsFor(games);
  assert.equal(s.gameCount, 13);
  assert.equal(s.resolvedCount, 6);
  assert.equal(s.tipCount, 46 - 1 - 3);
  const logge = s.players.find((p) => p.key === 'logge')!;
  assert.deepEqual([logge.tips, logge.settled, logge.wins, logge.exact], [12, 5, 2, 0]);
  const nikjay = s.players.find((p) => p.key === 'nikjay')!;
  assert.equal(nikjay.wins, 1, 'Nikjay gewinnt 1054 jetzt allein');
});

test('ohne Wetten: leere Rangliste', () => {
  assert.deepEqual(computeStats([]), { gameCount: 0, resolvedCount: 0, playerCount: 0, tipCount: 0, players: [] });
});

test('Reihenfolge bei gleichen Siegen: Quote, dann Name', () => {
  const R = '2026-10-01T00:00:00.000Z';
  const s = computeStats([
    { id: 1, resolvedAt: R, result: [1], tips: [
      { playerName: 'Zora', isWinner: true, distance: 0, rank: 1 },
      { playerName: 'Anna', isWinner: true, distance: 0, rank: 1 },
      { playerName: 'Bert', isWinner: false, distance: 2, rank: 3 },
    ] },
    { id: 2, resolvedAt: R, result: [1], tips: [{ playerName: 'Zora', isWinner: false, distance: 1, rank: 2 }] },
  ]);
  assert.deepEqual(s.players.map((p) => [p.name, p.rank]), [['Anna', 1], ['Zora', 2], ['Bert', 3]]);
});
