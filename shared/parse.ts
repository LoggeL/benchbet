// Parsing und Validierung von Eingaben (SPEC §2.6). Client und Server nutzen identischen Code.
import type { AnswerType, Field, GameInput, TemplateKey, TipValues } from './types.ts';
import { charLength } from './names.ts';
import { formatNumber } from './format.ts';
import { MIN_CLOSE_LEAD_MS } from './phase.ts';
import { TEMPLATE_KEYS } from './templates.ts';

export const TEXT_MAX = 160;
export const PROMPT_MAX = 160;
export const DESCRIPTION_MAX = 2000;
export const URL_MAX = 2000;
export const BENCHMARK_MAX = 80;
export const LABEL_MAX = 60;
export const UNIT_MAX = 30;
export const MAX_FIELDS = 4;
/** Toleranz für closesAt gegen Uhrenabweichung (§2.6.3). */
export const CLOSES_AT_TOLERANCE_MS = 60 * 1000;
/** Obergrenze für closesAt: 2 Jahre (sonst z. B. Jahr +010000, das als ISO-Text vor 2026 sortiert). */
export const MAX_CLOSE_AHEAD_MS = 2 * 366 * 24 * 3600 * 1000;

export const MSG = {
  tipIncomplete: 'Fill in every field of your bet.',
  range: (label: string, min: number, max: number) =>
    `${label}: pick a number between ${formatNumber(min)} and ${formatNumber(max)}.`,
  step: (label: string, step: number) => `${label}: use steps of ${formatNumber(step)}.`,
  textLength: 'Answers need 1 to 160 characters.',
  promptEmpty: 'No question, no bet.',
  promptLong: 'Keep the question to 160 characters.',
  descriptionLong: 'Keep the rules to 2,000 characters.',
  url: 'That doesn’t look like a link.',
  benchmarkLong: 'Keep the topic to 80 characters.',
  template: 'That template doesn’t exist.',
  answerType: 'Unknown answer type.',
  fieldCount: 'Add one to four number fields.',
  field: 'Every number field needs a label, a valid range and a positive step.',
  units: 'All values need the same unit so they can be scored together.',
  textFields: 'Free answers don’t have number fields.',
  closesAt: 'The deadline has to be at least 10 minutes from now.',
  closesAtFar: 'Pick a deadline within the next two years.',
} as const;

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

