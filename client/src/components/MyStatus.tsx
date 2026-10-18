import type { GameDTO } from '../../../shared/types.ts';
import { C } from '../copy.ts';
import { distText, isDone, ownTip, ph, valueText } from '../util.ts';

/** Eigener Stand (Signal 2 von 2), getrennt von der Phase. */
export function myStatusText(g: GameDTO): { text: string; tone: 'missing' | 'tipped' | 'won' | 'none' | 'lost' } {
  const p = ph(g);
  const t = ownTip(g);
  if (!t) return p === 'open' ? { text: C.my.missing, tone: 'missing' } : { text: C.my.none, tone: 'none' };
  if (!isDone(p)) return { text: C.my.tip(valueText(g, t.values)), tone: 'tipped' };
  if (t.isWinner) {
    const shared = g.tips.filter((x) => x.isWinner).length > 1;
    if (t.distance === 0 && !shared) return { text: C.my.exact, tone: 'won' };
    return { text: shared ? C.my.shared : C.my.won, tone: 'won' };
  }
  if (g.answerType === 'text' || t.rank == null || t.distance == null) return { text: C.my.none, tone: 'lost' };
  return { text: C.my.place(t.rank, distText(g, t.distance)), tone: 'lost' };
}

export function MyStatus({ game }: { game: GameDTO }) {
  const s = myStatusText(game);
  return <span className={`my my-${s.tone}`}>{s.text}</span>;
}
