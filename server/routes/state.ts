// GET /api/state (SPEC §3.3): alles, was die App braucht, in einem Request.
import type { FastifyInstance } from 'fastify';
import type { StateDTO } from '../../shared/types.ts';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import { gameDTOFromWorld, playerDTOs, statsOf } from '../services/dto.ts';
import { isAdmin, optionalName, queryOf, viewFor } from './util.ts';

export function stateRoutes(app: FastifyInstance, ctx: Ctx): void {
  app.get('/api/state', async (req): Promise<StateDTO> => {
    const who = optionalName(queryOf(req).name);
    const v = viewFor(ctx, who?.key ?? null);
    const admin = isAdmin(ctx, who?.key ?? null);
    const known = who ? v.world.players.get(who.key) : undefined;
    return {
      serverTime: iso(v.now),
      version: ctx.config.version,
      me: who ? { name: known?.name ?? who.name, key: who.key, isAdmin: admin, known: !!known } : null,
      games: v.world.games.map((g) => gameDTOFromWorld(g, v)),
      players: playerDTOs(v.world, admin),
      stats: statsOf(v.world),
      config: {
        undoSeconds: ctx.config.undoSeconds,
        vapidPublicKey: ctx.push.publicKey,
        newGamePushDelaySeconds: ctx.config.newGamePushDelaySeconds,
      },
    };
  });
}
