// Wertung (SPEC §2.7) – identisch zur alten App, plus manuelle Text-Gewinner.
import type { AnswerType, Score, TipValues } from './types.ts';
import { foldKey } from './names.ts';

export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** Normalisierte Text-Gleichheit (Groß-/Kleinschreibung, Whitespace). */
export const normText = (s: string): string => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');

export type ScoreInputGame = {
  answerType: AnswerType;
  resolvedAt: string | null;
  result: TipValues | null;
  winnerTipIds?: readonly number[] | null;
};
export type ScoreInputTip = { id: number; values: TipValues };

/** Sortierung: rank aufsteigend (null zuletzt), dann id aufsteigend. */
export function sortTips<T extends { id: number; rank: number | null }>(tips: T[]): T[] {
  return tips.sort((a, b) => {
    if (a.rank !== b.rank) {
      if (a.rank == null) return 1;
      if (b.rank == null) return -1;
      return a.rank - b.rank;
    }
    return a.id - b.id;
  });
}

/**
 * Wertet die aktiven (nicht entfernten) Tipps einer Wette.
 * Zahl: Summe der absoluten Abweichungen (round6), Competition-Ranking, alle mit Minimum gewinnen.
 * Text: winnerTipIds gesetzt → genau diese; null/undefined → normalisierte Gleichheit; [] → niemand.
 */
export function scoreGame<T extends ScoreInputTip>(game: ScoreInputGame, tips: readonly T[]): (T & Score)[] {
  const blank = (t: T): T & Score => ({ ...t, distance: null, rank: null, isWinner: false });
  if (!game.resolvedAt || game.result == null || tips.length === 0) return sortTips(tips.map(blank));
  if (game.answerType === 'number') {
    const r = game.result as number[];
    const d = tips.map((t) => round6((t.values as number[]).reduce((s, v, i) => s + Math.abs(v - r[i]!), 0)));
    const min = Math.min(...d);
    return sortTips(tips.map((t, i) => ({
      ...t,
      distance: d[i]!,
      rank: 1 + d.filter((x) => x < d[i]!).length,   // Competition-Ranking 1-2-2-4
      isWinner: d[i] === min,
    })));
  }
  const result = game.result as string;
  const winners = new Set<number>(
    game.winnerTipIds ?? tips.filter((t) => typeof t.values === 'string' && normText(t.values) === normText(result)).map((t) => t.id),
  );
  return sortTips(tips.map((t) => ({
    ...t,
    distance: null,
    rank: winners.has(t.id) ? 1 : null,
    isWinner: winners.has(t.id),
  })));
}

/**
 * Vorschläge für „Welche Antworten zählen?“ (§1.4.3):
 * checked = normalisierte Gleichheit mit der richtigen Antwort,
 * similar = (nicht checked) gleicher Faltschlüssel, oder Antwort ist Präfix/Teilstring des Tipps bzw. umgekehrt
 * (jeweils auf dem Faltschlüssel).
 */
export function textSuggestions(result: string | null | undefined, tips: readonly { id: number; values: TipValues }[]): { checked: number[]; similar: number[] } {
  const checked: number[] = [];
  const similar: number[] = [];
  const r = (result ?? '').trim();
  if (!r) return { checked, similar };
  const rn = normText(r);
  const rf = foldKey(r);
  for (const t of tips) {
    if (typeof t.values !== 'string') continue;
    if (normText(t.values) === rn) { checked.push(t.id); continue; }
    const tf = foldKey(t.values);
    if (!rf || !tf) continue;
    if (tf === rf || tf.includes(rf) || rf.includes(tf)) similar.push(t.id);
  }
  return { checked, similar };
}

/** Antwort-Cluster für Text-Wetten: gleiche normalisierte Antwort → eine Gruppe (Reihenfolge des ersten Auftretens). */
export function answerClusters<T extends { values: TipValues | null }>(tips: readonly T[]): { answer: string; key: string; tips: T[] }[] {
  const map = new Map<string, { answer: string; key: string; tips: T[] }>();
  for (const t of tips) {
    if (typeof t.values !== 'string') continue;
    const key = normText(t.values);
    const c = map.get(key);
    if (c) c.tips.push(t);
    else map.set(key, { answer: t.values, key, tips: [t] });
  }
  return [...map.values()];
}

/** Namen der Gewinner einer gewerteten Liste. */
export const winnerNames = (scored: readonly { isWinner: boolean; playerName: string }[]): string[] =>
  scored.filter((t) => t.isWinner).map((t) => t.playerName);
