// Push-Abos (SPEC §3.3 „Push“, §5.2).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PushPrefs } from '../../shared/types.ts';
import { DEFAULT_PUSH_PREFS } from '../../shared/types.ts';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import type { Subscription } from '../db/repo.ts';
import { err } from '../services/errors.ts';
import { bodyOf, deviceIdOf, ensurePlayer, optionalName, queryOf, requireDevice } from './util.ts';
import { validateName } from '../../shared/names.ts';

const HOURS = new Set([1, 2, 6, 24]);
const PREF_BOOLS = ['newGame', 'result', 'reminder', 'creator'] as const;

/** Teilweise Prefs prüfen und mit `base` mischen. */
export function mergePrefs(base: PushPrefs, raw: unknown): PushPrefs {
  if (raw === undefined || raw === null) return base;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw err.validation('Those push settings aren’t valid.', 'prefs');
  const o = raw as Record<string, unknown>;
  const out: PushPrefs = { ...base };
  for (const k of PREF_BOOLS) {
    if (o[k] === undefined) continue;
    if (typeof o[k] !== 'boolean') throw err.validation('Those push settings aren’t valid.', 'prefs');
    out[k] = o[k] as boolean;
  }
  if (o.reminderHours !== undefined) {
    if (!HOURS.has(o.reminderHours as number)) throw err.validation('Reminders can go out 1, 2, 6 or 24 hours before.', 'prefs');
    out.reminderHours = o.reminderHours as PushPrefs['reminderHours'];
  }
  return out;
}

type SubInput = { endpoint: string; p256dh: string; auth: string };

/** Ist der Endpoint ein https-URL eines bekannten Push-Dienstes? (Schutz vor SSRF, §3.6) */
export function isAllowedEndpoint(endpoint: string, hosts: readonly string[]): boolean {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
    const h = u.hostname.toLowerCase();
    return hosts.some((x) => h === x || h.endsWith(`.${x}`));
  } catch {
    return false;
  }
}

/** Web-Push-Subscription prüfen ({endpoint, keys: {p256dh, auth}}); neue Endpoints nur bei bekannten Push-Diensten. */
export function parseSubscription(raw: unknown, hosts: readonly string[]): SubInput {
  const bad = () => err.validation('That push subscription isn’t valid.', 'subscription');
  if (!raw || typeof raw !== 'object') throw bad();
  const o = raw as Record<string, unknown>;
  const endpoint = parseEndpoint(o.endpoint);
  if (!isAllowedEndpoint(endpoint, hosts)) throw err.validation('That push service isn’t supported.', 'endpoint');
  const keys = o.keys as Record<string, unknown> | undefined;
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  const b64 = /^[A-Za-z0-9_\-+/=]{8,512}$/;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !b64.test(p256dh) || !b64.test(auth)) throw bad();
  return { endpoint, p256dh, auth };
}

function parseEndpoint(v: unknown): string {
  if (typeof v !== 'string' || v.length > 2000) throw err.validation('That push subscription isn’t valid.', 'endpoint');
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('protocol');
  } catch {
    throw err.validation('That push subscription isn’t valid.', 'endpoint');
  }
  return v;
}

const userAgent = (req: FastifyRequest): string | null => {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 300) : null;
};

