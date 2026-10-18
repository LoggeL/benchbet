import { useEffect, useState } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { formatDate, formatNumber, stepDecimals } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { distText, ownTip, resultText, valueText } from '../util.ts';

/** Persönliche Zeile unter dem Ergebnis. */
export function personalLine(g: GameDTO): string {
  const t = ownTip(g);
  if (!t) return C.result.notTipped;
  if (g.answerType === 'text') return t.isWinner ? C.result.textWon : C.result.textLost(typeof t.values === 'string' ? t.values : '–');
  const d = t.distance ?? 0;
  const winners = g.tips.filter((x) => x.isWinner).length;
  if (t.isWinner) {
    if (winners > 1) return C.result.shared(distText(g, d));
    return d === 0 ? C.result.bullseye : C.result.won(distText(g, d));
  }
  return C.result.you(valueText(g, t.values), distText(g, d), t.rank ?? 0, g.tips.length);
}

/** Zählt beim Reveal von unten auf das Ergebnis hoch (ease-out, 500 ms). */
function useCountUp(target: number | null, run: boolean, from: number): number | null {
  const [v, setV] = useState<number | null>(run ? from : target);
  useEffect(() => {
    if (!run || target == null) return setV(target);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 500);
      setV(from + (target - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, target, from]);
  return v;
}

export function ResultBox({ game, counting }: { game: GameDTO; counting: boolean }) {
  const single = game.answerType === 'number' && game.fields.length === 1 && Array.isArray(game.result);
  const f = game.fields[0];
  const target = single ? (game.result as number[])[0]! : null;
  const v = useCountUp(target, counting && single, f?.min ?? 0);
  const won = ownTip(game)?.isWinner;
  return (
    <div className={won ? 'rbox won' : 'rbox'}>
      <div className="rbox-top">
        <span className="label">{C.result.label}</span>
        {game.resolvedAt && <span className="muted small">{C.result.resolvedAt(formatDate(game.resolvedAt, { year: 'always' }))}</span>}
      </div>
      <p className="rbox-val num">
        {single && v != null ? (
          <>
            {formatNumber(counting ? Number(v.toFixed(stepDecimals(f!.step) + 1)) : v)}
            {f!.unit && <span className="rbox-unit"> {f!.unit}</span>}
          </>
        ) : (
          resultText(game)
        )}
      </p>
      <p className="rbox-me">{personalLine(game)}</p>
    </div>
  );
}
