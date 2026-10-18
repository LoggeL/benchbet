// „Schöne“ Achsen für Zahlenstrahl und RankedChart (§1.4.2.4).
import type { Field } from '../../shared/types.ts';
import { round10 } from '../../shared/parse.ts';

export type Axis = { lo: number; hi: number; ticks: number[]; x: (v: number) => number };

/** Bereich [min − pad, max + pad] (pad = 10 % der Spanne, mind. 2·step), auf Tick-Vielfache gerundet, auf das Feld begrenzt. */
export function niceAxis(values: number[], f: Field): Axis {
  const vs = values.filter(Number.isFinite);
  let a = vs.length ? Math.min(...vs) : f.min;
  let b = vs.length ? Math.max(...vs) : f.max;
  const pad = Math.max((b - a) * 0.1, 2 * f.step);
  a -= pad;
  b += pad;
  const span = b - a || 1;
  const mag = 10 ** Math.floor(Math.log10(span / 4));
  let lo = a, hi = b, step = span;
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    step = m * mag;
    lo = Math.floor(a / step) * step;
    hi = Math.ceil(b / step) * step;
    if ((hi - lo) / step <= 4.0001) break;
  }
  lo = Math.max(round10(lo), f.min);
  hi = Math.min(round10(hi), f.max);
  if (hi <= lo) {
    lo = f.min;
    hi = f.max;
  }
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + 1e-9; t += step) ticks.push(round10(t));
  const x = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  return { lo, hi, ticks, x };
}

export function median(xs: number[]): number {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
