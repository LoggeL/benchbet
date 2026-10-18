import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFixture, fixtureLeaks, toSnapshot } from './helpers-shared.ts';

test('Leck-Schutz: Fixture enthält keine Werte nicht aufgelöster Wetten', () => {
  const fx = loadFixture();
  assert.deepEqual(fixtureLeaks(fx), []);
  const open = fx.games.filter((g) => !g.resolvedAt);
  assert.equal(open.length, 7);
  assert.ok(open.every((g) => g.tips.every((t) => t.values === null)));
});

test('toSnapshot: v2 mit 14 Wetten, 46 Tipps, Platzhaltern und expected', () => {
  const s = toSnapshot();
  assert.equal(s.format, 'tipplab-legacy-snapshot@2');
  assert.equal(s.games.length, 14);
  assert.equal(s.games.reduce((n, g) => n + g.tips.length, 0), 46);
  const g2 = s.games.find((g) => g.id === 2)!;
  assert.ok(g2.tips.every((t) => t.values === 'x' && t.expected === undefined));
  const g1062 = s.games.find((g) => g.id === 1062)!;
  assert.ok(g1062.tips.every((t) => Array.isArray(t.values) && t.values[0] === 0));
  const g1059 = s.games.find((g) => g.id === 1059)!;
  assert.deepEqual(g1059.tips.find((t) => t.id === 56)!.expected, { distance: 3, rank: 1, isWinner: true });
  assert.ok(s.games.every((g) => !('canManage' in g) && !('viewerTip' in g)));
});
