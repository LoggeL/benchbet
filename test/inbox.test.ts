import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inboxSections, missingCount, notYetTipped, hasTipped } from '../shared/inbox.ts';
import type { InboxGame } from '../shared/inbox.ts';

const NOW = Date.parse('2026-10-20T12:00:00.000Z');
const H = 3600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();

let nextId = 1063;
function game(o: Partial<InboxGame> & { tippers?: string[] } = {}): InboxGame {
  const { tippers = [], ...rest } = o;
  return {
    id: nextId++, createdAt: iso(NOW - D), createdByKey: 'logge',
    resolvedAt: null, closedAt: null, closesAt: null,
    tips: tippers.map((playerKey) => ({ playerKey })),
    ...rest,
  };
}

test('Sektionen in fester Reihenfolge und Zuordnung', () => {
  const missSoon = game({ closesAt: iso(NOW + 2 * H) });
  const missLater = game({ closesAt: iso(NOW + 3 * D) });
  const missNoDeadlineOld = game({ createdAt: iso(NOW - 3 * D) });
  const missNoDeadlineNew = game({ createdAt: iso(NOW - 1 * H) });
  const tippedOpen = game({ tippers: ['nöl'], closesAt: iso(NOW + D) });
  const tippedClosed = game({ tippers: ['nöl'], closesAt: iso(NOW - H) });
  const closedWithout = game({ closedAt: iso(NOW - 2 * H) });
  const newResult = game({ resolvedAt: iso(NOW - H), closedAt: iso(NOW - H), viewer: { hasTipped: false, resultSeen: false } });
  const seenResult = game({ resolvedAt: iso(NOW - H), closedAt: iso(NOW - H), viewer: { hasTipped: false, resultSeen: true } });
  const archivedUnseen = game({ resolvedAt: iso(NOW - 8 * D), closedAt: iso(NOW - 8 * D), viewer: { hasTipped: false, resultSeen: false } });
  const deleted = game({ deletedAt: iso(NOW - H) });
  const all = [missNoDeadlineOld, tippedClosed, missLater, closedWithout, newResult, missSoon, seenResult, archivedUnseen, tippedOpen, deleted, missNoDeadlineNew];

  const s = inboxSections(all, { now: NOW, meKey: 'nöl' });
  assert.deepEqual(s.missing.map((g) => g.id), [missSoon.id, missLater.id, missNoDeadlineNew.id, missNoDeadlineOld.id]);
  assert.deepEqual(s.tipped.map((g) => g.id), [tippedOpen.id, tippedClosed.id], 'laufende vor geschlossenen');
  assert.deepEqual(s.closedWithout.map((g) => g.id), [closedWithout.id]);
  assert.deepEqual(s.newResults.map((g) => g.id), [newResult.id], 'nur resolved und ungesehen');
  assert.deepEqual(s.todo, [], 'Nöl verwaltet nichts');
  assert.deepEqual([s.open, s.waiting], [[], []]);
  assert.equal(missingCount(all, 'nöl', NOW), 4);
});

test('Für dich zu tun (nur Verwalter): geschlossen und lange ohne Tippschluss', () => {
  const closed = game({ closesAt: iso(NOW - H), tippers: ['nöl'] });
  const stale = game({ createdAt: iso(NOW - 15 * D) });
  const notStale = game({ createdAt: iso(NOW - 14 * D) });
  const foreign = game({ createdByKey: 'nöl', closesAt: iso(NOW - H) });
  const s = inboxSections([closed, stale, notStale, foreign], { now: NOW, meKey: 'logge' });
  assert.deepEqual(s.todo.map((t) => [t.game.id, t.kind, 'days' in t ? t.days : null]), [[closed.id, 'resolve', null], [stale.id, 'stale', 15]]);
  const admin = inboxSections([foreign], { now: NOW, meKey: 'logge', canManage: () => true });
  assert.deepEqual(admin.todo.map((t) => t.game.id), [foreign.id]);
  const dto = inboxSections([{ ...foreign, canManage: true }], { now: NOW, meKey: 'logge' });
  assert.equal(dto.todo.length, 1, 'canManage aus dem DTO');
});

test('Ohne Namen: nur „Offene Wetten“ und „Wartet auf Ergebnis“', () => {
  const o = game({ tippers: ['nöl'] });
  const c = game({ closedAt: iso(NOW - H) });
  const r = game({ resolvedAt: iso(NOW - H), viewer: { hasTipped: false, resultSeen: false } });
  const s = inboxSections([o, c, r], { now: NOW, meKey: null });
  assert.deepEqual(s.open.map((g) => g.id), [o.id]);
  assert.deepEqual(s.waiting.map((g) => g.id), [c.id]);
  assert.deepEqual([s.missing, s.tipped, s.newResults, s.todo, s.closedWithout], [[], [], [], [], []]);
  assert.equal(missingCount([o, c], null, NOW), 0, 'ohne Namen kein Badge');
});

test('missingCount: Phase wird mit now gerechnet (Tippschluss gerade erreicht)', () => {
  const g = game({ closesAt: iso(NOW) });
  assert.equal(missingCount([g], 'nöl', NOW - 1), 1);
  assert.equal(missingCount([g], 'nöl', NOW), 0);
});

test('hasTipped ignoriert entfernte Tipps', () => {
  const g = game({ tips: [{ playerKey: 'nöl', removedAt: iso(NOW) }] });
  assert.equal(hasTipped(g, 'nöl'), false);
  assert.equal(missingCount([g], 'nöl', NOW), 1);
});

test('notYetTipped: aktiv (≤ 60 Tage), nicht versteckt, ohne Betrachter, nur open', () => {
  const players = [
    { key: 'logge', name: 'Logge', lastTipAt: iso(NOW - D), tipCount: 14 },
    { key: 'nöl', name: 'Nöl', lastTipAt: iso(NOW - D), tipCount: 13 },
    { key: 'lzh', name: 'LZH', lastTipAt: iso(NOW - 10 * D), tipCount: 11 },
    { key: 'nikjay', name: 'Nikjay', lastTipAt: iso(NOW - 2 * D), tipCount: 7 },
    { key: 'alt', name: 'Alt', lastTipAt: iso(NOW - 61 * D), tipCount: 30 },
    { key: 'versteckt', name: 'Versteckt', lastTipAt: iso(NOW - D), hidden: true },
    { key: 'nie', name: 'Nie', lastTipAt: null },
  ];
  const g = game({ tippers: ['logge'] });
  assert.deepEqual(notYetTipped(g, players, { now: NOW, viewerKey: 'nöl' }), ['LZH', 'Nikjay']);
  assert.deepEqual(notYetTipped(g, players, { now: NOW, viewerKey: null }), ['Nöl', 'LZH', 'Nikjay']);
  assert.deepEqual(notYetTipped({ ...g, closedAt: iso(NOW - 1) }, players, { now: NOW, viewerKey: null }), []);
});
