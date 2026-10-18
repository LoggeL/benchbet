// Scheduler (SPEC §2.3): Auto-Close, Pushes, Papierkorb, Backups. Jeder Lauf ist idempotent.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.ts';
import type { Clock } from '../clock.ts';
import { iso } from '../clock.ts';
import type { Repo } from '../db/repo.ts';
import type { Audit } from './audit.ts';
import type { PushService } from './push.ts';
import { MAX_FAILS } from './push.ts';
import { loadWorld } from './dto.ts';

export const TICK_MS = 15_000;
/** setTimeout kann höchstens 2³¹−1 ms. */
export const MAX_TIMER_MS = 2 ** 31 - 1;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
export const BACKUP_KEEP = 14;
export const BACKUP_HOUR_UTC = 4;

export type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (t: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (t: unknown) => void;
};

const realTimers: Timers = {
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: (t) => clearInterval(t as ReturnType<typeof setInterval>),
};

export type Scheduler = ReturnType<typeof createScheduler>;

export function createScheduler(deps: {
  repo: Repo;
  config: Config;
  clock: Clock;
  audit: Audit;
  push: PushService;
  log: FastifyBaseLogger;
  timers?: Timers;
}) {
  const { repo, config, clock, audit, push, log } = deps;
  const timers = deps.timers ?? realTimers;
  let interval: unknown = null;
  let closeTimer: unknown = null;
  /** Zeitpunkt (ms), auf den der Close-Timer zielt – für Tests sichtbar. */
  let closeTimerAt: number | null = null;
  let running: Promise<void> | null = null;
  let again = false;
  let started = false;
  let lastHourly = 0;

  /** Schritt 1: automatischer Tippschluss aller fälligen Wetten. */
  function autoClose(now: number): number {
    const due = repo.dueToClose(iso(now));
    for (const g of due) {
      audit.tx(() => {
        repo.updateGame(g.id, { closedAt: g.closesAt, closedBy: null });
        audit.recordEvent({ type: 'game.closed', gameId: g.id, actor: null, data: { auto: true, plannedClosesAt: g.closesAt } });
      });
    }
    return due.length;
  }

  /** Schritt 6: Papierkorb > TRASH_DAYS endgültig löschen, kaputte Abos entfernen. */
  function hourly(now: number): void {
    const limit = now - config.trashDays * DAY_MS;
    for (const g of repo.listGames({ deleted: true })) {
      if (!g.deletedAt || Date.parse(g.deletedAt) > limit) continue;
      audit.tx(() => {
        audit.recordEvent({ type: 'game.purged', gameId: g.id, actor: null, data: { prompt: g.prompt, deletedAt: g.deletedAt } });
        repo.deleteGameHard(g.id);
      });
    }
    const n = repo.deleteFailingSubs(MAX_FAILS);
    if (n > 0) log.info({ removed: n }, `Removed push subscriptions with ≥ ${MAX_FAILS} failures`);
  }

  /** Schritt 7: täglich ab 04:00 UTC `VACUUM INTO`, 14 Dateien behalten. */
  function backup(now: number): string | null {
    if (config.dbFile === ':memory:') return null;
    const d = new Date(now);
    if (d.getUTCHours() < BACKUP_HOUR_UTC) return null;
    const dir = join(config.dataDir, 'backups');
    const file = join(dir, `benchbet-${iso(now).slice(0, 10)}.db`);
    if (existsSync(file)) return null;
    mkdirSync(dir, { recursive: true });
    repo.db.prepare('VACUUM INTO ?').run(file);
    const files = readdirSync(dir).filter((f) => /^benchbet-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) rmSync(join(dir, f), { force: true });
    log.info({ file }, 'Backup written');
    return file;
  }

  async function runOnce(): Promise<void> {
    const now = clock.now();
    autoClose(now);
    let w = loadWorld(repo);
    await push.runCreatorDue(w);
    w = loadWorld(repo);
    await push.runNewGames(w);
    await push.runReminders(w);
    await push.runCreatorOverdue(w);
    if (now - lastHourly >= HOUR_MS) {
      lastHourly = now;
      hourly(now);
    }
    try {
      backup(now);
    } catch (e) {
      log.error({ err: e }, 'Backup failed');
    }
  }

  /** Ein Lauf; überlappende Aufrufe werden zu einem Folgelauf zusammengefasst. */
  async function tick(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          try {
            await runOnce();
          } catch (e) {
            log.error({ err: e }, 'Scheduler run failed');
          }
        } while (again);
      } finally {
        running = null;
        if (started) reschedule();
      }
    })();
    return running;
  }

  /** Timer auf den nächsten fälligen closes_at (sekundengenauer Tippschluss). */
  function reschedule(): void {
    if (closeTimer) timers.clearTimeout(closeTimer);
    closeTimer = null;
    closeTimerAt = null;
    if (!started) return;
    const next = repo.nextClosesAt();
    if (!next) return;
    const at = Date.parse(next);
    const delay = Math.min(Math.max(0, at - clock.now()), MAX_TIMER_MS);
    closeTimerAt = at;
    closeTimer = timers.setTimeout(() => {
      closeTimer = null;
      void tick();
    }, delay);
  }

  return {
    tick,
    reschedule,
    backup,
    remindAt: push.remindAt,
    /** Für Tests: Ziel des Close-Timers. */
    get closeTimerAt(): number | null {
      return closeTimerAt;
    },
    get started(): boolean {
      return started;
    },
    /** Nach Schreibaktionen: Timer neu setzen und (falls gestartet) bald einen Lauf anstoßen. */
    poke(runNow = false): void {
      if (!started) return;
      reschedule();
      if (runNow) {
        const t = timers.setTimeout(() => void tick(), 0);
        void t;
      }
    },
    /** Startet Intervall + ersten Lauf (holt nach einem Neustart alles Fällige nach). */
    start(): Promise<void> {
      if (started) return Promise.resolve();
      started = true;
      interval = timers.setInterval(() => void tick(), TICK_MS);
      return tick();
    },
    async stop(): Promise<void> {
      started = false;
      if (interval) timers.clearInterval(interval);
      if (closeTimer) timers.clearTimeout(closeTimer);
      interval = null;
      closeTimer = null;
      closeTimerAt = null;
      if (running) await running;
    },
  };
}
