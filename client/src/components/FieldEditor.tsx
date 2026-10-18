// Feinjustierung: pro Zahlenfeld Bezeichnung, Einheit, Min, Max, Schrittweite (Komma und Punkt erlaubt).
import { parseNumber } from '../../../shared/parse.ts';
import { C } from '../copy.ts';

export type FieldDraft = { label: string; unit: string; min: string; max: string; step: string };

/** Kurzer Problemtext für ein Feld, oder null. */
export function fieldProblem(f: FieldDraft): string | null {
  const [min, max, step] = [parseNumber(f.min), parseNumber(f.max), parseNumber(f.step)];
  if (!f.label.trim()) return C.create.labelMissing;
  if (Number.isNaN(min) || Number.isNaN(max) || Number.isNaN(step)) return C.create.badNumbers;
  if (!(min < max)) return C.create.maxGtMin;
  if (!(step > 0)) return C.create.stepPos;
  if (step > max - min) return C.create.stepRange;
  return null;
}

export function FieldEditor({ fields, onChange, multi, locked, showErrors }: {
  fields: FieldDraft[]; onChange: (f: FieldDraft[]) => void; multi: boolean; locked: boolean; showErrors: boolean;
}) {
  const upd = (i: number, k: keyof FieldDraft, v: string) => onChange(fields.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const inp = (i: number, k: keyof FieldDraft, label: string, o: { ph?: string; num?: boolean; max?: number } = {}) => (
    <label className={`fe-${k}`}>
      <span className="field-label">{label}</span>
      <input className="input" type="text" value={fields[i]![k]} disabled={locked} placeholder={o.ph} maxLength={o.max}
        inputMode={o.num ? 'decimal' : undefined} autoComplete="off" onChange={(e) => upd(i, k, e.target.value)} />
    </label>
  );
  return (
    <div className="fe">
      {fields.map((f, i) => {
        const err = showErrors ? fieldProblem(f) : null;
        return (
          <fieldset key={i} className="fe-row" disabled={locked}>
            {fields.length > 1 && <legend className="label">{C.create.valueN(i + 1)}</legend>}
            {inp(i, 'label', C.create.label, { max: 60 })}
            {inp(i, 'unit', C.create.unit, { ph: C.create.unitPh, max: 30 })}
            {inp(i, 'min', C.create.min, { num: true })}
            {inp(i, 'max', C.create.max, { num: true })}
            {inp(i, 'step', C.create.step, { num: true })}
            {err && <p className="err" role="alert">{err}</p>}
            {multi && fields.length >= 3 && !locked && (
              <button type="button" className="link-btn danger-text" onClick={() => onChange(fields.filter((_, j) => j !== i))}>
                {C.create.removeField(i + 1)}
              </button>
            )}
          </fieldset>
        );
      })}
      {multi && fields.length < 4 && !locked && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => {
          const last = fields[fields.length - 1]!;
          onChange([...fields, { ...last, label: `Model ${fields.length + 1}` }]);
        }}>{C.create.addField}</button>
      )}
    </div>
  );
}
