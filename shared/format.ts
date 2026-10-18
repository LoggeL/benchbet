// Formatierung für die Anzeige (SPEC §2.9, docs/BRANDING.md): englisch im en-GB-Stil (`Fri 24 Oct, 20:00`, `54.5`, `10,000`).
import type { Field, TipValues, GameTemplate, AnswerType } from './types.ts';

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number, grouping = true): Intl.NumberFormat {
  const k = `${min}:${max}:${grouping}`;
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat('en-GB', { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: grouping });
    nfCache.set(k, f);
  }
  return f;
}

/** Anzahl Nachkommastellen einer Schrittweite: 0.1 → 1, 0.01 → 2, 0.25 → 2, 1 → 0, 1e-7 → 7. */
export function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  const s = String(step);
  const exp = /e-(\d+)$/i.exec(s);
  if (exp) {
    const mant = s.split(/e/i)[0]!;
    const frac = mant.split('.')[1]?.length ?? 0;
    return Math.min(20, Number(exp[1]) + frac);
  }
  return Math.min(20, s.split('.')[1]?.length ?? 0);
}

/**
 * Zahl in en-GB. Ohne `decimals` mit bis zu 6 Nachkommastellen ("61.5", "10,000"),
 * mit `decimals` fest (z. B. Nachkommastellen von step: 61 → "61.0").
 */
export function formatNumber(v: number, decimals?: number): string {
  return fmt(v, decimals, true);
}

/** Wie formatNumber, aber ohne Tausendertrennzeichen – für editierbare Eingabefelder ("10000.50"). */
export function formatPlain(v: number, decimals?: number): string {
  return fmt(v, decimals, false);
}

function fmt(v: number, decimals: number | undefined, grouping: boolean): string {
  if (!Number.isFinite(v)) return '–';
  const out = decimals === undefined ? nf(0, 6, grouping).format(v) : nf(decimals, decimals, grouping).format(v);
  // −0 nicht als "-0" anzeigen
  return out === '-0' ? '0' : out.replace(/^-(0(\.0+)?)$/, '$1');
}

export const formatValue = (v: number, unit: string, decimals?: number): string =>
  formatNumber(v, decimals) + (unit ? ' ' + unit : '');

/** Antwort/Ergebnis lesbar: null → "–", Text wörtlich, ein Feld "61.5 points", mehrere "Input: 1.25 $ · Output: 10 $". */
export function formatAnswer(game: { fields: readonly Field[] }, values: TipValues | null | undefined): string {
  if (values == null) return '–';
  if (typeof values === 'string') return values;
  if (values.length === 1) return formatValue(values[0]!, game.fields[0]?.unit ?? '');
  return values
    .map((v, i) => {
      const f = game.fields[i];
      return f ? `${f.label}: ${formatValue(v, f.unit)}` : formatNumber(v);
    })
    .join(' · ');
}

/** Wert für Tipp-Button/ValueDisplay mit fester Nachkommazahl je Feld. "61.5 points", "1.25 / 10.00 $ / 1M tokens". */
export function formatTipLabel(fields: readonly Field[], values: readonly number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1 || fields.length <= 1) {
    const f = fields[0];
    return f ? formatValue(values[0]!, f.unit, stepDecimals(f.step)) : formatNumber(values[0]!);
  }
  const units = new Set(fields.map((f) => f.unit));
  const nums = values.map((v, i) => formatNumber(v, stepDecimals(fields[i]?.step ?? 1)));
  if (units.size === 1) {
    const u = fields[0]!.unit;
    return nums.join(' / ') + (u ? ' ' + u : '');
  }
  return values.map((v, i) => formatValue(v, fields[i]?.unit ?? '', stepDecimals(fields[i]?.step ?? 1))).join(' / ');
}

export const formatDistance = (d: number, unit: string): string =>
  d === 0 ? 'Bullseye' : `${formatNumber(d)}${unit ? ' ' + unit : ''} off`;

/** Quote 0..1 → "42.9%", "50%", null → "–". */
export const formatPercent = (rate: number | null): string =>
  rate == null || !Number.isFinite(rate) ? '–' : `${nf(0, 1).format(rate * 100)}%`;

