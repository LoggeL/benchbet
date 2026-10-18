import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phaseOf, closingSoon, archiveAt, ARCHIVE_MS, nextPhaseChange } from '../shared/phase.ts';

const T = Date.parse('2026-10-20T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const g = (o: Partial<{ resolvedAt: string | null; closedAt: string | null; closesAt: string | null }> = {}) =>
  ({ resolvedAt: null, closedAt: null, closesAt: null, ...o });

test('open ohne Tippschluss', () => {
  assert.equal(phaseOf(g(), T), 'open');
});

test('closed, sobald closesAt erreicht ist (sekundengenau)', () => {
  const c = g({ closesAt: iso(T) });
  assert.equal(phaseOf(c, T - 1), 'open');
  assert.equal(phaseOf(c, T), 'closed');
});

test('closed bei gesetztem closedAt, auch mit closesAt in der Zukunft', () => {
  assert.equal(phaseOf(g({ closedAt: iso(T - 1000), closesAt: iso(T + 3600_000) }), T), 'closed');
});

test('resolved und archived exakt an der 7-Tage-Grenze', () => {
  const r = g({ resolvedAt: iso(T), closedAt: iso(T) });
  assert.equal(phaseOf(r, T), 'resolved');
  assert.equal(phaseOf(r, T + ARCHIVE_MS - 1), 'resolved');
  assert.equal(phaseOf(r, T + ARCHIVE_MS), 'archived');
  assert.equal(archiveAt(r), iso(T + ARCHIVE_MS));
  assert.equal(archiveAt(g()), null);
});

test('Legacy: 1059 aufgelöst 06.10. → archiveAt 13.10.', () => {
  assert.equal(archiveAt({ resolvedAt: '2026-10-06T13:34:27.000Z' }), '2026-10-13T13:34:27.000Z');
});

test('closingSoon: nur open, mit closesAt, < 24 h', () => {
  assert.equal(closingSoon(g({ closesAt: iso(T + 24 * 3600_000) }), T), false);
  assert.equal(closingSoon(g({ closesAt: iso(T + 24 * 3600_000 - 1) }), T), true);
  assert.equal(closingSoon(g(), T), false);
  assert.equal(closingSoon(g({ closesAt: iso(T + 1000), closedAt: iso(T - 1) }), T), false);
  assert.equal(closingSoon(g({ closesAt: iso(T) }), T), false, 'schon geschlossen');
});

test('nextPhaseChange', () => {
  assert.equal(nextPhaseChange(g({ closesAt: iso(T + 5000) }), T), T + 5000);
  assert.equal(nextPhaseChange(g(), T), null);
  assert.equal(nextPhaseChange(g({ resolvedAt: iso(T) }), T), T + ARCHIVE_MS);
  assert.equal(nextPhaseChange(g({ resolvedAt: iso(T - ARCHIVE_MS) }), T), null);
});
