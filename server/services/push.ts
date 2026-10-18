// Web-Push (SPEC §5): VAPID-Setup, Versand mit Auswertung, Empfängerlogik.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import type { FastifyBaseLogger } from 'fastify';
import type { Game, PushKind, PushPayload, TipValues } from '../../shared/types.ts';
import { phaseOf } from '../../shared/phase.ts';
import { scoreGame } from '../../shared/scoring.ts';
import { missingCount } from '../../shared/inbox.ts';
import type { Config } from '../config.ts';
import type { Clock } from '../clock.ts';
import { iso } from '../clock.ts';
import type { Repo, Subscription } from '../db/repo.ts';
import { loadWorld } from './dto.ts';
import type { World } from './dto.ts';
import type { PushMessage, PushOptions } from './pushTexts.ts';
import {
  correctionMessage, creatorDueMessage, creatorOverdueMessage, newGameMessage, newGamesBundleMessage, reminderMessage,
  resultMessage, shortened, testMessage,
} from './pushTexts.ts';

export type VapidKeys = { publicKey: string; privateKey: string };

/** Ergebnis eines Versandversuchs: HTTP-Status des Push-Dienstes, 0 = Netzfehler. */
export type SendResult = { status: number; error?: string };
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };
/** Injizierbare Sendefunktion (Tests: Fake). */
export type PushSender = (target: PushTarget, payload: string, options: PushOptions) => Promise<SendResult>;

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Pushes, deren Anlass älter ist, werden nach einem Neustart verworfen (außer result). */
export const STALE_MS = 6 * HOUR_MS;
export const MAX_PARALLEL = 5;
export const MAX_FAILS = 10;

// ---------------------------------------------------------------------------
// VAPID (§5.1)
// ---------------------------------------------------------------------------

/** Env-Schlüssel oder `${DATA_DIR}/vapid.json` (wird beim ersten Start erzeugt, Modus 0600). */
export function resolveVapidKeys(config: Config): VapidKeys {
  if (config.vapidPublicKey && config.vapidPrivateKey) return { publicKey: config.vapidPublicKey, privateKey: config.vapidPrivateKey };
  const file = join(config.dataDir, 'vapid.json');
  if (existsSync(file)) {
    const k = JSON.parse(readFileSync(file, 'utf8')) as Partial<VapidKeys>;
    if (typeof k.publicKey === 'string' && typeof k.privateKey === 'string') return { publicKey: k.publicKey, privateKey: k.privateKey };
    throw new Error(`${file} is invalid (publicKey/privateKey missing).`);
  }
  const keys = webpush.generateVAPIDKeys();
  mkdirSync(config.dataDir, { recursive: true });
  writeFileSync(file, JSON.stringify(keys, null, 2) + '\n', { mode: 0o600 });
  chmodSync(file, 0o600);
  return keys;
}

/** Schlüsselwechsel erkennen: alle Abos sind dann ungültig und werden gelöscht. */
export function applyVapidKey(repo: Repo, publicKey: string, log?: FastifyBaseLogger): void {
  const prev = repo.getMeta('vapid_public_key');
  if (prev && prev !== publicKey) {
    const n = repo.deleteAllSubs();
    log?.warn({ deleted: n }, 'VAPID keys changed – all push subscriptions deleted');
  }
  if (prev !== publicKey) repo.setMeta('vapid_public_key', publicKey);
}

