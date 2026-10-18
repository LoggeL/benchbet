// GET /api/events (SPEC §3.4): SSE ohne Nutzdaten – Clients holen nach jedem `change` /api/state.
import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import { err } from '../services/errors.ts';
import { clientIp, optionalName, queryOf, securityHeaders } from './util.ts';

/** Gleichzeitige SSE-Verbindungen pro IP (sonst kann ein Client alle 200 Plätze belegen). */
export const SSE_MAX_PER_IP = 30;

export function eventRoutes(app: FastifyInstance, ctx: Ctx): void {
  const perIp = new Map<string, number>();
  app.get('/api/events', async (req, reply) => {
    optionalName(queryOf(req).name);
    if (ctx.sse.isFull()) throw err.unavailable();
    const ip = clientIp(req, ctx.config.clientIpHeader);
    if (ctx.config.rateLimit && (perIp.get(ip) ?? 0) >= SSE_MAX_PER_IP) throw err.rateLimited(30);
    const now = ctx.clock.now();
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      ...securityHeaders(),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-server-time': iso(now),
    });
    raw.socket?.setNoDelay?.(true);
    raw.socket?.setKeepAlive?.(true);
    ctx.sse.add(raw, { serverTime: iso(now), version: ctx.config.version });
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    let closed = false;
    const done = () => {
      ctx.sse.remove(raw);
      if (closed) return;
      closed = true;
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n > 0) perIp.set(ip, n);
      else perIp.delete(ip);
    };
    req.raw.on('close', done);
    raw.on('close', done);
    raw.on('error', done);
  });
}
