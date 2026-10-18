// Deadline als Chips (§1.4.4): Today 23:59 · Tomorrow 20:00 · In 3 days · In 1 week · Date … · None.
import { formatDate } from '../../../shared/format.ts';
import { MIN_CLOSE_LEAD_MS } from '../../../shared/phase.ts';
import { C } from '../copy.ts';
import { now } from '../store.ts';

export type Deadline = 'today' | 'tomorrow' | 'd3' | 'w1' | 'date' | 'none';

const pad = (n: number) => String(n).padStart(2, '0');
/** Date → Wert für <input type="datetime-local"> (Ortszeit). */
export const toLocalInput = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function at(days: number, h: number, m: number): Date {
  const d = new Date(now());
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d;
}

/** ISO-Zeit für eine Auswahl (null = ohne bzw. ungültiges Datum). */
export function deadlineIso(c: Deadline, date: string): string | null {
  switch (c) {
    case 'today': return at(0, 23, 59).toISOString();
    case 'tomorrow': return at(1, 20, 0).toISOString();
    case 'd3': return at(3, 20, 0).toISOString();
    case 'w1': return at(7, 20, 0).toISOString();
    case 'date': {
      const ms = date ? new Date(date).getTime() : NaN;
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    default: return null;
  }
}

export function DeadlineChips({ value, date, onChange, label = C.create.deadline, hint }: {
  value: Deadline; date: string; onChange: (c: Deadline, date: string) => void; label?: string; hint?: string | null;
}) {
  const todayOk = new Date(now()).getHours() < 22;
  const keys: Deadline[] = [...(todayOk || value === 'today' ? (['today'] as const) : []), 'tomorrow', 'd3', 'w1', 'date', 'none'];
  const iso = deadlineIso(value, date);
  const minLocal = toLocalInput(new Date(now() + MIN_CLOSE_LEAD_MS));
  return (
    <fieldset className="fset">
      <legend className="field-label">{label}</legend>
      <div className="chips" role="radiogroup" aria-label={label}>
        {keys.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className="chip"
            onClick={() => onChange(k, k === 'date' && !date ? toLocalInput(at(3, 20, 0)) : date)}>
            {C.create.chips[k]}
          </button>
        ))}
      </div>
      {value === 'date' && (
        <input className="input" type="datetime-local" value={date} min={minLocal} aria-label={C.create.chips.date}
          onChange={(e) => onChange('date', e.target.value)} />
      )}
      <p className="hint">{hint ?? (iso ? C.create.deadlineWith(formatDate(iso)) : C.create.deadlineNone)}</p>
    </fieldset>
  );
}
