import type { FormEntry } from '../../../shared/types.ts';
import { C } from '../copy.ts';

/** Formkurve: letzte n gewertete Wetten als Mini-Chips, älteste links. */
export function FormStrip({ form, n = 5 }: { form: FormEntry[]; n?: number }) {
  const items = form.slice(0, n).reverse();
  if (!items.length) return null;
  const say = (f: FormEntry) => (f.isWinner ? C.board.formWin : f.rank ? C.board.formPlace(f.rank) : C.board.formMiss);
  return (
    <span className="form" role="img" aria-label={C.board.formAria(items.map(say).join(', '))}>
      {items.map((f) => (
        <i key={f.gameId} className={f.isWinner ? 'fw' : f.rank ? 'fp' : 'fx'}>
          {f.isWinner ? '🏆' : f.rank ?? '✗'}
        </i>
      ))}
    </span>
  );
}
