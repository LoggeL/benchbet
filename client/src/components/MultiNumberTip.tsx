import { useState } from 'react';
import type { Field } from '../../../shared/types.ts';
import { formatNumber, stepDecimals } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';
import { correction, NumberTip } from './NumberTip.tsx';

/** Mehrere Felder: kompakte Zeilen, die aktive zeigt Slider und Stepper. */
export function MultiNumberTip({ fields, values, onChange, checkStep = true, marks, disabled, hint }: {
  fields: Field[]; values: (number | null)[]; onChange: (v: (number | null)[]) => void;
  checkStep?: boolean; marks?: number[][]; disabled?: boolean; hint?: string;
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="mtip">
      {fields.map((f, i) => {
        const v = values[i] ?? null;
        const bad = correction(f, v, checkStep);
        return (
          <div key={i} className={cx('mrow', i === active && 'on', bad && 'bad')}>
            <button type="button" className="mrow-head" aria-expanded={i === active} onClick={() => setActive(i)}>
              <span className="mrow-label">{f.label}</span>
              <span className="mrow-val num">{v == null ? '–' : formatNumber(v, checkStep ? stepDecimals(f.step) : undefined)}</span>
              <span className="mrow-unit">{f.unit}</span>
            </button>
            {i === active && (
              <NumberTip field={f} value={v} size="m" checkStep={checkStep} marks={marks?.[i]} disabled={disabled}
                onChange={(nv) => onChange(values.map((x, j) => (j === i ? nv : x)))} />
            )}
          </div>
        );
      })}
      <p className="hint">{hint ?? C.tip.multiHint}</p>
    </div>
  );
}