export function pushRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { repo } = ctx;
  const at = () => iso(ctx.clock.now());

  function subByEndpoint(raw: unknown): Subscription {
    const sub = repo.subByEndpoint(parseEndpoint(raw));
    if (!sub) throw err.subscriptionNotFound();
    return sub;
  }

  app.get('/api/push/config', async (req) => {
    const who = optionalName(queryOf(req).name);
    const audience = repo.listSubs().filter((s) => s.prefs.newGame && s.playerKey !== who?.key).length;
    return { publicKey: ctx.push.publicKey, audience };
  });

  app.post('/api/push/subscribe', async (req, reply) => {
    const body = bodyOf(req);
    const deviceId = requireDevice(req);
    if (body.name == null || (typeof body.name === 'string' && body.name.trim() === '')) throw err.nameRequired();
    const c = validateName(body.name);
    if (!c.ok) throw err.nameInvalid();
    const sub = parseSubscription(body.subscription, ctx.config.pushHosts);
    const existing = repo.subByEndpoint(sub.endpoint);
    const prefs = mergePrefs(existing?.prefs ?? DEFAULT_PUSH_PREFS, body.prefs);
    let id: number;
    ctx.audit.tx(() => {
      ensurePlayer(ctx, { name: c.name, key: c.key });
      if (existing) {
        repo.updateSub(existing.id, { p256dh: sub.p256dh, auth: sub.auth, playerKey: c.key, deviceId, prefs, userAgent: userAgent(req) }, at());
        id = existing.id;
      } else {
        id = repo.insertSub({ ...sub, playerKey: c.key, deviceId, prefs, userAgent: userAgent(req), at: at() });
      }
    });
    // Opt-in: Test-Push „Push works.“ nur beim ersten Anmelden dieses Endpoints – nicht bei automatischem Neu-Abo (silent)
    if (!existing && body.silent !== true) {
      const fresh = repo.getSub(id!);
      if (fresh) void ctx.push.sendTest(fresh).catch((e) => req.log.warn({ err: e }, 'push.test'));
    }
    return reply.code(201).send({ subscriptionId: id!, prefs });
  });

  app.post('/api/push/lookup', async (req) => {
    requireDevice(req);
    const sub = subByEndpoint(bodyOf(req).endpoint);
    return { subscriptionId: sub.id, name: repo.getPlayer(sub.playerKey)?.name ?? sub.playerKey, prefs: sub.prefs };
  });

  app.patch('/api/push/subscription', async (req) => {
    const body = bodyOf(req);
    const sub = subByEndpoint(body.endpoint);
    const update: { playerKey?: string; prefs?: PushPrefs; deviceId?: string } = {};
    if (body.name !== undefined) {
      const c = validateName(body.name);
      if (!c.ok) throw err.nameInvalid();
      ensurePlayer(ctx, { name: c.name, key: c.key });
      update.playerKey = c.key;
    }
    if (body.prefs !== undefined) update.prefs = mergePrefs(sub.prefs, body.prefs);
    const dev = deviceIdOf(req);
    if (dev) update.deviceId = dev;
    repo.updateSub(sub.id, update, at());
    return { prefs: update.prefs ?? sub.prefs };
  });

  app.delete('/api/push/subscription', async (req, reply) => {
    const body = bodyOf(req);
    const sub = repo.subByEndpoint(parseEndpoint(body.endpoint));
    if (sub) repo.deleteSub(sub.id);
    return reply.code(204).send();
  });

  app.post('/api/push/resubscribe', async (req) => {
    const body = bodyOf(req);
    if (typeof body.oldEndpoint !== 'string' || !body.oldEndpoint) throw err.subscriptionNotFound();
    const old = repo.subByEndpoint(body.oldEndpoint);
    if (!old) throw err.subscriptionNotFound();
    const sub = parseSubscription(body.subscription, ctx.config.pushHosts);
    const deviceId = deviceIdOf(req) ?? old.deviceId;
    let id = old.id;
    ctx.audit.tx(() => {
      const clash = repo.subByEndpoint(sub.endpoint);
      if (clash && clash.id !== old.id) {
        repo.updateSub(clash.id, { p256dh: sub.p256dh, auth: sub.auth, playerKey: old.playerKey, deviceId, prefs: old.prefs }, at());
        repo.deleteSub(old.id);
        id = clash.id;
      } else {
        repo.updateSub(old.id, { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, deviceId }, at());
      }
    });
    return { subscriptionId: id, prefs: old.prefs };
  });

  app.post('/api/push/test', async (req, reply) => {
    requireDevice(req);
    const sub = subByEndpoint(bodyOf(req).endpoint);
    const status = await ctx.push.sendTest(sub);
    // Nur ok/fehlgeschlagen zurückgeben – der Status des fremden Servers geht den Aufrufer nichts an
    if (status >= 200 && status < 300) return reply.code(202).send({ ok: true });
    throw err.pushFailed();
  });
}
