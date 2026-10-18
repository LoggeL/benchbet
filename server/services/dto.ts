// DTOs inkl. Sichtbarkeit (SPEC §2.5, §3.2). Verdeckte Werte verlassen den Server nie.
import type { Game, GameDTO, Player, PlayerDTO, StatsDTO, Tip, TipDTO } from '../../shared/types.ts';
import { archiveAt, closingSoon, phaseOf } from '../../shared/phase.ts';
import { scoreGame } from '../../shared/scoring.ts';
import { ruleSummary } from '../../shared/format.ts';
import { notYetTipped } from '../../shared/inbox.ts';
import type { ActivePlayer } from '../../shared/inbox.ts';
import { statsFor } from '../../shared/stats.ts';
import type { Repo } from '../db/repo.ts';

const NEW_PLAYER_MS = 14 * 24 * 3600 * 1000;

export type PlayerInfo = { tipCount: number; lastTipAt: string | null; firstTipId: number | null };

/** Gesamter (kleiner) Datenstand: alle nicht gelöschten Wetten mit aktiven Tipps + Spieler. */
export type World = {
  games: Game[];
  tipsByGame: Map<number, Tip[]>;
  players: Map<string, Player>;
  info: Map<string, PlayerInfo>;
};

export function loadWorld(repo: Repo): World {
  const games = repo.listGames();
  const createdAt = new Map(games.map((g) => [g.id, g.createdAt]));
  const tipsByGame = new Map<number, Tip[]>(games.map((g) => [g.id, []]));
  const info = new Map<string, PlayerInfo>();
  for (const t of repo.allActiveTips()) {
    tipsByGame.get(t.gameId)?.push(t);
    // Legacy-Tipps haben kein created_at → Zeitpunkt der Wette (sonst gälte nach dem Import niemand als aktiv)
    const at = t.createdAt ?? createdAt.get(t.gameId) ?? null;
    const p = info.get(t.playerKey) ?? { tipCount: 0, lastTipAt: null, firstTipId: null };
    p.tipCount++;
    if (at && (!p.lastTipAt || at > p.lastTipAt)) p.lastTipAt = at;
    if (p.firstTipId == null || t.id < p.firstTipId) p.firstTipId = t.id;
    info.set(t.playerKey, p);
  }
  const players = new Map(repo.listPlayers().map((p) => [p.key, p]));
  return { games, tipsByGame, players, info };
}

export type View = {
  now: number;
  undoMs: number;
  viewerKey: string | null;
  adminKeys: Set<string>;
  seen: Set<number>;
  world: World;
  activePlayers: ActivePlayer[];
};

export function makeView(world: World, o: { now: number; undoMs: number; viewerKey: string | null; adminKeys: Set<string>; seen: Set<number> }): View {
  const activePlayers: ActivePlayer[] = [...world.players.values()].map((p) => {
    const i = world.info.get(p.key);
    return { key: p.key, name: p.name, hidden: p.hidden, lastTipAt: i?.lastTipAt ?? null, tipCount: i?.tipCount ?? 0 };
  });
  return { ...o, world, activePlayers };
}

export const canManage = (game: Pick<Game, 'createdByKey'>, viewerKey: string | null, adminKeys: Set<string>): boolean =>
  viewerKey !== null && (viewerKey === game.createdByKey || adminKeys.has(viewerKey));

export const displayName = (world: World, key: string, fallback: string): string => world.players.get(key)?.name ?? fallback;

/** revealedFor (§2.5): aufgelöst, oder eigener Tipp nach Ablauf des Undo-Fensters. */
export function revealedFor(game: Pick<Game, 'resolvedAt'>, ownTip: Pick<Tip, 'createdAt'> | null | undefined, now: number, undoMs: number): boolean {
  return game.resolvedAt != null || (ownTip != null && (ownTip.createdAt == null || now >= Date.parse(ownTip.createdAt) + undoMs));
}

export function undoUntilOf(tip: Pick<Tip, 'createdAt'>, undoMs: number): number | null {
  return tip.createdAt ? Date.parse(tip.createdAt) + undoMs : null;
}