const NUM = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** "0,3" → 0.3 (Komma und Punkt als Dezimalzeichen) · ".5" → 0.5 · "1." → 1 · "1e3" → NaN · "1,2,3" → NaN. Zahlen werden durchgereicht. */
export function parseNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (!NUM.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/** Liegt v auf dem Raster min + k·step (Toleranz gegen Float-Rauschen)? */
export const onStep = (v: number, min: number, step: number): boolean =>
  Math.abs((v - min) / step - Math.round((v - min) / step)) <= 1e-6;

/** Nächster gültiger Rasterwert innerhalb [min, max]. */
export function snapToStep(v: number, f: Pick<Field, 'min' | 'max' | 'step'>): number {
  const k = Math.round((v - f.min) / f.step);
  return clamp(round10(f.min + k * f.step), f.min, f.max);
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Auf 10 Nachkommastellen gegen Float-Rauschen (§2.6.2). */
export const round10 = (x: number): number => Math.round(x * 1e10) / 1e10;

// ---------------------------------------------------------------------------
// Tipp und Ergebnis (§2.6.2) – die API nimmt nur echte JSON-Zahlen
// ---------------------------------------------------------------------------

export type ValueCheck = { ok: true; value: TipValues } | { ok: false; message: string; field: string };

type Answerable = { answerType: AnswerType; fields: readonly Field[] };

function checkValues(game: Answerable, values: unknown, withStep: boolean): ValueCheck {
  const field = withStep ? 'values' : 'result';
  if (game.answerType === 'text') {
    if (typeof values !== 'string') return { ok: false, message: MSG.textLength, field };
    const t = values.trim();
    const len = charLength(t);
    if (len < 1 || len > TEXT_MAX) return { ok: false, message: MSG.textLength, field };
    return { ok: true, value: t };
  }
  if (!Array.isArray(values) || values.length !== game.fields.length ||
      !values.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return { ok: false, message: MSG.tipIncomplete, field };
  }
  const nums = values as number[];
  for (let i = 0; i < nums.length; i++) {
    const f = game.fields[i]!;
    const v = nums[i]!;
    if (v < f.min || v > f.max) return { ok: false, message: MSG.range(f.label, f.min, f.max), field };
    if (withStep && !onStep(v, f.min, f.step)) return { ok: false, message: MSG.step(f.label, f.step), field };
  }
  return { ok: true, value: nums.map(round10) };
}

/** Tipp prüfen: Länge, Bereich, Raster (number) bzw. 1–160 Zeichen (text). */
export const validateTip = (game: Answerable, values: unknown): ValueCheck => checkValues(game, values, true);

/** Ergebnis prüfen: wie Tipp, aber ohne Rasterprüfung (Ergebnis darf feiner sein). */
export const validateResult = (game: Answerable, result: unknown): ValueCheck => checkValues(game, result, false);

// ---------------------------------------------------------------------------
// Wette anlegen/bearbeiten (§2.6.3)
// ---------------------------------------------------------------------------

export type FieldError = { field: string; message: string };
export type GameCheck<T = GameInput> =
  | { ok: true; value: T; errors: [] }
  | { ok: false; errors: FieldError[]; message: string; field: string };

export type GameCheckOpts = {
  /** Referenzzeit (ms) für closesAt. */
  now: number;
  /** Bestehende Wette (PATCH): liefert answerType/fields für Querprüfungen. */
  base?: { answerType: AnswerType; fields: readonly Field[]; template?: string };
  /** closesAt nicht gegen „jetzt + 10 min“ prüfen (z. B. unverändert übernommen). */
  skipClosesAtCheck?: boolean;
};

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ein Zahlenfeld prüfen und normalisieren (label/unit getrimmt). */
export function validateField(f: unknown): { ok: true; value: Field } | { ok: false; message: string } {
  if (!f || typeof f !== 'object') return { ok: false, message: MSG.field };
  const o = f as Record<string, unknown>;
  const label = typeof o.label === 'string' ? o.label.trim() : '';
  const unit = typeof o.unit === 'string' ? o.unit.trim() : o.unit == null ? '' : null;
  const { min, max, step } = o;
  if (!label || charLength(label) > LABEL_MAX || unit === null || charLength(unit) > UNIT_MAX ||
      !isFiniteNum(min) || !isFiniteNum(max) || !isFiniteNum(step) ||
      !(min < max) || !(step > 0) || !(step <= max - min)) {
    return { ok: false, message: MSG.field };
  }
  return { ok: true, value: { label, unit, min, max, step } };
}

/** Normalisiert eine URL-Eingabe: leer → null, sonst http/https ≤ 2000 Zeichen, ungültig → undefined. */
export function normalizeUrl(v: unknown): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (!s) return null;
  if (s.length > URL_MAX) return undefined;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (!u.hostname) return undefined;
    return s;
  } catch {
    return undefined;
  }
}

