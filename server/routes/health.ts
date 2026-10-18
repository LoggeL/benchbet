// GET /healthz (SPEC §3.3): kein Rate-Limit, kein Log.
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.ts';

export function healthRoutes(app: FastifyInstance, ctx: Ctx): void {
  const started = Date.now();
  app.get('/healthz', { logLevel: 'silent' }, async (_req, reply) => {
    let db = 'ok';
    try {
      ctx.db.prepare('SELECT 1').get();
    } catch {
      db = 'error';
    }
    const body = { ok: db === 'ok', version: ctx.config.version, db, uptimeS: Math.round((Date.now() - started) / 1000) };
    return reply.code(db === 'ok' ? 200 : 503).send(body);
  });
}
