// buildApp({db, config, pushSender, clock}) – für Tests injizierbar (SPEC §7.1).
import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Config } from './config.ts';
import type { Clock } from './clock.ts';
import { iso, systemClock } from './clock.ts';
import type { Db } from './db/index.ts';
import { createRepo } from './db/repo.ts';
import type { Repo } from './db/repo.ts';
import { createAudit } from './services/audit.ts';
import type { Audit } from './services/audit.ts';
import { createSse } from './services/sse.ts';
import type { SseHub } from './services/sse.ts';
import { applyVapidKey, createPushService, resolveVapidKeys, webPushSender } from './services/push.ts';
import type { PushSender, PushService, VapidKeys } from './services/push.ts';
import { createScheduler } from './services/scheduler.ts';
import type { Scheduler, Timers } from './services/scheduler.ts';
import { categoryOf, createRateLimiter } from './services/rateLimit.ts';
import type { RateLimiter } from './services/rateLimit.ts';
import { err, installErrorHandler } from './services/errors.ts';
import { healthRoutes } from './routes/health.ts';
import { stateRoutes } from './routes/state.ts';
import { gameRoutes } from './routes/games.ts';
import { tipRoutes } from './routes/tips.ts';
import { playerRoutes } from './routes/players.ts';
import { pushRoutes } from './routes/push.ts';
import { eventRoutes } from './routes/events.ts';
import { adminRoutes, hasValidAdminToken } from './routes/admin.ts';
import { staticRoutes } from './routes/static.ts';
import { securityHeaders } from './routes/util.ts';

export const BODY_LIMIT = 64 * 1024;

export type Ctx = {
  db: Db;
  repo: Repo;
  config: Config;
  clock: Clock;
  log: FastifyBaseLogger;
  sse: SseHub;
  audit: Audit;
  push: PushService;
  scheduler: Scheduler;
  rateLimiter: RateLimiter;
};

export type BuildOptions = {
  db: Db;
  config: Config;
  clock?: Clock;
  /** Sendefunktion für Web-Push (Default: web-push mit VAPID). */
  pushSender?: PushSender;
  /** VAPID-Schlüssel (Default: Env oder `${DATA_DIR}/vapid.json`). */
  vapid?: VapidKeys;
  /** Timer für den Scheduler (Tests). */
  timers?: Timers;
};

export type App = FastifyInstance & { benchbet: Ctx };

export async function buildApp(o: BuildOptions): Promise<App> {
  const { db, config } = o;
  const clock = o.clock ?? systemClock;
  const app = Fastify({
    logger: config.logger
      ? { level: config.logLevel, redact: ['req.headers["x-admin-token"]', 'req.headers.cookie'] }
      : false,
    // Zahl, boolean oder IP-Liste – Fastify kann Hop-Zahlen (lib/request.js), die Typen kennen sie nicht
    trustProxy: (config.trustProxy ?? 1) as unknown as boolean,
    bodyLimit: BODY_LIMIT,
    forceCloseConnections: true,
  });

  const repo = createRepo(db);
  const vapid = o.vapid ?? resolveVapidKeys(config);
  applyVapidKey(repo, vapid.publicKey, app.log);
  const sse = createSse();
  const audit = createAudit({ db, repo, clock, sse });
  const push = createPushService({ repo, config, clock, log: app.log, sender: o.pushSender ?? webPushSender(config, vapid), publicKey: vapid.publicKey });
  const scheduler = createScheduler({ repo, config, clock, audit, push, log: app.log, timers: o.timers });
  const rateLimiter = createRateLimiter(clock);
  const ctx: Ctx = { db, repo, config, clock, log: app.log, sse, audit, push, scheduler, rateLimiter };
  app.decorate('benchbet', ctx);

  installErrorHandler(app);

  app.addHook('onRequest', async (req, reply) => {
    reply.headers(securityHeaders());
    reply.header('x-server-time', iso(clock.now()));
    const path = req.url.split('?')[0] ?? '';
    if (path.startsWith('/api/')) reply.header('cache-control', 'no-store');
    if (!config.rateLimit) return;
    const cat = categoryOf(req.method, path);
    if (!cat) return;
    if (path.startsWith('/api/admin/') && hasValidAdminToken(ctx, req)) return;
    const retry = rateLimiter.hit(cat, req.ip);
    if (retry !== null) throw err.rateLimited(retry);
  });

  healthRoutes(app, ctx);
  stateRoutes(app, ctx);
  gameRoutes(app, ctx);
  tipRoutes(app, ctx);
  playerRoutes(app, ctx);
  pushRoutes(app, ctx);
  eventRoutes(app, ctx);
  adminRoutes(app, ctx);
  await staticRoutes(app, ctx);

  app.addHook('preClose', async () => {
    sse.closeAll();
  });
  app.addHook('onClose', async () => {
    await scheduler.stop();
    push.close();
  });

  return app as unknown as App;
}
