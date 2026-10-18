import type { CSSProperties } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { formatNumber } from '../../../shared/format.ts';
import { niceAxis, type Axis } from '../axis.ts';
import { C } from '../copy.ts';
import { cx, distText, valueText } from '../util.ts';
import { Icon } from './Icon.tsx';

function Track({ ax, r, t }: { ax: Axis; r: number; t: number }) {
  const xr = ax.x(r);
  const xt = ax.x(t);
  return (
    <span className="trk">
      <i className="trk-line" />
      <i className="trk-bar" style={{ left: `${Math.min(xr, xt)}%`, width: `${Math.abs(xt - xr)}%`, transformOrigin: xt >= xr ? 'left' : 'right' }} />
      <i className="trk-res" style={{ left: `${xr}%` }} />
      <i className="trk-dot" style={{ left: `${xt}%` }} />
    </span>
  );
}

/** Eine Darstellung fürs Ergebnis: Platz, Name, Lollipop-Spur mit Ergebnislinie, Wert, Abweichung. */
export function RankedChart({ game, stage }: { game: GameDTO; stage: number }) {
  const res = game.result as number[];
  const tips = game.tips.filter((t) => Array.isArray(t.values));
  if (!tips.length) return null;
  const axes = game.fields.map((f, i) => niceAxis([res[i]!, ...tips.map((t) => (t.values as number[])[i]!)], f));
  const multi = game.fields.length > 1;
  return (
    <div className={`rc rv-${stage}`}>
      <h3 className="label">{C.result.all}</h3>
      <ol className="rc-list">
        {tips.map((t, i) => (
          <li key={t.id} className={cx('rc-row', t.isWinner && 'win', t.isOwn && 'own')} style={{ '--i': i } as CSSProperties}>
            <span className="rc-rank num">
              {t.isWinner ? <><Icon n="trophy" size={18} className="rc-cup" /><span className="sr-only">{C.result.winnerSr}</span></> : `${t.rank}.`}
            </span>
            <span className="rc-name">
              {t.playerName}
              {t.isOwn && <em> ({C.you})</em>}
            </span>
            <span className="rc-tracks" aria-hidden="true">
              {axes.map((ax, k) => <Track key={k} ax={ax} r={res[k]!} t={(t.values as number[])[k]!} />)}
            </span>
            <span className="rc-val">
              <b className="num">{valueText(game, t.values)}</b>
              <small>{t.distance == null ? '' : multi && t.distance ? C.result.total(distText(game, t.distance)) : distText(game, t.distance)}</small>
            </span>
          </li>
        ))}
      </ol>
      {axes.map((ax, k) => (
        <div key={k} className="rc-axis" aria-hidden="true">
          <span className="rc-axis-l">{multi ? game.fields[k]!.label : ''}</span>
          <span className="rc-ticks num">
            {ax.ticks.map((tk) => <span key={tk} style={{ left: `${ax.x(tk)}%` }}>{formatNumber(tk)}</span>)}
            <b className="rc-reslabel" style={{ left: `${ax.x(res[k]!)}%` }}>{formatNumber(res[k]!)}</b>
          </span>
        </div>
      ))}
    </div>
  );
}
