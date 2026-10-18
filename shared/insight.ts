// Insight-Zeile nach dem eigenen Tipp (SPEC §1.7.4).
import type { AnswerType, Field, TipValues } from './types.ts';
import { normText } from './scoring.ts';

export type InsightTip = { id: number; playerName: string; values: TipValues | null; isOwn?: boolean };

const EPS = 1e-9;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Liefert die erste zutreffende Insight-Regel oder null.
 * number: nur ein Feld und ≥ 3 sichtbare Tipps inkl. eigenem. text: ≥ 2 sichtbare Tipps inkl. eigenem.
 * `ownId` = id des eigenen Tipps (Default: Tipp mit isOwn).
 */
export function insightLine(
  game: { answerType: AnswerType; fields: readonly Field[] },
  tips: readonly InsightTip[],
  ownId?: number | null,
): string | null {
  const visible = tips.filter((t) => t.values != null);
  const own = visible.find((t) => (ownId != null ? t.id === ownId : t.isOwn));
  if (!own) return null;
  const others = visible.filter((t) => t !== own);

  if (game.answerType === 'text') {
    if (typeof own.values !== 'string' || visible.length < 2) return null;
    const k = normText(own.values);
    const same = others.filter((t) => typeof t.values === 'string' && normText(t.values) === k);
    if (same.length === 0) return 'Nobody else said that.';
    if (same.length === 1) return `${same[0]!.playerName} said the same thing.`;
    return `${same.length} others said the same thing.`;
  }

  if (game.fields.length !== 1 || visible.length < 3 || !Array.isArray(own.values)) return null;
  const val = (t: InsightTip) => (Array.isArray(t.values) ? t.values[0]! : NaN);
  const mine = val(own);
  const rest = others.map(val).filter(Number.isFinite);
  const all = [mine, ...rest];

  const same = others.filter((t) => Math.abs(val(t) - mine) < EPS);
  if (same.length === 1) return `Great minds: you and ${same[0]!.playerName} picked the same.`;
  if (same.length > 1) return `${same.length} others picked the same as you.`;

  if (rest.every((v) => v < mine)) return 'You’re the most bullish.';
  if (rest.every((v) => v > mine)) return 'You’re the most bearish.';

  const span = Math.max(...all) - Math.min(...all);
  if (Math.abs(mine - median(all)) <= 0.05 * span + EPS) return 'You’re right in the middle of the pack.';

  const higher = rest.filter((v) => v > mine).length;
  const lower = rest.filter((v) => v < mine).length;
  return `${higher} guessed higher, ${lower} lower.`;
}
