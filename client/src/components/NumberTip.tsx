// Zahl, ein Feld: ValueDisplay (Tap = Direkteingabe), Slider (linear/log), Stepper mit Long-Press, Inline-Korrektur.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Field } from '../../../shared/types.ts';
import { fieldRule, formatNumber, formatPlain, formatTipLabel, stepDecimals } from '../../../shared/format.ts';
import { clamp, onStep, parseNumber, round10, snapToStep } from '../../../shared/parse.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';

type Props = {
  field: Field;
  value: number | null;
  onChange: (v: number | null) => void;
  /** Rasterprüfung (Tipp ja, Ergebnis nein) */
  checkStep?: boolean;
  /** kleine Punkte auf dem Slider (z. B. alle Tipps beim Auflösen) */
  marks?: number[];
  size?: 'l' | 'm';
  hint?: string;
  disabled?: boolean;
};

const isLog = (f: Field) => f.max - f.min > 1000 && f.min >= 0;

function toT(f: Field, v: number): number {
  const x = clamp(v, f.min, f.max);
  if (!isLog(f)) return (x - f.min) / (f.max - f.min);
  const a = Math.log10(f.min + 1);
  return (Math.log10(x + 1) - a) / (Math.log10(f.max + 1) - a);
}
function fromT(f: Field, t: number): number {
  if (!isLog(f)) return snapToStep(f.min + t * (f.max - f.min), f);
  const a = Math.log10(f.min + 1);
  return snapToStep(10 ** (a + t * (Math.log10(f.max + 1) - a)) - 1, f);
}
export const midOf = (f: Field): number => snapToStep((f.min + f.max) / 2, f);

/** Problem mit einem Wert → Text + Vorschlag (oder null). */
export function correction(f: Field, v: number | null, checkStep = true): { text: string; fix: number } | null {
  if (v == null) return null;
  if (v > f.max) return { text: C.tip.max(formatNumber(f.max)), fix: f.max };
  if (v < f.min) return { text: C.tip.min(formatNumber(f.min)), fix: f.min };
  if (checkStep && !onStep(v, f.min, f.step)) return { text: C.tip.step(formatNumber(f.step)), fix: snapToStep(v, f) };
  return null;
}

export function NumberTip({ field: f, value, onChange, checkStep = true, marks, size = 'l', hint, disabled }: Props) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');
  const [nan, setNan] = useState(false);
  const cur = useRef(value);
  cur.current = value;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const rep = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const id = useId();
  const dec = stepDecimals(f.step);
  const show = (v: number) => (checkStep && onStep(v, f.min, f.step) ? formatNumber(v, dec) : formatNumber(v));

  const set = (v: number | null) => {
    cur.current = v;
    onChange(v);
  };
  const stop = () => {
    clearTimeout(rep.current.t);
    clearInterval(rep.current.i);
  };
  useEffect(() => stop, []);

  const bump = (d: number) => {
    const v = cur.current;
    if (v == null) return set(midOf(f));
    const n = clamp(round10(v + d), f.min, f.max);
    set(checkStep ? snapToStep(n, f) : n);
  };
  const pressStart = (d: number) => {
    if (disabled) return;
    stop();
    bump(d);
    rep.current.t = setTimeout(() => {
      rep.current.i = setInterval(() => bump(d), 80);
    }, 400);
  };

  const fromX = (x: number) => {
    const r = track.current!.getBoundingClientRect();
    set(fromT(f, clamp((x - r.left) / r.width, 0, 1)));
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = true;
    fromX(e.clientX);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = f.step;
    const m: Record<string, number> = { ArrowRight: s, ArrowUp: s, ArrowLeft: -s, ArrowDown: -s, PageUp: 10 * s, PageDown: -10 * s };
    if (e.key in m) bump(m[e.key]!);
    else if (e.key === 'Home') set(f.min);
    else if (e.key === 'End') set(f.max);
    else return;
    e.preventDefault();
  };

  const startEdit = () => {
    if (disabled) return;
    setRaw(value == null ? '' : checkStep && onStep(value, f.min, f.step) ? formatPlain(value, dec) : formatPlain(value));
    setNan(false);
    setEditing(true);
  };
  const typed = (s: string) => {
    setRaw(s);
    if (!s.trim()) {
      setNan(false);
      return set(null);
    }
    const v = parseNumber(s.replace(/\s/g, ''));
    setNan(Number.isNaN(v));
    if (!Number.isNaN(v)) set(v);
  };

  const fix = correction(f, value, checkStep);
  const t = value == null ? null : toT(f, value);
  const steps = [-10 * f.step, -f.step, f.step, 10 * f.step].map(round10);
  const label = value == null ? '' : formatTipLabel([f], [value]);

  return (
    <div className={cx('ntip', `ntip-${size}`, disabled && 'is-disabled')}>
      <div className="vd">
        {editing ? (
          <input className="vd-input num" id={id} type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off"
            aria-label={`${f.label}${f.unit ? C.tip.inUnit(f.unit) : ''}`} value={raw} autoFocus
            onFocus={(e) => e.currentTarget.select()} onChange={(e) => typed(e.target.value)}
            onBlur={() => { setEditing(false); setNan(false); }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        ) : (
          <button type="button" className={cx('vd-btn num', value == null && 'is-empty')} onClick={startEdit} disabled={disabled}
            aria-label={`${C.tip.edit}: ${value == null ? C.tip.emptyValue : label}`}>
            {value == null ? '–' : show(value)}
          </button>
        )}
        <span className="vd-unit">{value == null && !editing ? C.tip.empty : f.unit || ' '}</span>
      </div>

      <div className="fix" aria-live="polite">
        {nan && editing ? <span>{C.tip.nan}</span> : fix && (
          <span>
            {fix.text}{' '}
            <button type="button" className="link-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { set(fix.fix); setEditing(false); }}>
              {C.tip.take(formatNumber(fix.fix))}
            </button>
          </span>
        )}
      </div>

      <div className={cx('slider', t == null && 'is-empty')} ref={track} role="slider" tabIndex={disabled ? -1 : 0}
        aria-label={f.label} aria-valuemin={f.min} aria-valuemax={f.max} aria-valuenow={value ?? undefined}
        aria-valuetext={value == null ? C.tip.empty : label} aria-disabled={disabled || undefined}
        style={{ '--t': t ?? 0.5 } as CSSProperties}
        onPointerDown={down} onPointerMove={(e) => drag.current && fromX(e.clientX)}
        onPointerUp={() => (drag.current = false)} onPointerCancel={() => (drag.current = false)} onKeyDown={key}>
        <span className="slider-rail"><span className="slider-fill" /></span>
        {marks?.map((m, i) => <i key={i} className="slider-mark" style={{ '--m': toT(f, m) } as CSSProperties} />)}
        <span className="slider-thumb" />
      </div>
      <div className="slider-ends num" aria-hidden="true"><span>{formatNumber(f.min)}</span><span>{formatNumber(f.max)}</span></div>

      <div className="stepper">
        {steps.map((d) => (
          <button key={d} type="button" className="step-btn num" disabled={disabled}
            aria-label={`${d < 0 ? C.tip.minus : C.tip.plus} ${formatNumber(Math.abs(d))}`}
            onPointerDown={(e) => { e.preventDefault(); pressStart(d); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
            onClick={(e) => e.detail === 0 && bump(d)} onContextMenu={(e) => e.preventDefault()}>
            {d < 0 ? '−' : '+'}{formatNumber(Math.abs(d))}
          </button>
        ))}
      </div>
      <p className="hint">{hint ?? fieldRule(f)}</p>
    </div>
  );
}