/** ISO-Zeit normalisieren (`…000Z`), ungültig → undefined, null bleibt null. */
export function normalizeIso(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** closesAt: null oder ≥ jetzt + 10 min (60 s Toleranz). */
export function validateClosesAt(v: unknown, now: number): { ok: true; value: string | null } | { ok: false; message: string } {
  const iso = normalizeIso(v === undefined ? null : v);
  if (iso === undefined) return { ok: false, message: MSG.closesAt };
  if (iso !== null && Date.parse(iso) < now + MIN_CLOSE_LEAD_MS - CLOSES_AT_TOLERANCE_MS) return { ok: false, message: MSG.closesAt };
  if (iso !== null && Date.parse(iso) > now + MAX_CLOSE_AHEAD_MS) return { ok: false, message: MSG.closesAtFar };
  return { ok: true, value: iso };
}

/**
 * Wette prüfen (POST /api/games, Formular). Liefert die normalisierte Eingabe oder alle Fehler
 * (erster Fehler zusätzlich als message/field).
 * Feldnamen der Fehler: prompt, description, infoUrl, benchmark, template, answerType, fields, fields.{i}, closesAt.
 */
export const validateGameInput = (input: unknown, opts: GameCheckOpts): GameCheck =>
  checkGame(input, opts, false) as GameCheck;

/**
 * PATCH prüfen: nur mitgeschickte Schlüssel. Querbezüge (answerType ↔ fields) nutzen `opts.base`.
 * Wechselt answerType ohne neue fields, werden die bestehenden fields gegen den neuen Typ geprüft.
 */
export const validateGamePatch = (patch: unknown, opts: GameCheckOpts): GameCheck<Partial<GameInput>> =>
  checkGame(patch, opts, true);

function checkGame(input: unknown, opts: GameCheckOpts, partial: boolean): GameCheck<Partial<GameInput>> {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: FieldError[] = [];
  const has = (k: string) => !partial || Object.prototype.hasOwnProperty.call(o, k);
  const out: Partial<GameInput> = {};

  if (has('prompt')) {
    const p = typeof o.prompt === 'string' ? o.prompt.trim() : '';
    if (!p) errors.push({ field: 'prompt', message: MSG.promptEmpty });
    else if (charLength(p) > PROMPT_MAX) errors.push({ field: 'prompt', message: MSG.promptLong });
    else out.prompt = p;
  }
  if (has('description')) {
    const d = o.description == null ? '' : typeof o.description === 'string' ? o.description.trim() : null;
    if (d === null || charLength(d) > DESCRIPTION_MAX) errors.push({ field: 'description', message: MSG.descriptionLong });
    else out.description = d;
  }
  if (has('infoUrl')) {
    const u = normalizeUrl(o.infoUrl);
    if (u === undefined) errors.push({ field: 'infoUrl', message: MSG.url });
    else out.infoUrl = u;
  }
  if (has('benchmark')) {
    const b = o.benchmark == null ? '' : typeof o.benchmark === 'string' ? o.benchmark.trim() : null;
    if (b === null || charLength(b) > BENCHMARK_MAX) errors.push({ field: 'benchmark', message: MSG.benchmarkLong });
    else out.benchmark = b;
  }
  if (has('template')) {
    const keepLegacy = partial && opts.base?.template === 'legacy' && o.template === 'legacy';
    if (typeof o.template !== 'string' || !(TEMPLATE_KEYS as readonly string[]).includes(o.template)) {
      if (!keepLegacy) errors.push({ field: 'template', message: MSG.template });
    } else out.template = o.template as TemplateKey;
  }
  let answerType: AnswerType | undefined = opts.base?.answerType;
  if (has('answerType')) {
    if (o.answerType !== 'number' && o.answerType !== 'text') errors.push({ field: 'answerType', message: MSG.answerType });
    else answerType = out.answerType = o.answerType;
  }
  if (has('fields') || (partial && has('answerType') && o.answerType !== opts.base?.answerType)) {
    const raw = has('fields') ? o.fields : opts.base?.fields;
    if (answerType === 'text') {
      if (!Array.isArray(raw) || raw.length !== 0) errors.push({ field: 'fields', message: MSG.textFields });
      else out.fields = [];
    } else if (answerType === 'number') {
      if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_FIELDS) {
        errors.push({ field: 'fields', message: MSG.fieldCount });
      } else {
        const fields: Field[] = [];
        raw.forEach((f, i) => {
          const r = validateField(f);
          if (r.ok) fields.push(r.value);
          else errors.push({ field: `fields.${i}`, message: r.message });
        });
        if (fields.length === raw.length) {
          if (fields.length > 1 && new Set(fields.map((f) => f.unit)).size > 1) errors.push({ field: 'fields', message: MSG.units });
          else out.fields = fields;
        }
      }
    }
  }
  if (has('closesAt')) {
    if (opts.skipClosesAtCheck) {
      const iso = normalizeIso(o.closesAt === undefined ? null : o.closesAt);
      if (iso === undefined) errors.push({ field: 'closesAt', message: MSG.closesAt });
      else if (iso !== null && Date.parse(iso) > opts.now + MAX_CLOSE_AHEAD_MS) errors.push({ field: 'closesAt', message: MSG.closesAtFar });
      else out.closesAt = iso;
    } else {
      const r = validateClosesAt(o.closesAt, opts.now);
      if (r.ok) out.closesAt = r.value;
      else errors.push({ field: 'closesAt', message: r.message });
    }
  }

  if (errors.length > 0) return { ok: false, errors, message: errors[0]!.message, field: errors[0]!.field };
  if (!partial) {
    out.description ??= '';
    out.infoUrl ??= null;
    out.benchmark ??= '';
  }
  return { ok: true, value: out, errors: [] };
}