export function webPushSender(config: Config, keys: VapidKeys): PushSender {
  const vapidDetails = { subject: config.vapidSubject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return async (target, payload, options) => {
    try {
      const res = await webpush.sendNotification(target, payload, { ...options, vapidDetails, timeout: 15_000 });
      return { status: res.statusCode };
    } catch (e) {
      const we = e as { statusCode?: number; body?: string; message?: string };
      if (typeof we.statusCode === 'number') return { status: we.statusCode, error: String(we.body ?? we.message ?? '').slice(0, 300) };
      return { status: 0, error: String(we.message ?? e) };
    }
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export type PushService = ReturnType<typeof createPushService>;

type DeliverOpts = { dedupe?: boolean; discard?: boolean };

export function createPushService(deps: { repo: Repo; config: Config; clock: Clock; log: FastifyBaseLogger; sender: PushSender; publicKey: string }) {
  const { repo, config, clock, log, sender } = deps;
  const inflight = new Set<Promise<unknown>>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let active = 0;
  const queue: (() => void)[] = [];
  let closed = false;

  function track<T>(p: Promise<T>): Promise<T> {
    inflight.add(p);
    p.then(() => inflight.delete(p), () => inflight.delete(p));
    return p;
  }

  /** Höchstens MAX_PARALLEL Sendungen gleichzeitig. */
  async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= MAX_PARALLEL) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  }

  const target = (s: Subscription): PushTarget => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });

  /** Versand + Auswertung (§5.4). Liefert den HTTP-Status (0 = Netzfehler). */
  async function send(sub: Subscription, payload: PushPayload, options: PushOptions, logIds: number[], attempt = 0, cut = false): Promise<number> {
    const res = await limited(() => sender(target(sub), JSON.stringify(payload), options));
    const at = iso(clock.now());
    for (const id of logIds) repo.setPushLogStatus(id, res.status);
    const st = res.status;
    if (st >= 200 && st < 300) {
      repo.subSuccess(sub.id, at);
    } else if (st === 404 || st === 410) {
      repo.deleteSub(sub.id);
      log.info({ subscriptionId: sub.id, status: st }, 'push.gone');
    } else if (st === 401 || st === 403) {
      repo.deleteSub(sub.id);
      log.warn({ subscriptionId: sub.id, status: st }, 'push.unauthorized – subscription deleted');
    } else if (st === 413 && !cut) {
      return send(sub, shortened(payload), options, logIds, attempt, true);
    } else {
      repo.subFailure(sub.id, at, `${st || 'Netzfehler'} ${res.error ?? ''}`.trim());
      log.warn({ subscriptionId: sub.id, status: st }, 'push.failed');
      if (attempt === 0 && !closed && (st === 0 || st === 429 || st >= 500)) {
        const t = setTimeout(() => {
          timers.delete(t);
          const fresh = repo.getSub(sub.id);
          if (fresh && !closed) void track(send(fresh, payload, options, logIds, 1, cut)).catch(() => {});
        }, config.pushRetryMs);
        t.unref?.();
        timers.add(t);
      }
    }
    return st;
  }

  /**
   * Dedupe-Eintrag schreiben (vor dem Versand, §5.4) und nur bei erfolgreichem Insert senden.
   * discard = Anlass zu alt → nur protokollieren.
   */
  function deliver(kind: PushKind, gameId: number | null, sub: Subscription, msg: PushMessage, o: DeliverOpts = {}): Promise<number | null> {
    const dedupeKey = o.dedupe === false ? null : `${kind}:${gameId}:${sub.id}`;
    const logId = repo.insertPushLog({ kind, gameId, subscriptionId: sub.id, dedupeKey, at: iso(clock.now()) });
    if (logId == null) return Promise.resolve(null);
    if (o.discard) {
      log.info({ kind, gameId, subscriptionId: sub.id }, 'push.discarded (trigger too old)');
      return Promise.resolve(null);
    }
    return track(send(sub, msg.payload, msg.options, [logId]).catch((e) => {
      log.error({ err: e }, 'push.error');
      return 0;
    }));
  }

  const gamesWithTips = (w: World) => w.games.map((g) => ({ ...g, tips: w.tipsByGame.get(g.id) ?? [] }));
  const badgeFor = (w: World, playerKey: string, now: number): number => missingCount(gamesWithTips(w), playerKey, now);
  const nameOf = (w: World, key: string, fallback: string) => w.players.get(key)?.name ?? fallback;
  const hasTip = (w: World, gameId: number, playerKey: string) => (w.tipsByGame.get(gameId) ?? []).some((t) => t.playerKey === playerKey);

  /** Ergebnis-Push an alle Abos mit `result` außer dem Auflöser (§5.4). */
  function notifyResult(gameId: number, actorKey: string | null): Promise<unknown> {
    const now = clock.now();
    const w = loadWorld(repo);
    const game = w.games.find((g) => g.id === gameId);
    if (!game || !game.resolvedAt || game.result == null) return Promise.resolve();
    const scored = scoreGame(game, w.tipsByGame.get(game.id) ?? []);
    const winners = scored.filter((t) => t.isWinner).map((t) => nameOf(w, t.playerKey, t.playerName));
    const jobs: Promise<unknown>[] = [];
    for (const sub of repo.listSubs()) {
      if (!sub.prefs.result || sub.playerKey === actorKey) continue;
      const own = scored.find((t) => t.playerKey === sub.playerKey) ?? null;
      const msg = resultMessage({ ...game, result: game.result }, {
        own, winners, ownName: own ? nameOf(w, own.playerKey, own.playerName) : null, badge: badgeFor(w, sub.playerKey, now),
      });
      jobs.push(deliver('result', game.id, sub, msg));
    }
    return track(Promise.all(jobs));
  }

  /** Korrektur-Push an Abos mit `result` von Spielern mit Tipp, außer dem Korrigierenden. */
  function notifyCorrection(gameId: number, actorKey: string | null, before: TipValues | null): Promise<unknown> {
    const now = clock.now();
    const w = loadWorld(repo);
    const game = w.games.find((g) => g.id === gameId);
    if (!game || !game.resolvedAt || game.result == null) return Promise.resolve();
    const scored = scoreGame(game, w.tipsByGame.get(game.id) ?? []);
    const winners = scored.filter((t) => t.isWinner).map((t) => nameOf(w, t.playerKey, t.playerName));
    const jobs: Promise<unknown>[] = [];
    for (const sub of repo.listSubs()) {
      if (!sub.prefs.result || sub.playerKey === actorKey || !hasTip(w, game.id, sub.playerKey)) continue;
      const msg = correctionMessage(game, { before, after: game.result, winners, badge: badgeFor(w, sub.playerKey, now) });
      jobs.push(deliver('correction', game.id, sub, msg));
    }
    return track(Promise.all(jobs));
  }

  /** Test-Push an genau ein Abo (ohne Dedupe). */
  async function sendTest(sub: Subscription): Promise<number> {
    const w = loadWorld(repo);
    const status = await deliver('test', null, sub, testMessage({ badge: badgeFor(w, sub.playerKey, clock.now()) }), { dedupe: false });
    return status ?? 0;
  }

  // ---- Scheduler-Schritte ------------------------------------------------

  /** Schritt 2: creator_due für geschlossene Wetten mit ≥ 1 Tipp (setzt das Feld auch ohne Abos). */
  function runCreatorDue(w: World): Promise<unknown> {
    const now = clock.now();
    const jobs: Promise<unknown>[] = [];
    for (const g of w.games) {
      if (g.resolvedAt || g.creatorDueSentAt || phaseOf(g, now) !== 'closed') continue;
      repo.updateGame(g.id, { creatorDueSentAt: iso(now) });
      const tips = w.tipsByGame.get(g.id) ?? [];
      if (tips.length === 0) continue;
      const closedAt = Date.parse(g.closedAt ?? g.closesAt ?? iso(now));
      const discard = now - closedAt > STALE_MS;
      for (const sub of repo.subsForPlayer(g.createdByKey)) {
        if (!sub.prefs.creator) continue;
        jobs.push(deliver('creator_due', g.id, sub, creatorDueMessage(g, { tipCount: tips.length, badge: badgeFor(w, sub.playerKey, now) }), { discard }));
      }
    }
    return Promise.all(jobs);
  }

  /** Schritt 3: new_game nach der Verzögerung, gebündelt pro Ersteller. */
  function runNewGames(w: World): Promise<unknown> {
    const now = clock.now();
    const delayMs = config.newGamePushDelaySeconds * 1000;
    const due = w.games
      .filter((g) => !g.pushNewSentAt && Date.parse(g.createdAt) <= now - delayMs)
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
    if (due.length === 0) return Promise.resolve();
    const byCreator = new Map<string, Game[]>();
    for (const g of due) {
      repo.updateGame(g.id, { pushNewSentAt: iso(now) });
      if (phaseOf(g, now) !== 'open') continue; // schon zu oder aufgelöst → keine „Neue Wette“ mehr
      const list = byCreator.get(g.createdByKey) ?? [];
      list.push(g);
      byCreator.set(g.createdByKey, list);
    }
    const subs = repo.listSubs();
    const jobs: Promise<unknown>[] = [];
    const at = iso(now);
    for (const [creatorKey, games] of byCreator) {
      const creator = nameOf(w, creatorKey, games[0]!.createdBy);
      for (const sub of subs) {
        if (!sub.prefs.newGame || sub.playerKey === creatorKey) continue;
        const fresh: Game[] = [];
        const logIds: number[] = [];
        for (const g of games) {
          if (hasTip(w, g.id, sub.playerKey)) continue;
          const id = repo.insertPushLog({ kind: 'new_game', gameId: g.id, subscriptionId: sub.id, dedupeKey: `new_game:${g.id}:${sub.id}`, at });
          if (id == null) continue;
          if (now - Date.parse(g.createdAt) > STALE_MS) {
            log.info({ gameId: g.id, subscriptionId: sub.id }, 'push.discarded (trigger too old)');
            continue;
          }
          fresh.push(g);
          logIds.push(id);
        }
        if (fresh.length === 0) continue;
        const badge = badgeFor(w, sub.playerKey, now);
        const msg = fresh.length === 1
          ? newGameMessage(fresh[0]!, creator, { now, tz: config.displayTz, badge })
          : newGamesBundleMessage(fresh, creator, { badge });
        jobs.push(track(send(sub, msg.payload, msg.options, logIds).catch(() => 0)));
      }
    }
    return Promise.all(jobs);
  }

  /** Erinnerungszeitpunkt: max(closes − h, created + (closes − created)/2). */
  const remindAt = (g: Pick<Game, 'createdAt' | 'closesAt'>, hours: number): number => {
    const closes = Date.parse(g.closesAt!);
    const created = Date.parse(g.createdAt);
    return Math.max(closes - hours * HOUR_MS, created + (closes - created) / 2);
  };

  /** Schritt 4: reminder an Nicht-Tipper (nie an den Ersteller), einmal pro Wette und Abo. */
  function runReminders(w: World): Promise<unknown> {
    const now = clock.now();
    const subs = repo.listSubs().filter((s) => s.prefs.reminder);
    if (subs.length === 0) return Promise.resolve();
    const jobs: Promise<unknown>[] = [];
    for (const g of w.games) {
      if (!g.closesAt || phaseOf(g, now) !== 'open') continue;
      const tips = w.tipsByGame.get(g.id) ?? [];
      for (const sub of subs) {
        if (sub.playerKey === g.createdByKey || tips.some((t) => t.playerKey === sub.playerKey)) continue;
        const at = remindAt(g, sub.prefs.reminderHours);
        if (now < at) continue;
        const msg = reminderMessage(g, { now, othersTipped: tips.length, badge: badgeFor(w, sub.playerKey, now) });
        jobs.push(deliver('reminder', g.id, sub, msg, { discard: now - at > STALE_MS }));
      }
    }
    return Promise.all(jobs);
  }

  /** Schritt 5: creator_overdue – seit ≥ 7 Tagen zu, nicht aufgelöst. */
  function runCreatorOverdue(w: World): Promise<unknown> {
    const now = clock.now();
    const jobs: Promise<unknown>[] = [];
    for (const g of w.games) {
      if (g.resolvedAt || g.creatorOverdueSentAt || !g.closedAt) continue;
      const due = Date.parse(g.closedAt) + 7 * DAY_MS;
      if (now < due) continue;
      repo.updateGame(g.id, { creatorOverdueSentAt: iso(now) });
      for (const sub of repo.subsForPlayer(g.createdByKey)) {
        if (!sub.prefs.creator) continue;
        jobs.push(deliver('creator_overdue', g.id, sub, creatorOverdueMessage(g, { badge: badgeFor(w, sub.playerKey, now) }), { discard: now - due > STALE_MS }));
      }
    }
    return Promise.all(jobs);
  }

  return {
    publicKey: deps.publicKey,
    deliver,
    notifyResult,
    notifyCorrection,
    sendTest,
    runCreatorDue,
    runNewGames,
    runReminders,
    runCreatorOverdue,
    remindAt,
    /** Wartet, bis alle laufenden Sendungen fertig sind (Tests, Shutdown). */
    async idle(): Promise<void> {
      while (inflight.size > 0) await Promise.allSettled([...inflight]);
    },
    close(): void {
      closed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
  };
}