export function toGameDTO(game: Game, tips: Tip[], v: View): GameDTO {
  const { now, viewerKey } = v;
  const phase = phaseOf(game, now);
  const own = viewerKey ? tips.find((t) => t.playerKey === viewerKey) ?? null : null;
  const revealed = revealedFor(game, own, now, v.undoMs);
  const scored = scoreGame(game, tips);
  const outTips: TipDTO[] = scored.map((t) => {
    const isOwn = viewerKey !== null && t.playerKey === viewerKey;
    const player = v.world.players.get(t.playerKey);
    const info = v.world.info.get(t.playerKey);
    return {
      id: t.id,
      playerName: player?.name ?? t.playerName,
      playerKey: t.playerKey,
      isOwn,
      isNew: !!player && info?.firstTipId === t.id && now - Date.parse(player.createdAt) < NEW_PLAYER_MS,
      values: revealed || isOwn ? t.values : null,
      distance: t.distance,
      rank: t.rank,
      isWinner: t.isWinner,
      createdAt: t.createdAt,
    };
  });
  const undoUntil = own ? undoUntilOf(own, v.undoMs) : null;
  const resolved = !!game.resolvedAt;
  return {
    id: game.id,
    prompt: game.prompt,
    description: game.description,
    infoUrl: game.infoUrl,
    benchmark: game.benchmark,
    template: game.template,
    answerType: game.answerType,
    fields: game.fields,
    phase,
    closingSoon: closingSoon(game, now),
    createdBy: displayName(v.world, game.createdByKey, game.createdBy),
    createdByKey: game.createdByKey,
    createdAt: game.createdAt,
    closesAt: game.closesAt,
    closedAt: game.closedAt,
    closedBy: game.closedBy,
    resolvedAt: game.resolvedAt,
    resolvedBy: game.resolvedBy,
    archiveAt: archiveAt(game),
    editedAt: game.editedAt,
    promptEditedAt: game.promptEditedAt ?? null,
    correctedAt: game.correctedAt,
    result: resolved ? game.result : null,
    winnerMode: resolved && game.answerType === 'text' ? (game.winnerTipIds == null ? 'auto' : 'manual') : null,
    ruleSummary: ruleSummary({
      answerType: game.answerType,
      fields: game.fields,
      createdBy: displayName(v.world, game.createdByKey, game.createdBy),
      template: game.template,
      winnerTipIds: game.winnerTipIds,
    }),
    tipCount: tips.length,
    canManage: canManage(game, viewerKey, v.adminKeys),
    answersRevealed: revealed,
    viewer: {
      hasTipped: !!own,
      tipId: own?.id ?? null,
      undoUntil: undoUntil != null && now < undoUntil ? new Date(undoUntil).toISOString() : null,
      resultSeen: viewerKey ? v.seen.has(game.id) : true,
    },
    tips: outTips,
    notYetTipped: phase === 'open' ? notYetTipped({ ...game, tips }, v.activePlayers, { now, viewerKey }) : [],
  };
}

export function gameDTOFromWorld(game: Game, v: View): GameDTO {
  return toGameDTO(game, v.world.tipsByGame.get(game.id) ?? [], v);
}

/** Spielerliste: versteckte nur für Admins (mit hidden: true). Sortiert nach Anzahl Tipps, dann Name. */
export function playerDTOs(world: World, isAdmin: boolean): PlayerDTO[] {
  const out: PlayerDTO[] = [];
  for (const p of world.players.values()) {
    if (p.hidden && !isAdmin) continue;
    const i = world.info.get(p.key);
    out.push({ key: p.key, name: p.name, color: p.color, tipCount: i?.tipCount ?? 0, lastTipAt: i?.lastTipAt ?? null, ...(isAdmin ? { hidden: p.hidden } : {}) });
  }
  return out.sort((a, b) => b.tipCount - a.tipCount || a.name.localeCompare(b.name, 'de'));
}

export function playerDTO(p: Player, info: PlayerInfo | undefined, withHidden: boolean): PlayerDTO {
  return { key: p.key, name: p.name, color: p.color, tipCount: info?.tipCount ?? 0, lastTipAt: info?.lastTipAt ?? null, ...(withHidden ? { hidden: p.hidden } : {}) };
}

export function statsOf(world: World): StatsDTO {
  return statsFor(
    world.games.map((g) => ({ ...g, tips: world.tipsByGame.get(g.id) ?? [] })),
    world.players,
  );
}
