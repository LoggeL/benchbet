import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGame, normText, textSuggestions, answerClusters, sortTips, round6 } from '../shared/scoring.ts';
import { loadFixture } from './helpers-shared.ts';
import type { TipValues } from '../shared/types.ts';

const R = '2026-10-07T19:39:54.000Z';
const num = (result: number[] | null, resolvedAt: string | null = R) => ({ answerType: 'number' as const, resolvedAt, result });
const text = (result: string | null, winnerTipIds?: number[] | null) => ({ answerType: 'text' as const, resolvedAt: R, result, winnerTipIds });
const tips = (vals: TipValues[]) => vals.map((values, i) => ({ id: i + 1, playerName: `P${i + 1}`, values }));
const pick = <T extends { id: number; distance: number | null; rank: number | null; isWinner: boolean }>(s: T[]) =>
  s.map((t) => [t.id, t.distance, t.rank, t.isWinner]);

test('Rundung: 57,6 − 55 = 2,6', () => {
  const s = scoreGame(num([57.6]), tips([[55], [54], [52]]));
  assert.deepEqual(pick(s), [[1, 2.6, 1, true], [2, 3.6, 2, false], [3, 5.6, 3, false]]);
  assert.equal(round6(57.6 - 55), 2.6);
});

test('Competition-Ranking 1-2-2-4', () => {
  const s = scoreGame(num([43]), tips([[50], [40], [38], [48]]));
  assert.deepEqual(s.map((t) => [t.id, t.rank]), [[2, 1], [3, 2], [4, 2], [1, 4]]);
  assert.deepEqual(s.filter((t) => t.isWinner).map((t) => t.id), [2]);
});

test('Competition-Ranking 1-1-3-4 (geteilter Sieg)', () => {
  const s = scoreGame(num([500]), tips([[500], [1000], [300], [500]]));
  assert.deepEqual(s.map((t) => [t.id, t.rank, t.isWinner]), [[1, 1, true], [4, 1, true], [3, 3, false], [2, 4, false]]);
  assert.equal(s[0]!.distance, 0);
});

test('Mehrfeld: Summe der absoluten Abweichungen', () => {
  const s = scoreGame(num([1.25, 10]), tips([[1, 12], [1.5, 9.6], [1.25, 10.01]]));
  assert.deepEqual(pick(s), [[3, 0.01, 1, true], [2, 0.65, 2, false], [1, 2.25, 3, false]]);
});

test('Nicht aufgelöst oder ohne Tipps: alles leer, Sortierung nach id', () => {
  const s = scoreGame(num([10], null), [{ id: 9, values: [1] }, { id: 3, values: [2] }]);
  assert.deepEqual(pick(s), [[3, null, null, false], [9, null, null, false]]);
  assert.deepEqual(scoreGame(num([10]), []), []);
  assert.deepEqual(pick(scoreGame(num(null), tips([[1]]))), [[1, null, null, false]]);
});

test('Text automatisch: Groß-/Kleinschreibung und Whitespace egal', () => {
  const s = scoreGame(text('Nova-2'), tips(['  nova-2 ', 'NOVA-2', 'Nova 2', 'nova-3']));
  assert.deepEqual(pick(s), [[1, null, 1, true], [2, null, 1, true], [3, null, null, false], [4, null, null, false]]);
  assert.equal(normText('  A   b\tC '), 'a b c');
});

test('Text manuell: [] = niemand, Teilmenge = genau diese', () => {
  const t = tips(['Nova-2', 'nova 2', 'Nova2']);
  assert.deepEqual(scoreGame(text('Nova-2', []), t).filter((x) => x.isWinner), []);
  const m = scoreGame(text('Nova-2', [2, 3]), t);
  assert.deepEqual(pick(m), [[2, null, 1, true], [3, null, 1, true], [1, null, null, false]]);
});

test('Legacy 747 (Text) hat keinen Gewinner', () => {
  const g = loadFixture().games.find((x) => x.id === 747)!;
  const s = scoreGame({ ...g, winnerTipIds: null }, g.tips.map((t) => ({ id: t.id, values: t.values! })));
  assert.equal(s.filter((t) => t.isWinner).length, 0);
  assert.ok(s.every((t) => t.rank === null && t.distance === null));
});

test('Alle aufgelösten Fixture-Wetten reproduzieren distance/rank/isWinner der alten API', () => {
  const fx = loadFixture();
  let compared = 0;
  for (const g of fx.games.filter((x) => x.resolvedAt)) {
    const s = scoreGame({ ...g, winnerTipIds: null }, g.tips.map((t) => ({ id: t.id, values: t.values! })));
    for (const old of g.tips) {
      const neu = s.find((t) => t.id === old.id)!;
      assert.deepEqual([neu.distance, neu.rank, neu.isWinner], [old.distance, old.rank, old.isWinner], `Wette ${g.id}, Tipp ${old.id}`);
      compared++;
    }
    // Reihenfolge der alten API = scoreGame-Ordnung
    assert.deepEqual(s.map((t) => t.id), g.tips.map((t) => t.id), `Sortierung Wette ${g.id}`);
  }
  assert.equal(compared, 23);
});

test('Beispiele aus §2.7: 1059 und 1055', () => {
  const fx = loadFixture();
  const run = (id: number) => {
    const g = fx.games.find((x) => x.id === id)!;
    return scoreGame(g, g.tips.map((t) => ({ id: t.id, playerName: t.playerName, values: t.values! })));
  };
  assert.deepEqual(run(1059).map((t) => [t.playerName, t.distance, t.rank, t.isWinner]),
    [['LZH', 3, 1, true], ['Nöl', 7, 2, false], ['Logge', 9, 3, false]]);
  assert.deepEqual(run(1055).map((t) => t.rank), [1, 2, 2, 4]);
});

test('sortTips: rank aufsteigend, null zuletzt, dann id', () => {
  const s = sortTips([{ id: 5, rank: null }, { id: 2, rank: 2 }, { id: 1, rank: null }, { id: 4, rank: 1 }, { id: 3, rank: 2 }]);
  assert.deepEqual(s.map((t) => t.id), [4, 2, 3, 1, 5]);
});

test('textSuggestions: checked und similar', () => {
  const t = tips(['nova-2', 'Nova 2', 'Nova-2 Pro', 'GPT', 'nova', '']);
  const r = textSuggestions('Nova-2', t);
  assert.deepEqual(r.checked, [1]);
  assert.deepEqual(r.similar, [2, 3, 5]);
  assert.deepEqual(textSuggestions('', t), { checked: [], similar: [] });
});

test('answerClusters gruppiert normalisiert', () => {
  const c = answerClusters(tips(['Nova-2', 'nova-2 ', 'GPT']));
  assert.deepEqual(c.map((x) => [x.answer, x.tips.length]), [['Nova-2', 2], ['GPT', 1]]);
});
