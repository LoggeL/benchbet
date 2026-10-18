// Rangliste (SPEC §2.8) – alte Formel 1:1.
import type { FormEntry, PlayerStats, ScoredGame, StatsDTO } from './types.ts';
import { nameKey } from './names.ts';
import { formatPercent } from './format.ts';
import { scoreGame } from './scoring.ts';
import type { ScoreInputGame, ScoreInputTip } from './scoring.ts';

const byResolvedAtDesc = (a: FormEntry, b: FormEntry): number =>
  (Date.parse(b.resolvedAt) - Date.parse(a.resolvedAt)) || (b.gameId - a.gameId);

/** Reihenfolge: erst wer überhaupt gewertet wurde, dann Siege, dann Quote. 0 = Gleichstand. */
export const compareStats = (a: PlayerStats, b: PlayerStats): number =>
  (Number(b.settled > 0) - Number(a.settled > 0)) || (b.wins - a.wins) || ((b.winRate ?? 0) - (a.winRate ?? 0));

/**
 * games: alle NICHT gelöschten Wetten (jede Phase); tips: aktive, bereits gewertet (scoreGame).
 * players: kanonische Anzeigenamen je nameKey.
 */
export function computeStats(games: readonly ScoredGame[], players: ReadonlyMap<string, { name: string }> = new Map()): StatsDTO {
  const m = new Map<string, PlayerStats>();
  let tipCount = 0;
  let resolvedCount = 0;
  for (const g of games) {
    const settled = !!g.resolvedAt && g.result !== null;
    if (settled) resolvedCount++;
    for (const t of g.tips) {
      const key = t.playerKey ?? nameKey(t.playerName);
      let p = m.get(key);
      if (!p) {
        p = { key, name: players.get(key)?.name ?? t.playerName, tips: 0, settled: 0, wins: 0, exact: 0, winRate: null, rank: null, form: [] };
        m.set(key, p);
      }
      p.tips++;
      tipCount++;
      if (settled) {
        p.settled++;
        if (t.isWinner) p.wins++;
        if (t.distance === 0) p.exact++;
        p.form.push({ gameId: g.id, resolvedAt: g.resolvedAt!, rank: t.rank, isWinner: t.isWinner });
      }
    }
  }
  const list = [...m.values()];
  for (const p of list) {
    p.winRate = p.settled ? p.wins / p.settled : null;
    p.form = p.form.sort(byResolvedAtDesc).slice(0, 10);
  }
  list.sort((a, b) => compareStats(a, b) || a.name.localeCompare(b.name, 'de'));
  list.forEach((p, i) => {
    if (p.settled) p.rank = i > 0 && compareStats(list[i - 1]!, p) === 0 ? list[i - 1]!.rank : i + 1;
  });
  return { gameCount: games.length, resolvedCount, playerCount: list.length, tipCount, players: list };
}

export type StatsSourceGame = ScoreInputGame & {
  id: number;
  deletedAt?: string | null;
  tips: readonly (ScoreInputTip & { playerName: string; playerKey?: string; removedAt?: string | null })[];
};

/**
 * Bequemer Einstieg für Server/Tests: filtert gelöschte Wetten und entfernte Tipps,
 * wertet per scoreGame und rechnet die Rangliste.
 */
export function statsFor(games: readonly StatsSourceGame[], players: ReadonlyMap<string, { name: string }> = new Map()): StatsDTO {
  const scored: ScoredGame[] = games
    .filter((g) => !g.deletedAt)
    .map((g) => ({ id: g.id, resolvedAt: g.resolvedAt, result: g.result, tips: scoreGame(g, g.tips.filter((t) => !t.removedAt)) }));
  return computeStats(scored, players);
}

export type StatsRow = [rank: string, name: string, tips: number, settled: number, wins: number, exact: number, rate: string];

/** Tabelle wie im Import-Report (§6.4): ["1", "Logge", 14, 7, 3, 1, "42.9%"], ohne Rang "–". */
export const statsTable = (s: StatsDTO): StatsRow[] =>
  s.players.map((p) => [p.rank == null ? '–' : String(p.rank), p.name, p.tips, p.settled, p.wins, p.exact, formatPercent(p.winRate)]);

/** Kopfzeile der Rangliste: "14 bets · 7 resolved · 5 players · 46 guesses". */
export function statsHeadline(s: Pick<StatsDTO, 'gameCount' | 'resolvedCount' | 'playerCount' | 'tipCount'>): string {
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;
  return [
    n(s.gameCount, 'bet', 'bets'),
    `${s.resolvedCount} resolved`,
    n(s.playerCount, 'player', 'players'),
    n(s.tipCount, 'guess', 'guesses'),
  ].join(' · ');
}
