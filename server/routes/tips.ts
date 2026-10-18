// Tipps: abgeben, Undo, Moderation, Wiederherstellen (SPEC §2.4, §2.5, §3.3).
import type { FastifyInstance } from 'fastify';
import type { Game, RemovedReason, TipDTO } from '../../shared/types.ts';
import { phaseOf } from '../../shared/phase.ts';
import { validateTip } from '../../shared/parse.ts';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import { canManage, undoUntilOf } from '../services/dto.ts';
import { err } from '../services/errors.ts';
import { creatorName, gameDTO } from './games.ts';
import { actorOf, bodyOf, ensurePlayer, idParam, isAdmin, requireDevice, requireName } from './util.ts';

const REASONS = new Set<RemovedReason>(['duplicate', 'troll', 'request']);

/** Passt ein gespeicherter Wert noch zur Form der Wette (Typ, Anzahl Felder)? Raster/Bereich prüfen wir bewusst nicht (Legacy-Werte). */
const fitsShape = (game: Pick<Game, 'answerType' | 'fields'>, values: unknown): boolean =>
  game.answerType === 'text'
    ? typeof values === 'string'
    : Array.isArray(values) && values.length === game.fields.length && values.every((x) => typeof x === 'number' && Number.isFinite(x));

const isUniqueViolation = (e: unknown): boolean => /UNIQUE constraint failed/i.test(String((e as Error)?.message ?? e));

