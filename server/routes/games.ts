// Wetten: lesen, anlegen, bearbeiten, schließen, öffnen, auflösen, korrigieren, löschen (SPEC §2.3–§2.5, §3.3).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ActivityEventDTO, EventType, Game, GameDTO, GameInput, ResolvePreview, Tip, TipValues } from '../../shared/types.ts';
import { phaseOf } from '../../shared/phase.ts';
import { validateClosesAt, validateGameInput, validateGamePatch, validateResult } from '../../shared/parse.ts';
import { scoreGame, textSuggestions } from '../../shared/scoring.ts';
import { charLength } from '../../shared/names.ts';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import { activityText } from '../services/activityText.ts';
import { canManage, gameDTOFromWorld, toGameDTO } from '../services/dto.ts';
import type { View } from '../services/dto.ts';
import { err } from '../services/errors.ts';
import {
  actorOf, bodyOf, ensurePlayer, idParam, isAdmin, optionalName, queryOf, requireName, viewFor,
} from './util.ts';
import type { Who } from './util.ts';

const DAY_MS = 24 * 3600 * 1000;
const REASON_MAX = 200;

/** Spalten, die PATCH ändern darf, in Diff-Reihenfolge. */
const PATCH_KEYS = ['prompt', 'description', 'infoUrl', 'benchmark', 'closesAt', 'template', 'answerType', 'fields'] as const;
type PatchKey = (typeof PATCH_KEYS)[number];
const RESOLVED_LOCKED = new Set<PatchKey>(['prompt', 'closesAt', 'template', 'answerType', 'fields']);
const TYPE_KEYS = new Set<PatchKey>(['answerType', 'fields']);

export function creatorName(ctx: Ctx, game: Game): string {
  return ctx.repo.getPlayer(game.createdByKey)?.name ?? game.createdBy;
}

/** Wette laden (nicht gelöscht) oder 404. */
export function liveGame(ctx: Ctx, id: number): Game {
  const g = ctx.repo.getGame(id);
  if (!g || g.deletedAt) throw err.gameNotFound();
  return g;
}

/** Wette laden und Verwalterrecht prüfen (§2.4). */
export function managedGame(ctx: Ctx, id: number, who: Who, opts: { allowDeleted?: boolean } = {}): Game {
  const g = ctx.repo.getGame(id);
  if (!g || (g.deletedAt && !opts.allowDeleted)) throw err.gameNotFound();
  if (!canManage(g, who.key, ctx.config.adminKeys)) throw err.forbidden(creatorName(ctx, g));
  return g;
}