/** "Nöl" · "Nöl and LZH" · "Nöl, LZH and Logge". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------------

export type DateOpts = {
  /** Referenzzeit für „aktuelles Jahr“ (ms). Default Date.now(). */
  now?: number;
  /** IANA-Zeitzone. Client: undefined (Browser), Server: DISPLAY_TZ. */
  timeZone?: string;
  /** 'auto' (Default): Jahr nur außerhalb des aktuellen Jahres · 'always' (Archiv) · 'never'. */
  year?: 'auto' | 'always' | 'never';
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(timeZone: string | undefined): Intl.DateTimeFormat {
  const k = timeZone ?? '';
  let f = dtfCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    dtfCache.set(k, f);
  }
  return f;
}

export type DateParts = { weekday: string; day: string; month: string; year: string; hour: string; minute: string };

export function dateParts(ms: number, timeZone?: string): DateParts {
  const p: Record<string, string> = {};
  for (const part of dtf(timeZone).formatToParts(new Date(ms))) p[part.type] = part.value;
  return {
    weekday: (p.weekday ?? '').replace(/\.$/, ''),
    day: p.day ?? '', month: p.month ?? '', year: p.year ?? '',
    hour: p.hour === '24' ? '00' : (p.hour ?? ''), minute: p.minute ?? '',
  };
}

const toMs = (d: string | number | Date): number => (typeof d === 'number' ? d : typeof d === 'string' ? Date.parse(d) : d.getTime());

function withYear(ms: number, o: DateOpts): boolean {
  if (o.year === 'always') return true;
  if (o.year === 'never') return false;
  return dateParts(ms, o.timeZone).year !== dateParts(o.now ?? Date.now(), o.timeZone).year;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "8 Oct" (Tag ohne führende Null, Monat kurz). */
const dayMonth = (p: DateParts): string => `${Number(p.day)} ${MONTHS[Number(p.month) - 1]!.slice(0, 3)}`;

/** "Fri 24 Oct, 18:00" bzw. außerhalb des aktuellen Jahres (oder year:'always') "7 Oct 2025, 21:39". */
export function formatDate(d: string | number | Date, o: DateOpts = {}): string {
  const ms = toMs(d);
  if (!Number.isFinite(ms)) return '–';
  const p = dateParts(ms, o.timeZone);
  if (withYear(ms, o)) return `${dayMonth(p)} ${p.year}, ${p.hour}:${p.minute}`;
  return `${p.weekday} ${dayMonth(p)}, ${p.hour}:${p.minute}`;
}

/** Nur Datum: "8 Oct" bzw. mit Jahr "17 Oct 2026". */
export function formatDay(d: string | number | Date, o: DateOpts = {}): string {
  const ms = toMs(d);
  if (!Number.isFinite(ms)) return '–';
  const p = dateParts(ms, o.timeZone);
  return withYear(ms, o) ? `${dayMonth(p)} ${p.year}` : dayMonth(p);
}

/** Nur Uhrzeit: "18:00". */
export function formatTime(d: string | number | Date, o: Pick<DateOpts, 'timeZone'> = {}): string {
  const ms = toMs(d);
  if (!Number.isFinite(ms)) return '–';
  const p = dateParts(ms, o.timeZone);
  return `${p.hour}:${p.minute}`;
}

/** Monatsgruppe im Archiv: "October 2026". */
export function formatMonth(d: string | number | Date, o: Pick<DateOpts, 'timeZone'> = {}): string {
  const p = dateParts(toMs(d), o.timeZone);
  return `${MONTHS[Number(p.month) - 1]} ${p.year}`;
}

/** Kalendertag-Nummer (Tage seit Epoche) in der Zielzone. */
function dayNumber(ms: number, timeZone?: string): number {
  const p = dateParts(ms, timeZone);
  return Math.floor(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 86400000);
}

/** Relativ: "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago" (≤ 14), danach absolut. */
export function relTime(d: string | number | Date, o: DateOpts = {}): string {
  const ms = toMs(d);
  const now = o.now ?? Date.now();
  if (!Number.isFinite(ms)) return '–';
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (diff < 24 * 3600 * 1000) return `${Math.floor(min / 60)} h ago`;
  const days = dayNumber(now, o.timeZone) - dayNumber(ms, o.timeZone);
  if (days <= 1) return 'yesterday';
  if (days <= 14) return `${days} days ago`;
  return formatDate(ms, o);
}

/** Dauer kurz: unter 1 h "{n} min", sonst "{n} h" (gerundet). */
export function formatDuration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${Math.max(1, min)} min`;
  return `${Math.round(min / 60)} h`;
}

/**
 * Countdown bis zum Tippschluss (§1.7.1):
 * > 48 h „{n} days left“ · 24–48 h „1 day {h} h left“ · < 24 h „{h} h {m} min left“ ·
 * < 1 h „{m} min left“ · < 5 min „{m}:{ss} left“ · danach „Bets closed“.
 */
export function countdown(closesAt: string | number, now: number): string {
  const left = toMs(closesAt) - now;
  if (!(left > 0)) return 'Bets closed';
  const totalSec = Math.floor(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)} days left`;
  if (h >= 24) return `1 day ${h - 24} h left`;
  if (h >= 1) return `${h} h ${m} min left`;
  if (totalSec >= 300) return `${m} min left`;
  return `${m}:${String(totalSec % 60).padStart(2, '0')} left`;
}