export function tipRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { repo, audit } = ctx;
  const undoMs = () => ctx.config.undoSeconds * 1000;

  app.post('/api/tips', async (req, reply) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const deviceId = requireDevice(req);
    const gameId = typeof body.gameId === 'number' && Number.isInteger(body.gameId) && body.gameId > 0 ? body.gameId : null;
    if (gameId === null) throw err.gameNotFound();
    const game = repo.getGame(gameId);
    if (!game || game.deletedAt) throw err.gameNotFound();
    const t = ctx.clock.now();
    const phase = phaseOf(game, t);
    if (phase === 'closed') throw err.gameClosed();
    if (phase === 'resolved' || phase === 'archived') throw err.gameResolved();
    if (repo.findActiveTip(gameId, who.key)) throw err.tipExists();
    if (ctx.config.oneTipPerDevice && repo.findActiveTipByDevice(gameId, deviceId)) throw err.deviceTipped();
    // Anti-Peek (§2.5): wer die Werte schon gesehen hat, darf nicht (erneut) tippen –
    // weder nach der Auflösen-Vorschau (dryRun + Wieder öffnen) noch nach einem entfernten Tipp.
    if (repo.hasPreviewed(gameId, who.key)) throw err.tipPreviewed();
    if (repo.hasRemovedTip(gameId, who.key)) throw err.tipRemoved();
    const v = validateTip(game, body.values);
    if (!v.ok) throw err.validation(v.message, v.field);

    const createdAt = iso(t);
    let tipId: number;
    try {
      tipId = audit.tx(() => {
        const player = ensurePlayer(ctx, who);
        const id = repo.insertTip({
          gameId, playerKey: who.key, playerName: who.name, values: v.value, createdAt,
          // Ohne Anti-Peek speichern wir keine Gerätekennung am Tipp (der Unique-Index gilt sonst trotzdem)
          deviceId: ctx.config.oneTipPerDevice ? deviceId : null,
        });
        audit.recordEvent({ type: 'tip.created', gameId, tipId: id, actor: { key: who.key, name: player.name, deviceId }, data: { playerName: player.name } });
        return id;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        if (repo.findActiveTip(gameId, who.key)) throw err.tipExists();
        throw err.deviceTipped();
      }
      throw e;
    }
    const dto = gameDTO(ctx, gameId, who.key);
    const tip = dto.tips.find((x) => x.id === tipId) as TipDTO;
    return reply.code(201).send({ tip, undoUntil: iso(undoUntilOf({ createdAt }, undoMs())!), game: dto });
  });

  app.delete('/api/tips/:id', async (req, reply) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req, err.tipNotFound);
    const tip = repo.getTip(id);
    if (!tip || tip.removedAt) throw err.tipNotFound();
    const game = repo.getGame(tip.gameId);
    if (!game || game.deletedAt) throw err.tipNotFound();
    const actor = actorOf(ctx, who, req);
    const t = ctx.clock.now();

    if (body.reason === undefined || body.reason === null) {
      // Undo des eigenen Tipps
      if (tip.playerKey !== who.key) {
        if (canManage(game, who.key, ctx.config.adminKeys)) throw err.validation('Pick a reason.', 'reason');
        throw err.forbidden(creatorName(ctx, game));
      }
      // Nach der Auflösung (Ergebnis schon sichtbar) gibt es kein Undo mehr
      if (game.resolvedAt) throw err.gameResolved();
      const until = undoUntilOf(tip, undoMs());
      if (until === null || t >= until) throw err.undoExpired();
      audit.tx(() => {
        repo.deleteTipHard(id);
        audit.recordEvent({ type: 'tip.undone', gameId: game.id, tipId: id, actor, data: { playerName: actor.name } });
      });
      return reply.code(204).send();
    }

    // Moderation
    if (typeof body.reason !== 'string' || !REASONS.has(body.reason as RemovedReason)) {
      throw err.validation('Pick a reason: duplicate, troll or on request.', 'reason');
    }
    const reason = body.reason as RemovedReason;
    // Eigenen Tipp nach dem Undo-Fenster „moderieren“ = spicken und neu tippen (§2.5) → nein, auch für Admins
    if (tip.playerKey === who.key) throw err.ownTipModeration();
    if (game.resolvedAt ? !isAdmin(ctx, who.key) : !canManage(game, who.key, ctx.config.adminKeys)) {
      throw err.forbidden(game.resolvedAt ? 'an admin' : creatorName(ctx, game));
    }
    const removedAt = iso(t);
    const playerName = repo.getPlayer(tip.playerKey)?.name ?? tip.playerName;
    audit.tx(() => {
      repo.removeTip(id, removedAt, actor.name ?? who.name, reason);
      audit.recordEvent({ type: 'tip.removed', gameId: game.id, tipId: id, actor, data: { playerName, reason } });
    });
    return { tip: { id, removedAt } };
  });

  app.post('/api/tips/:id/restore', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req, err.tipNotFound);
    const tip = repo.getTip(id);
    if (!tip) throw err.tipNotFound();
    const game = repo.getGame(tip.gameId);
    if (!game || game.deletedAt) throw err.tipNotFound();
    if (game.resolvedAt ? !isAdmin(ctx, who.key) : !canManage(game, who.key, ctx.config.adminKeys)) {
      throw err.forbidden(game.resolvedAt ? 'an admin' : creatorName(ctx, game));
    }
    if (tip.removedAt) {
      if (repo.findActiveTip(game.id, tip.playerKey)) throw err.tipExists();
      if (tip.deviceId && repo.findActiveTipByDevice(game.id, tip.deviceId)) throw err.deviceTipped();
      // Typ oder Felder können sich seit dem Entfernen geändert haben → Wert passt nicht mehr
      if (!fitsShape(game, tip.values)) throw err.tipStale();
      const actor = actorOf(ctx, who, req);
      const playerName = repo.getPlayer(tip.playerKey)?.name ?? tip.playerName;
      try {
        audit.tx(() => {
          repo.restoreTip(id);
          audit.recordEvent({ type: 'tip.restored', gameId: game.id, tipId: id, actor, data: { playerName } });
        });
      } catch (e) {
        if (isUniqueViolation(e)) throw err.tipExists();
        throw e;
      }
    }
    const dto = gameDTO(ctx, game.id, who.key);
    return { tip: dto.tips.find((x) => x.id === id) ?? null };
  });
}
