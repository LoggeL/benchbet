import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeTimers, makeApp } from './helpers.ts';
import { MAX_TIMER_MS, TICK_MS, createScheduler } from '../server/services/scheduler.ts';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

test('Auto-Close sekundengenau über den Timer auf den nächsten closesAt', async () => {
  const timers = new FakeTimers();
  const t = await makeApp({ timers });
  try {
    await t.ctx.scheduler.start();
    assert.equal([...timers.intervals.values()][0]!.ms, TICK_MS, 'Intervall 15 s');
    const closesAt = t.clock.now() + 20 * MIN + 1234;
    const g = await t.createGame({ closesAt: new Date(closesAt).toISOString() });
    await t.tip(g.id, 'Nöl', [5]);
    assert.equal(t.ctx.scheduler.closeTimerAt, closesAt);
    const pending = [...timers.timeouts.values()];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.ms, 20 * MIN + 1234, 'Timer zielt exakt auf closesAt');

    t.clock.set(closesAt);
    timers.fireTimeouts();
    await t.ctx.scheduler.tick();
    const game = t.ctx.repo.getGame(g.id)!;
    assert.equal(game.closedAt, new Date(closesAt).toISOString(), 'closed_at = closes_at');
    assert.equal(game.closedBy, null);
    const act = await t.get(`/api/games/${g.id}/activity`);
    const ev = act.body.events.find((e: any) => e.type === 'game.closed');
    assert.deepEqual(ev.data, { auto: true, plannedClosesAt: new Date(closesAt).toISOString() });
    assert.equal(ev.actorName, null);
    assert.equal(ev.text, 'Bet closed automatically (deadline reached).');
    assert.equal(t.ctx.scheduler.closeTimerAt, null, 'kein weiterer Tippschluss geplant');
    assert.equal((await t.tip(g.id, 'LZH', [1])).body.error.code, 'GAME_CLOSED');
  } finally {
    await t.close();
  }
});

test('Timer bei sehr fernem Tippschluss auf 2³¹−1 ms begrenzt', async () => {
  const timers = new FakeTimers();
  const t = await makeApp({ timers });
  try {
    await t.ctx.scheduler.start();
    await t.createGame({ closesAt: new Date(t.clock.now() + 60 * 24 * HOUR).toISOString() });
    assert.equal([...timers.timeouts.values()][0]!.ms, MAX_TIMER_MS);
  } finally {
    await t.close();
  }
});

test('Nachholen nach Neustart: erster Lauf schließt Fälliges, alte Anlässe werden nur protokolliert', async () => {
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 } });
  try {
    await t.subscribe('Logge', 'https://push.example/logge');
    await t.subscribe('Nöl', 'https://push.example/noel');
    const g = await t.createGame({ closesAt: new Date(t.clock.now() + HOUR).toISOString() });
    await t.tip(g.id, 'LZH', [5]);
    const g2 = await t.createGame({ prompt: 'Ohne Tippschluss', closesAt: null });
    t.sent.length = 0;
    // Server war 8 Stunden aus: new_game und creator_due sind älter als 6 h
    t.clock.advance(9 * HOUR);
    const timers = new FakeTimers();
    const fresh = createScheduler({ repo: t.ctx.repo, config: t.config, clock: t.clock, audit: t.ctx.audit, push: t.ctx.push, log: t.app.log, timers });
    await fresh.start();
    await t.ctx.push.idle();
    assert.ok(t.ctx.repo.getGame(g.id)!.closedAt, 'geschlossen');
    assert.deepEqual(t.sent, [], 'nichts verschickt');
    const logs = t.ctx.repo.pushLogs().filter((l) => l.gameId === g.id);
    assert.ok(logs.some((l) => l.kind === 'creator_due' && l.status === null), 'creator_due protokolliert');
    assert.ok(!logs.some((l) => l.kind === 'new_game'), 'schon geschlossen → keine „Neue Wette“ mehr');
    assert.ok(t.ctx.repo.getGame(g.id)!.pushNewSentAt);
    const logs2 = t.ctx.repo.pushLogs().filter((l) => l.gameId === g2.id);
    assert.ok(logs2.some((l) => l.kind === 'new_game' && l.status === null), 'new_game (offen, aber zu alt) nur protokolliert');
    await fresh.stop();
  } finally {
    await t.close();
  }
});

test('Purge: Papierkorb nach 30 Tagen endgültig gelöscht, game.purged bleibt', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    await t.tip(g.id, 'Nöl', [5]);
    await t.del(`/api/games/${g.id}`, { name: 'Logge' });
    t.clock.advance(29 * 24 * HOUR);
    await t.ctx.scheduler.tick();
    assert.ok(t.ctx.repo.getGame(g.id), 'nach 29 Tagen noch da');
    t.clock.advance(1 * 24 * HOUR + HOUR);
    await t.ctx.scheduler.tick();
    assert.equal(t.ctx.repo.getGame(g.id), null);
    assert.equal(t.ctx.repo.activeTips(g.id).length, 0, 'Kaskade auf tips');
    assert.ok(t.ctx.repo.gameEvents(g.id).some((e) => e.type === 'game.purged'));
  } finally {
    await t.close();
  }
});

test('Abos mit fail_count ≥ 10 werden stündlich entfernt', async () => {
  const t = await makeApp();
  try {
    const { subscriptionId } = await t.subscribe('Nöl', 'https://push.example/n');
    for (let i = 0; i < 10; i++) t.ctx.repo.subFailure(subscriptionId, t.clock.iso(), '503');
    await t.ctx.scheduler.tick();
    assert.equal(t.ctx.repo.listSubs().length, 0);
  } finally {
    await t.close();
  }
});

test('Backup: täglich ab 04:00 UTC per VACUUM INTO, 14 Dateien behalten', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'benchbet-backup-'));
  try {
    const t = await makeApp({ now: '2026-10-18T03:59:00.000Z', config: { dataDir: dir, dbFile: join(dir, 'benchbet.db') } });
    try {
      const backups = join(dir, 'backups');
      assert.equal(t.ctx.scheduler.backup(t.clock.now()), null, 'vor 04:00 nichts');
      t.clock.set('2026-10-18T04:00:00.000Z');
      const { mkdirSync } = await import('node:fs');
      mkdirSync(backups, { recursive: true });
      for (let d = 1; d <= 15; d++) writeFileSync(join(backups, `benchbet-2026-09-${String(d).padStart(2, '0')}.db`), '');
      const file = t.ctx.scheduler.backup(t.clock.now());
      assert.equal(file, join(backups, 'benchbet-2026-10-18.db'));
      assert.ok(existsSync(file!));
      assert.equal(t.ctx.scheduler.backup(t.clock.now()), null, 'einmal pro Tag');
      const files = readdirSync(backups).filter((f) => f.endsWith('.db')).sort();
      assert.equal(files.length, 14);
      assert.equal(files.at(-1), 'benchbet-2026-10-18.db');
    } finally {
      await t.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