// ---------------------------------------------------------------------------
// Regel-Kurzfassung
// ---------------------------------------------------------------------------

/** "0–100 points · steps of 0.1" (Hint unter dem Slider). */
export function fieldRule(f: Field): string {
  return `${formatNumber(f.min)}–${formatNumber(f.max)}${f.unit ? ' ' + f.unit : ''} · steps of ${formatNumber(f.step)}`;
}

export type RuleGame = {
  answerType: AnswerType;
  fields: readonly Field[];
  createdBy: string;
  template?: GameTemplate | string;
  winnerTipIds?: readonly number[] | null;
  winnerMode?: 'auto' | 'manual' | null;
};

/** Legacy-Textwette ohne manuelle Wahl → alte automatische Regel (gleiche Schreibweise). */
export const isLegacyAutoText = (g: RuleGame): boolean =>
  g.answerType === 'text' && g.template === 'legacy' && g.winnerMode !== 'manual' && !g.winnerTipIds;

export function ruleSummary(g: RuleGame): string {
  if (g.answerType === 'text') {
    return isLegacyAutoText(g)
      ? 'Right answer wins · same spelling counts'
      : `Right answer wins · ${g.createdBy} decides what counts`;
  }
  if (g.fields.length <= 1) {
    const f = g.fields[0];
    return f ? `Closest wins · ${fieldRule(f)}` : 'Closest wins';
  }
  const min = Math.min(...g.fields.map((f) => f.min));
  const max = Math.max(...g.fields.map((f) => f.max));
  const unit = g.fields[0]!.unit;
  return `Smallest total miss wins · ${g.fields.length} values · ${formatNumber(min)}–${formatNumber(max)}${unit ? ' ' + unit : ''}`;
}

/** Langer Regelsatz unter „Regeln & Quelle“ (§1.4.2). */
export function ruleSentence(g: RuleGame): string {
  if (g.answerType === 'text') {
    return isLegacyAutoText(g)
      ? 'The matching answer wins – case and extra spaces don’t matter.'
      : `The right answer wins. When resolving, ${g.createdBy} decides which spellings count.`;
  }
  return g.fields.length > 1
    ? 'The smallest sum of absolute misses wins. Same miss, same win – ties are shared.'
    : 'The smallest absolute miss wins. Same miss, same win – ties are shared.';
}

/** Topic chip: benchmark, otherwise “Free answer” / “Multiple values” / “Number”. */
export function topicLabel(g: { benchmark: string; answerType: AnswerType; fields: readonly Field[] }): string {
  if (g.benchmark.trim()) return g.benchmark.trim();
  if (g.answerType === 'text') return 'Free answer';
  return g.fields.length > 1 ? 'Multiple values' : 'Number';
}
