import type { CSSProperties } from 'react';
import type { Field, GameDTO } from '../../../shared/types.ts';
import { formatNumber } from '../../../shared/format.ts';
import { initials } from '../../../shared/names.ts';
import { median, niceAxis } from '../axis.ts';
import { usePlayers } from '../store.ts';
import { C } from '../copy.ts';
import { colorOf, cx } from '../util.ts';

type Item = { v: number; name: string; own: boolean };

function Strip({ f, items, label }: { f: Field; items: Item[]; label?: string }) {
  const players = usePlayers();
  const ax = niceAxis(items.map((i) => i.v), f);
  const med = median(items.map((i) => i.v));
  const last: number[] = [];
  const placed = [...items].sort((a, b) => a.v - b.v).map((it) => {
    const x = ax.x(it.v);
    let lvl = last.findIndex((l) => x - l >= 8);
    if (lvl < 0) lvl = last.length < 3 ? last.length : 2;
    last[lvl] = x;
    return { ...it, x, lvl };
  });
  const levels = Math.max(1, last.length);
  return (
    <div className="strip-wrap">
      {label && <span className="strip-label">{label}</span>}
      <div className="strip" style={{ '--lv': levels } as CSSProperties}>
        <i className="strip-line" />
        <i className="strip-med" style={{ left: `${ax.x(med)}%` }} title="Median" />
        {placed.map((d, i) => (
          <span key={i} className={cx('sdot', d.own && 'own')}
            style={{ left: `${d.x}%`, '--lvl': d.lvl, '--pc': `var(--p${colorOf(players, d.name)})`, '--i': i } as CSSProperties}>
            {initials(d.name)}
            {d.own && <em className="sdot-you">{C.you}</em>}
          </span>
        ))}
      </div>
      <div className="ticks num">
        {ax.ticks.map((t) => <span key={t} style={{ left: `${ax.x(t)}%` }}>{formatNumber(t)}</span>)}
      </div>
    </div>
  );
}

/** Zahlenstrahl vor dem Ergebnis: Punkte je Tipp (Spielerfarbe + Initialen), Median als Strich, eigener Punkt mit Ring. */
export function Distribution({ game, delay }: { game: GameDTO; delay?: number }) {
  const tips = game.tips.filter((t) => Array.isArray(t.values));
  if (!tips.length || game.answerType !== 'number') return null;
  return (
    <div className={cx('dist', delay != null && 'grow')} style={{ '--d': `${delay ?? 0}ms` } as CSSProperties} aria-hidden="true">
      {game.fields.map((f, i) => (
        <Strip key={i} f={f} label={game.fields.length > 1 ? f.label : undefined}
          items={tips.map((t) => ({ v: (t.values as number[])[i]!, name: t.playerName, own: t.isOwn }))} />
      ))}
    </div>
  );
}
