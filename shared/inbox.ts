// Inbox „Offen“ (SPEC §1.4.1), App-Badge (§4.4), „Noch nicht dabei“ (§1.4.2.1).
import type { Phase, PhaseTimes } from './types.ts';
import { phaseOf } from './phase.ts';

export const STALE_OPEN_DAYS = 14;
export const ACTIVE_PLAYER_DAYS = 60;
const DAY_MS = 24 * 3600 * 1000;

/** Minimaler Wettstand; passt auf GameDTO und auf Server-Domänenobjekte mit Tipps. */
export type InboxGame = PhaseTimes & {
  id: number;
  createdAt: string;
  createdByKey: string;
  deletedAt?: string | null;
  tips: readonly { playerKey: string; removedAt?: string | null }[];
  /** GameDTO: Server-Phase (wird ignoriert – gerechnet wird mit `now`, gleiche Funktion). */
  phase?: Phase;
  canManage?: boolean;
  viewer?: { hasTipped: boolean; resultSeen: boolean };
};

export type InboxOpts<G> = {
  now: number;
  /** nameKey des Betrachters, null = ohne Namen */
  meKey: string | null;
  /** Verwalter? Default: g.canManage bzw. meKey === createdByKey */
  canManage?: (g: G) => boolean;
  /** Ergebnis schon gesehen? Default: g.viewer.resultSeen (fehlend = gesehen) */
  isSeen?: (g: G) => boolean;
};

export type TodoItem<G> = { game: G; kind: 'resolve' } | { game: G; kind: 'stale'; days: number };

export type InboxSectionKey = 'todo' | 'missing' | 'newResults' | 'tipped' | 'closedWithout' | 'open' | 'waiting';

export type InboxSections<G> = {
  /** Für dich zu tun (nur Verwalter) */
  todo: TodoItem<G>[];
  /** Dein Tipp fehlt */
  missing: G[];
  /** Neu aufgelöst (Phase resolved, ungesehen) */
  newResults: G[];
  /** Getippt · läuft (open/closed mit eigenem Tipp) */
  tipped: G[];
  /** Geschlossen · ohne dich */
  closedWithout: G[];
  /** Ohne Namen: Offene Wetten */
  open: G[];
  /** Ohne Namen: Wartet auf Ergebnis */
  waiting: G[];
};

const active = <G extends InboxGame>(games: readonly G[]) => games.filter((g) => !g.deletedAt);

/** Hat `meKey` in dieser Wette einen aktiven Tipp? */
export function hasTipped(g: InboxGame, meKey: string | null): boolean {
  if (!meKey) return false;
  return g.tips.some((t) => t.playerKey === meKey && !t.removedAt);
}

const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

/** closesAt aufsteigend, danach ohne closesAt nach createdAt absteigend. */
export function byDeadline(a: InboxGame, b: InboxGame): number {
  const ca = ms(a.closesAt);
  const cb = ms(b.closesAt);
  const ha = Number.isFinite(ca);
  const hb = Number.isFinite(cb);
  if (ha && hb) return ca - cb || b.id - a.id;
  if (ha) return -1;
  if (hb) return 1;
  return ms(b.createdAt) - ms(a.createdAt) || b.id - a.id;
}

const closedTime = (g: InboxGame) => ms(g.closedAt ?? g.closesAt);
const byClosedDesc = (a: InboxGame, b: InboxGame) => closedTime(b) - closedTime(a) || b.id - a.id;
const byResolvedDesc = (a: InboxGame, b: InboxGame) => ms(b.resolvedAt) - ms(a.resolvedAt) || b.id - a.id;

/** Anzahl „Dein Tipp fehlt“ = App-Badge = Zähler in Bottom-Bar und Statuszeile. Ohne Namen 0. */
export function missingCount(games: readonly InboxGame[], meKey: string | null, now: number): number {
  if (!meKey) return 0;
  return active(games).filter((g) => phaseOf(g, now) === 'open' && !hasTipped(g, meKey)).length;
}