export function gameDTO(ctx: Ctx, id: number, viewerKey: string | null, v?: View): GameDTO {
  const view = v ?? viewFor(ctx, viewerKey);
  const g = view.world.games.find((x) => x.id === id);
  if (g) return gameDTOFromWorld(g, view);
  const raw = ctx.repo.getGame(id);
  if (!raw) throw err.gameNotFound();
  return toGameDTO(raw, ctx.repo.activeTips(id), view);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** winnerTipIds prüfen: nur text, nur aktive Tipps dieser Wette. undefined = automatisch. */
function parseWinnerIds(game: Game, raw: unknown, tips: Tip[]): number[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (game.answerType !== 'text') throw err.validation('Picking winners only works for free-answer bets.', 'winnerTipIds');
  if (!Array.isArray(raw) || !raw.every((x) => Number.isInteger(x))) throw err.validation('That winner selection isn’t valid.', 'winnerTipIds');
  const ids = new Set(tips.map((t) => t.id));
  const out = [...new Set(raw as number[])].sort((a, b) => a - b);
  if (out.some((x) => !ids.has(x))) throw err.validation('At least one selected guess isn’t (or is no longer) part of this bet.', 'winnerTipIds');
  return out;
}

function buildPreview(ctx: Ctx, game: Game, tips: Tip[], result: TipValues | null, winnerTipIds: number[] | undefined): ResolvePreview {
  const players = new Map(ctx.repo.listPlayers().map((p) => [p.key, p.name]));
  const g = { ...game, resolvedAt: iso(ctx.clock.now()), result, winnerTipIds: winnerTipIds ?? null };
  const scored = scoreGame(g, tips);
  const out: ResolvePreview = {
    tips: scored.map((t) => ({
      id: t.id, playerName: players.get(t.playerKey) ?? t.playerName, values: t.values, distance: t.distance, rank: t.rank, isWinner: t.isWinner,
    })),
    winners: scored.filter((t) => t.isWinner).map((t) => players.get(t.playerKey) ?? t.playerName),
  };
  if (game.answerType === 'text') out.suggestions = textSuggestions(typeof result === 'string' ? result : null, tips);
  return out;
}

export function gameRoutes(app: FastifyInstance, ctx: Ctx): void {
  const { repo, audit } = ctx;
  const now = () => ctx.clock.now();

  // ---- lesen -----------------------------------------------------------
  app.get('/api/games/:id', async (req) => {
    const who = optionalName(queryOf(req).name);
    const id = idParam(req);
    liveGame(ctx, id);
    const v = viewFor(ctx, who?.key ?? null);
    return { game: gameDTO(ctx, id, who?.key ?? null, v), serverTime: iso(v.now) };
  });

  // ---- anlegen ---------------------------------------------------------
  app.post('/api/games', async (req, reply) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const r = validateGameInput(body, { now: now() });
    if (!r.ok) throw err.validation(r.message, r.field);
    const input: GameInput = r.value;
    const id = audit.tx(() => {
      const player = ensurePlayer(ctx, who);
      const gid = repo.insertGame({
        prompt: input.prompt, description: input.description ?? '', infoUrl: input.infoUrl ?? null, benchmark: input.benchmark ?? '',
        template: input.template, answerType: input.answerType, fields: input.answerType === 'text' ? [] : input.fields,
        createdByKey: who.key, createdBy: who.name, createdAt: iso(now()), closesAt: input.closesAt,
      });
      audit.recordEvent({ type: 'game.created', gameId: gid, actor: { key: who.key, name: player.name, deviceId: actorOf(ctx, who, req).deviceId } });
      return gid;
    });
    ctx.scheduler.poke();
    return reply.code(201).send({ game: gameDTO(ctx, id, who.key) });
  });

  // ---- bearbeiten ------------------------------------------------------
  app.patch('/api/games/:id', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who);
    const t = now();
    const patch = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch) ? (body.patch as Record<string, unknown>) : null;
    if (!patch) throw err.validation('Nothing to change – the patch is missing.', 'patch');
    const r = validateGamePatch(patch, { now: t, base: { answerType: game.answerType, fields: game.fields, template: game.template }, skipClosesAtCheck: true });
    if (!r.ok) throw err.validation(r.message, r.field);
    const p = r.value as Partial<GameInput>;
    const changes: Record<string, [unknown, unknown]> = {};
    for (const k of PATCH_KEYS) {
      if (!(k in p)) continue;
      const before = (game as Record<string, unknown>)[k];
      const after = (p as Record<string, unknown>)[k];
      if (!same(before, after)) changes[k] = [before ?? null, after ?? null];
    }
    const changed = Object.keys(changes) as PatchKey[];
    const phase = phaseOf(game, t);
    const resolved = phase === 'resolved' || phase === 'archived';
    if (resolved && changed.some((k) => RESOLVED_LOCKED.has(k))) throw err.gameResolved();

    const tips = repo.activeTips(id);
    const foreign = new Set(tips.filter((x) => x.playerKey !== game.createdByKey).map((x) => x.playerKey)).size;
    const typeChange = changed.some((k) => TYPE_KEYS.has(k));
    if (typeChange && foreign > 0) throw err.fieldsLocked(foreign);

    let shortened = false;
    if ('closesAt' in changes) {
      if (phase !== 'open') throw err.gameNotOpen();
      const next = p.closesAt ?? null;
      const prev = game.closesAt;
      const extending = next === null || (prev !== null && Date.parse(next) >= Date.parse(prev));
      if (!extending) {
        const c = validateClosesAt(next, t);
        if (!c.ok) throw err.validation(c.message, 'closesAt');
      }
      shortened = next !== null && (prev === null || Date.parse(next) < Date.parse(prev));
    }

    if (changed.length > 0) {
      const actor = actorOf(ctx, who, req);
      audit.tx(() => {
        const update: Partial<Game> = {};
        for (const k of changed) (update as Record<string, unknown>)[k] = (p as Record<string, unknown>)[k];
        if (foreign > 0) update.editedAt = iso(t);
        if (foreign > 0 && 'prompt' in changes) update.promptEditedAt = iso(t);
        let ownTipReset = false;
        if (typeChange) {
          const own = tips.find((x) => x.playerKey === game.createdByKey);
          if (own) {
            repo.deleteTipHard(own.id);
            ownTipReset = true;
            audit.recordEvent({ type: 'tip.undone', gameId: id, tipId: own.id, actor, data: { playerName: own.playerName, reason: 'edit' } });
          }
        }
        repo.updateGame(id, update);
        if (shortened) repo.deletePushLogs('reminder', id);
        audit.recordEvent({ type: 'game.edited', gameId: id, actor, data: { changes, ...(ownTipReset ? { ownTipReset: true } : {}) } });
      });
      ctx.scheduler.poke(shortened);
    }
    return { game: gameDTO(ctx, id, who.key) };
  });

  // ---- schließen -------------------------------------------------------
  app.post('/api/games/:id/close', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who);
    const t = now();
    if (phaseOf(game, t) !== 'open') throw err.gameNotOpen();
    const actor = actorOf(ctx, who, req);
    audit.tx(() => {
      repo.updateGame(id, {
        closedAt: iso(t), closedBy: actor.name,
        // creator_due nur, wenn ein Admin statt des Erstellers schließt (§5.4)
        ...(who.key === game.createdByKey ? { creatorDueSentAt: iso(t) } : {}),
      });
      audit.recordEvent({ type: 'game.closed', gameId: id, actor, data: { auto: false, plannedClosesAt: game.closesAt } });
    });
    ctx.scheduler.poke(true);
    return { game: gameDTO(ctx, id, who.key) };
  });

  // ---- wieder öffnen ---------------------------------------------------
  app.post('/api/games/:id/reopen', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who);
    const t = now();
    if (phaseOf(game, t) !== 'closed') throw err.gameNotClosed();
    const raw = body.closesAt === undefined ? null : body.closesAt;
    // Undo von „Schließen“: der bisherige Tippschluss darf zurück, solange er in der Zukunft liegt
    const keepPlanned = typeof raw === 'string' && game.closesAt !== null && Date.parse(raw) === Date.parse(game.closesAt) && Date.parse(game.closesAt) > t;
    let closesAt: string | null;
    if (keepPlanned) closesAt = game.closesAt;
    else {
      const c = validateClosesAt(raw, t);
      if (!c.ok) throw err.validation(c.message, 'closesAt');
      closesAt = c.value;
    }
    const actor = actorOf(ctx, who, req);
    audit.tx(() => {
      repo.updateGame(id, { closedAt: null, closedBy: null, closesAt, creatorDueSentAt: null, creatorOverdueSentAt: null });
      repo.deletePushLogs('reminder', id);
      repo.deletePushLogs('creator_due', id);
      repo.deletePushLogs('creator_overdue', id);
      audit.recordEvent({ type: 'game.reopened', gameId: id, actor, data: { closesAt } });
    });
    ctx.scheduler.poke(true);
    return { game: gameDTO(ctx, id, who.key) };
  });

  // ---- auflösen --------------------------------------------------------
  app.post('/api/games/:id/resolve', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who);
    const t = now();
    const phase = phaseOf(game, t);
    if (phase === 'resolved' || phase === 'archived') throw err.gameResolved();
    const dryRun = body.dryRun === true;
    if (dryRun && phase === 'open') throw err.gameOpen();
    const tips = repo.activeTips(id);
    let result: TipValues | null = null;
    if (!(dryRun && game.answerType === 'text' && (body.result === undefined || body.result === null || body.result === ''))) {
      const r = validateResult(game, body.result);
      if (!r.ok) throw err.validation(r.message, 'result');
      result = r.value;
    }
    const winnerTipIds = parseWinnerIds(game, body.winnerTipIds, tips);
    if (dryRun) {
      // Wer ohne eigenen Tipp alle Werte sieht, darf danach (z. B. nach Wieder öffnen) nicht mehr tippen (§2.5).
      // Einmal pro Verwalter und Wette protokollieren; sichtbar im Verlauf, kein SSE.
      if (!tips.some((x) => x.playerKey === who.key) && !repo.hasPreviewed(id, who.key)) {
        audit.recordEvent({ type: 'game.previewed', gameId: id, actor: actorOf(ctx, who, req), broadcast: false });
      }
      return { preview: buildPreview(ctx, game, tips, result, winnerTipIds) };
    }

    const actor = actorOf(ctx, who, req);
    audit.tx(() => {
      const at = iso(t);
      if (!game.closedAt) {
        // closed_at ??= now (§2.3). Lief der Tippschluss schon ab, ohne dass der Scheduler schloss, gilt er als Schlusszeit.
        const deadlinePassed = game.closesAt !== null && Date.parse(game.closesAt) <= t;
        repo.updateGame(id, { closedAt: deadlinePassed ? game.closesAt : at, closedBy: deadlinePassed ? null : actor.name });
        audit.recordEvent(deadlinePassed
          ? { type: 'game.closed', gameId: id, actor: null, data: { auto: true, plannedClosesAt: game.closesAt } }
          : { type: 'game.closed', gameId: id, actor, data: { auto: false, plannedClosesAt: game.closesAt, resolving: true } });
      }
      repo.updateGame(id, {
        resolvedAt: at, resolvedBy: actor.name, result, winnerTipIds: game.answerType === 'text' ? winnerTipIds ?? null : null,
        creatorDueSentAt: game.creatorDueSentAt ?? at, creatorOverdueSentAt: game.creatorOverdueSentAt ?? at,
      });
      audit.recordEvent({ type: 'game.resolved', gameId: id, actor, data: { result, winnerTipIds: winnerTipIds ?? null } });
    });
    void ctx.push.notifyResult(id, who.key).catch((e) => req.log.error({ err: e }, 'push.result'));
    ctx.scheduler.poke();
    return { game: gameDTO(ctx, id, who.key) };
  });

  // ---- korrigieren -----------------------------------------------------
  app.post('/api/games/:id/correct', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who);
    const t = now();
    const phase = phaseOf(game, t);
    if (phase !== 'resolved' && phase !== 'archived') throw err.gameNotResolved();
    if (phase === 'archived' && !isAdmin(ctx, who.key)) throw err.gameArchived();
    const reasonRaw = body.reason ?? '';
    if (typeof reasonRaw !== 'string' || charLength(reasonRaw.trim()) > REASON_MAX) throw err.validation('Keep the reason to 200 characters.', 'reason');
    const reason = reasonRaw.trim();
    const tips = repo.activeTips(id);
    const r = validateResult(game, body.result);
    if (!r.ok) throw err.validation(r.message, 'result');
    const result = r.value;
    const winnerTipIds = parseWinnerIds(game, body.winnerTipIds, tips);
    if (body.dryRun === true) return { preview: buildPreview(ctx, game, tips, result, winnerTipIds) };

    const actor = actorOf(ctx, who, req);
    const before = { result: game.result, winnerTipIds: game.winnerTipIds };
    const after = { result, winnerTipIds: game.answerType === 'text' ? winnerTipIds ?? null : null };
    audit.tx(() => {
      repo.updateGame(id, { result: after.result, winnerTipIds: after.winnerTipIds, correctedAt: iso(t) });
      audit.recordEvent({ type: 'game.corrected', gameId: id, actor, data: { before, after, reason: reason || null } });
    });
    void ctx.push.notifyCorrection(id, who.key, before.result).catch((e) => req.log.error({ err: e }, 'push.correction'));
    return { game: gameDTO(ctx, id, who.key) };
  });

  // ---- gesehen ---------------------------------------------------------
  app.post('/api/games/:id/seen', async (req, reply) => {
    const who = requireName(bodyOf(req));
    const id = idParam(req);
    const game = liveGame(ctx, id);
    if (!game.resolvedAt) throw err.gameNotResolved();
    if (repo.getPlayer(who.key)) repo.markSeen(who.key, id, iso(now()));
    return reply.code(204).send();
  });

  // ---- löschen / wiederherstellen -------------------------------------
  app.delete('/api/games/:id', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    managedGame(ctx, id, who);
    const t = now();
    const actor = actorOf(ctx, who, req);
    audit.tx(() => {
      repo.updateGame(id, { deletedAt: iso(t), deletedBy: actor.name });
      audit.recordEvent({ type: 'game.deleted', gameId: id, actor });
    });
    ctx.scheduler.poke();
    return { deletedAt: iso(t), restoreUntil: iso(t + ctx.config.trashDays * DAY_MS) };
  });

  app.post('/api/games/:id/restore', async (req) => {
    const body = bodyOf(req);
    const who = requireName(body);
    const id = idParam(req);
    const game = managedGame(ctx, id, who, { allowDeleted: true });
    if (!game.deletedAt) throw err.notDeleted();
    const t = now();
    if (Date.parse(game.deletedAt) + ctx.config.trashDays * DAY_MS < t) throw err.gameNotFound();
    const actor = actorOf(ctx, who, req);
    audit.tx(() => {
      repo.updateGame(id, { deletedAt: null, deletedBy: null });
      audit.recordEvent({ type: 'game.restored', gameId: id, actor });
    });
    ctx.scheduler.poke();
    return { game: gameDTO(ctx, id, who.key) };
  });

  app.get('/api/trash', async (req) => {
    const who = optionalName(queryOf(req).name);
    if (!who) return { games: [] };
    const t = now();
    const admin = isAdmin(ctx, who.key);
    const v = viewFor(ctx, who.key);
    const games = repo.listGames({ deleted: true })
      .filter((g) => g.deletedAt && (admin || g.createdByKey === who.key) && Date.parse(g.deletedAt) + ctx.config.trashDays * DAY_MS >= t)
      .sort((a, b) => Date.parse(b.deletedAt!) - Date.parse(a.deletedAt!))
      .map((g) => ({
        ...toGameDTO(g, repo.activeTips(g.id), v),
        deletedAt: g.deletedAt!,
        restoreUntil: iso(Date.parse(g.deletedAt!) + ctx.config.trashDays * DAY_MS),
      }));
    return { games };
  });

  // ---- Verlauf ---------------------------------------------------------
  app.get('/api/games/:id/activity', async (req: FastifyRequest) => {
    const who = optionalName(queryOf(req).name);
    const id = idParam(req);
    const game = repo.getGame(id);
    if (!game || (game.deletedAt && !canManage(game, who?.key ?? null, ctx.config.adminKeys))) throw err.gameNotFound();
    const o = { now: now(), timeZone: ctx.config.displayTz };
    const events: ActivityEventDTO[] = repo.gameEvents(id)
      .filter((e) => e.type !== 'tip.created' && e.type !== 'tip.undone')
      .map((e) => ({
        id: e.id, at: e.at, type: e.type as EventType, actorName: e.actorName, deviceTag: e.deviceTag, data: e.data,
        text: activityText(e, game, o),
      }));
    return { events };
  });
}

