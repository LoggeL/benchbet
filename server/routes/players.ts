// PATCH /api/players/:key (Admin): verstecken, Schreibweise ändern (SPEC §3.3).
import type { FastifyInstance } from 'fastify';
import { nameKey, validateName } from '../../shared/names.ts';
import type { Ctx } from '../app.ts';
import { loadWorld, playerDTO } from '../services/dto.ts';
import { err } from '../services/errors.ts';
import { actorOf, bodyOf, isAdmin, requireName } from './util.ts';

export function playerRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.patch('/api/players/:key', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    if (!isAdmin(ctx, who.key)) throw err.forbidden('an admin');
    const rawKey = (req.params as Record<string, string>).key ?? '';
    const key = nameKey(rawKey);
    const player = ctx.repo.getPlayer(key);
    if (!player) throw err.notFound();
    const patch = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch) ? (body.patch as Record<string, unknown>) : null;
    if (!patch) throw err.validation('Nothing to change – the patch is missing.', 'patch');
    const update: { hidden?: boolean; name?: string } = {};
    if (patch.hidden !== undefined) {
      if (typeof patch.hidden !== 'boolean') throw err.validation('hidden must be true or false.', 'hidden');
      if (patch.hidden !== player.hidden) update.hidden = patch.hidden;
    }
    if (patch.displayName !== undefined) {
      const c = validateName(patch.displayName);
      if (!c.ok) throw err.validation(c.message, 'displayName');
      if (c.key !== key) throw err.validation('Only the spelling can change (case, spaces). A different name is a different person.', 'displayName');
      if (c.name !== player.name) update.name = c.name;
    }
    if (Object.keys(update).length > 0) {
      const actor = actorOf(ctx, who, req);
      ctx.audit.tx(() => {
        ctx.repo.updatePlayer(key, update);
        ctx.audit.recordEvent({ type: 'player.updated', actor, data: { key, ...update } });
      });
    }
    const fresh = ctx.repo.getPlayer(key)!;
    return { player: playerDTO(fresh, loadWorld(ctx.repo).info.get(key), true) };
  });
}