/** Alle Inbox-Sektionen in fester Reihenfolge (leere Arrays = Sektion nicht zeigen). */
export function inboxSections<G extends InboxGame>(games: readonly G[], opts: InboxOpts<G>): InboxSections<G> {
  const { now, meKey } = opts;
  const canManage = opts.canManage ?? ((g: G) => g.canManage ?? (meKey !== null && meKey === g.createdByKey));
  const isSeen = opts.isSeen ?? ((g: G) => g.viewer?.resultSeen ?? true);
  const s: InboxSections<G> = { todo: [], missing: [], newResults: [], tipped: [], closedWithout: [], open: [], waiting: [] };
  const list = active(games);

  if (!meKey) {
    for (const g of list) {
      const p = phaseOf(g, now);
      if (p === 'open') s.open.push(g);
      else if (p === 'closed') s.waiting.push(g);
    }
    s.open.sort(byDeadline);
    s.waiting.sort(byClosedDesc);
    return s;
  }

  const todoResolve: G[] = [];
  const todoStale: { game: G; days: number }[] = [];
  for (const g of list) {
    const p = phaseOf(g, now);
    const mine = hasTipped(g, meKey);
    if (canManage(g)) {
      if (p === 'closed') todoResolve.push(g);
      else if (p === 'open' && !g.closesAt) {
        const age = now - Date.parse(g.createdAt);
        if (age > STALE_OPEN_DAYS * DAY_MS) todoStale.push({ game: g, days: Math.floor(age / DAY_MS) });
      }
    }
    if (p === 'open') (mine ? s.tipped : s.missing).push(g);
    else if (p === 'closed') (mine ? s.tipped : s.closedWithout).push(g);
    else if (p === 'resolved' && !isSeen(g)) s.newResults.push(g);
  }
  todoResolve.sort(byClosedDesc);
  todoStale.sort((a, b) => b.days - a.days || b.game.id - a.game.id);
  s.todo = [
    ...todoResolve.map((game) => ({ game, kind: 'resolve' as const })),
    ...todoStale.map(({ game, days }) => ({ game, kind: 'stale' as const, days })),
  ];
  s.missing.sort(byDeadline);
  s.newResults.sort(byResolvedDesc);
  // laufende zuerst (nach Tippschluss), danach geschlossene (zuletzt geschlossen zuerst)
  s.tipped.sort((a, b) => {
    const pa = phaseOf(a, now) === 'open' ? 0 : 1;
    const pb = phaseOf(b, now) === 'open' ? 0 : 1;
    return pa - pb || (pa === 0 ? byDeadline(a, b) : byClosedDesc(a, b));
  });
  s.closedWithout.sort(byClosedDesc);
  return s;
}

export type ActivePlayer = { key: string; name: string; hidden?: boolean; lastTipAt: string | null; tipCount?: number };

/**
 * „Noch nicht dabei“: aktive Spieler (nicht versteckt, Tipp in den letzten 60 Tagen), die hier noch nicht
 * getippt haben, ohne den Betrachter. Nur in Phase open, sonst []. Sortiert nach Anzahl Tipps, dann Name.
 * Hinweis für den Server: Legacy-Tipps haben kein created_at – lastTipAt dann aus dem createdAt der Wette ableiten.
 */
export function notYetTipped(
  game: InboxGame,
  players: readonly ActivePlayer[],
  opts: { now: number; viewerKey: string | null },
): string[] {
  if (phaseOf(game, opts.now) !== 'open') return [];
  const tipped = new Set(game.tips.filter((t) => !t.removedAt).map((t) => t.playerKey));
  const since = opts.now - ACTIVE_PLAYER_DAYS * DAY_MS;
  return players
    .filter((p) => !p.hidden && p.key !== opts.viewerKey && !tipped.has(p.key) && p.lastTipAt != null && Date.parse(p.lastTipAt) >= since)
    .sort((a, b) => (b.tipCount ?? 0) - (a.tipCount ?? 0) || a.name.localeCompare(b.name, 'de'))
    .map((p) => p.name);
}
