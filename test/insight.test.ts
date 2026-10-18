import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insightLine } from '../shared/insight.ts';
import type { TipValues } from '../shared/types.ts';

const num = { answerType: 'number' as const, fields: [{ label: 'Score', unit: 'points', min: 0, max: 100, step: 0.1 }] };
const txt = { answerType: 'text' as const, fields: [] };
const tips = (own: TipValues, others: [string, TipValues | null][]) => [
  { id: 1, playerName: 'Ich', values: own, isOwn: true },
  ...others.map(([playerName, values], i) => ({ id: i + 2, playerName, values })),
];

test('Insight Zahl: Regeln in Reihenfolge', () => {
  assert.equal(insightLine(num, tips([50], [['Ada', [50]], ['Bo', [40]]])), 'Great minds: you and Ada picked the same.');
  assert.equal(insightLine(num, tips([50], [['Ada', [50]], ['Bo', [50]]])), '2 others picked the same as you.');
  assert.equal(insightLine(num, tips([60], [['Ada', [50]], ['Bo', [40]]])), 'You’re the most bullish.');
  assert.equal(insightLine(num, tips([30], [['Ada', [50]], ['Bo', [40]]])), 'You’re the most bearish.');
  assert.equal(insightLine(num, tips([45], [['A', [40]], ['B', [50]], ['C', [44]]])), 'You’re right in the middle of the pack.');
  assert.equal(insightLine(num, tips([45], [['A', [40]], ['B', [41]], ['C', [60]], ['D', [70]], ['E', [80]]])), '3 guessed higher, 2 lower.');
  assert.equal(insightLine(num, tips([44], [['A', [40]], ['B', [41]], ['C', [42]], ['D', [70]]])), '1 guessed higher, 3 lower.');
});

test('Insight Zahl: erst ab 3 sichtbaren Tipps, nur ein Feld', () => {
  assert.equal(insightLine(num, tips([50], [['Ada', [40]]])), null);
  assert.equal(insightLine(num, tips([50], [['Ada', [40]], ['Bo', null]])), null, 'verdeckte zählen nicht');
  const multi = { answerType: 'number' as const, fields: [num.fields[0]!, num.fields[0]!] };
  assert.equal(insightLine(multi, tips([1, 2], [['A', [1, 2]], ['B', [3, 4]]])), null);
  assert.equal(insightLine(num, [{ id: 1, playerName: 'A', values: [1] }]), null, 'ohne eigenen Tipp');
});

test('Insight Text', () => {
  assert.equal(insightLine(txt, tips('Nova-2', [['A', 'nova-2'], ['B', 'GPT']])), 'A said the same thing.');
  assert.equal(insightLine(txt, tips('Nova-2', [['A', 'nova-2'], ['B', ' NOVA-2']])), '2 others said the same thing.');
  assert.equal(insightLine(txt, tips('Nova-2', [['A', 'GPT']])), 'Nobody else said that.');
});
