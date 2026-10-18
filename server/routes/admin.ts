// Admin: Import und Export (SPEC §3.3 „Admin“, §6.4). Ohne ADMIN_TOKEN antworten die Routen mit 404.
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import { err } from '../services/errors.ts';
import { importSnapshot } from '../services/importLegacy.ts';
import type { ImportMode } from '../services/importLegacy.ts';
import { queryOf } from './util.ts';

export const IMPORT_BODY_LIMIT = 5 * 1024 * 1024;

/** Zeitkonstanter Token-Vergleich (§3.6). */
export function tokenMatches(expected: string, given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function hasValidAdminToken(ctx: Ctx, req: FastifyRequest): boolean {
  return !!ctx.config.adminToken && tokenMatches(ctx.config.adminToken, req.headers['x-admin-token']);
}

function requireAdmin(ctx: Ctx, req: FastifyRequest): void {
  if (!ctx.config.adminToken) throw err.notFound();
  if (!hasValidAdminToken(ctx, req)) throw err.adminToken();
}

function flag(v: string | undefined, name: string, def: boolean): boolean {
  if (v === undefined || v === '') return def;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw err.validation(`${name} must be true or false.`, name);
}

export function adminRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.post('/api/admin/import', { bodyLimit: IMPORT_BODY_LIMIT }, async (req) => {
    requireAdmin(ctx, req);
    const q = queryOf(req);
    const mode = (q.mode ?? 'empty') as ImportMode;
    if (mode !== 'empty' && mode !== 'replace') throw err.validation('mode must be empty or replace.', 'mode');
    const dryRun = flag(q.dryRun, 'dryRun', false);
    const force = flag(q.force, 'force', false);
    const { report, completedEventId } = importSnapshot(ctx, req.body, { mode, dryRun, force });
    if (completedEventId !== null) {
      ctx.sse.broadcast(completedEventId, { type: 'import.completed', gameId: null, at: iso(ctx.clock.now()), actor: null });
      ctx.scheduler.poke();
    }
    req.log.info({ dryRun, mode, games: report.imported.games, tips: report.imported.tips, mismatches: report.checks.scoring.mismatches.length }, 'import');
    return report;
  });

  app.get('/api/admin/export', async (req) => {
    requireAdmin(ctx, req);
    const r = ctx.repo;
    return {
      format: 'benchbet-export@1',
      exportedAt: iso(ctx.clock.now()),
      version: ctx.config.version,
      tables: {
        meta: r.dumpTable('meta'),
        players: r.dumpTable('players'),
        games: r.dumpTable('games'),
        tips: r.dumpTable('tips'),
        result_seen: r.dumpTable('result_seen'),
        push_subscriptions: r.dumpTable('push_subscriptions', ['p256dh', 'auth']),
        push_log: r.dumpTable('push_log'),
        events: r.dumpTable('events'),
      },
    };
  });
}
