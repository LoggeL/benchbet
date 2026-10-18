// „Welche Antworten zählen?“ – Antwort-Cluster als Checkboxen, „ähnlich“-Badge, Radio „Niemand lag richtig“.
import type { PreviewTip } from '../../../shared/types.ts';
import { joinNames } from '../../../shared/format.ts';
import { answerClusters } from '../../../shared/scoring.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';

export function WinnerPicker({ tips, checked, similar, nobody, onChange }: {
  tips: PreviewTip[]; checked: Set<number>; similar: Set<number>; nobody: boolean;
  onChange: (checked: Set<number>, nobody: boolean) => void;
}) {
  const clusters = answerClusters(tips);
  const winners = tips.filter((t) => checked.has(t.id)).map((t) => t.playerName);
  return (
    <fieldset className="fset wp">
      <legend className="field-label">{C.resolve.which}</legend>
      <ul className="wp-list">
        {clusters.map((c) => {
          const ids = c.tips.map((t) => t.id);
          const on = ids.every((i) => checked.has(i));
          const sim = ids.some((i) => similar.has(i));
          return (
            <li key={c.key}>
              <label className={cx('wp-row', on && 'on')}>
                <input type="checkbox" checked={on} onChange={() => {
                  const n = new Set(checked);
                  ids.forEach((i) => (on ? n.delete(i) : n.add(i)));
                  onChange(n, false);
                }} />
                <span className="wp-a">{c.answer}{sim && !on && <em className="badge">{C.resolve.similar}</em>}</span>
                <span className="wp-who">{c.tips.map((t) => t.playerName).join(', ')}</span>
              </label>
            </li>
          );
        })}
        <li>
          <label className={cx('wp-row', nobody && 'on')}>
            <input type="radio" checked={nobody} onChange={() => onChange(new Set(), true)} />
            <span className="wp-a">{C.resolve.nobody}</span>
          </label>
        </li>
      </ul>
      <p className="wp-sum" aria-live="polite">
        {winners.length ? C.resolve.sumN(winners.length, joinNames(winners)) : C.resolve.sumNone}
      </p>
    </fieldset>
  );
}
