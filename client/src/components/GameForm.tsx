// Formular für Anlegen (Stufe 2) und Bearbeiten (§1.4.4, §1.4.5). Validierung über shared/parse.ts.
import { useState, type ReactNode } from 'react';
import type { AnswerType, Field, GameDTO, GameInput, TemplateKey } from '../../../shared/types.ts';
import { fieldRule } from '../../../shared/format.ts';
import { parseNumber, validateGameInput, type FieldError } from '../../../shared/parse.ts';
import { buildPrompt, getTemplate, SOUNDS_NUMERIC, type Template } from '../../../shared/templates.ts';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { cx } from '../util.ts';
import { DeadlineChips, deadlineIso, toLocalInput, type Deadline } from './DeadlineChips.tsx';
import { FieldEditor, fieldProblem, type FieldDraft } from './FieldEditor.tsx';
import { Icon } from './Icon.tsx';

export type FormState = {
  template: TemplateKey;
  helper: string;
  prompt: string;
  promptEdited: boolean;
  description: string;
  infoUrl: string;
  benchmark: string;
  answerType: AnswerType;
  fields: FieldDraft[];
  deadline: Deadline;
  date: string;
};

const num = (v: number) => String(v);
const toDraft = (f: Field): FieldDraft => ({ label: f.label, unit: f.unit, min: num(f.min), max: num(f.max), step: num(f.step) });
const toField = (f: FieldDraft): Field => ({
  label: f.label.trim(), unit: f.unit.trim(), min: parseNumber(f.min), max: parseNumber(f.max), step: parseNumber(f.step),
});

export function fromTemplate(t: Template, keep?: FormState | null): FormState {
  return {
    template: t.key,
    helper: keep?.helper ?? '',
    prompt: keep?.promptEdited ? keep.prompt : '',
    promptEdited: !!keep?.promptEdited,
    description: t.description,
    infoUrl: t.infoUrl ?? '',
    benchmark: t.benchmark,
    answerType: t.answerType,
    fields: t.fields.map(toDraft),
    deadline: keep?.deadline ?? 'd3',
    date: keep?.date ?? '',
  };
}

export function fromGame(g: GameDTO): FormState {
  return {
    template: (getTemplate(g.template)?.key ?? 'number') as TemplateKey,
    helper: '',
    prompt: g.prompt,
    promptEdited: true,
    description: g.description,
    infoUrl: g.infoUrl ?? '',
    benchmark: g.benchmark,
    answerType: g.answerType,
    fields: g.fields.length ? g.fields.map(toDraft) : [toDraft({ label: 'Value', unit: '', min: 0, max: 100, step: 1 })],
    deadline: g.closesAt ? 'date' : 'none',
    date: g.closesAt ? toLocalInput(new Date(g.closesAt)) : '',
  };
}

export function toInput(s: FormState): GameInput {
  return {
    template: s.template,
    prompt: s.prompt.trim(),
    description: s.description.trim(),
    infoUrl: s.infoUrl.trim() || null,
    benchmark: s.benchmark.trim(),
    answerType: s.answerType,
    fields: s.answerType === 'text' ? [] : s.fields.map(toField),
    closesAt: deadlineIso(s.deadline, s.date),
  };
}

/** Kurzform des ersten Problems für den Footer. */
function shortProblem(e: FieldError, s: FormState): string {
  if (e.field === 'prompt' && !s.prompt.trim()) return C.create.qMissing;
  const m = /^fields\.(\d+)$/.exec(e.field);
  if (m) return fieldProblem(s.fields[Number(m[1])]!) ?? e.message;
  return e.message;
}

export function GameForm({ state: s, onChange, onSubmit, tpl, mode, game, busy, submitLabel, busyLabel, footNote, onSwitchTemplate, extraTop }: {
  state: FormState; onChange: (s: FormState) => void; onSubmit: (input: GameInput) => void;
  tpl: Template | null; mode: 'create' | 'edit'; game?: GameDTO; busy: boolean;
  submitLabel: string; busyLabel: string; footNote?: ReactNode; onSwitchTemplate?: () => void; extraTop?: ReactNode;
}) {
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const games = st.useGames() ?? [];
  const offline = st.useOffline();
  const resolved = !!game?.resolvedAt;
  const others = game ? new Set(game.tips.filter((t) => t.playerKey !== game.createdByKey).map((t) => t.playerKey)).size : 0;
  const ownTip = !!game?.tips.some((t) => t.playerKey === game.createdByKey);
  const fieldsLocked = mode === 'edit' && (others > 0 || resolved);
  const onlyMeta = mode === 'edit' && resolved;

  const input = toInput(s);
  const deadlineSame = mode === 'edit' && game
    ? (game.closesAt == null && input.closesAt == null) ||
      (game.closesAt != null && input.closesAt != null && Math.abs(Date.parse(game.closesAt) - Date.parse(input.closesAt)) < 60_000)
    : false;
  const check = validateGameInput(input, { now: st.now(), skipClosesAtCheck: deadlineSame || onlyMeta });
  const errors = check.ok ? [] : check.errors;
  const errOf = (f: string) => (tried || touched[f] ? errors.find((e) => e.field === f)?.message : undefined);
  const set = (p: Partial<FormState>) => onChange({ ...s, ...p });
  const touch = (f: string) => !touched[f] && setTouched({ ...touched, [f]: true });

  const fieldsChanged = mode === 'edit' && game
    ? s.answerType !== game.answerType || JSON.stringify(input.fields) !== JSON.stringify(game.fields)
    : false;
  const shortened = mode === 'edit' && game?.closesAt && input.closesAt && Date.parse(input.closesAt) < Date.parse(game.closesAt) - 60_000;

  const submit = () => {
    setTried(true);
    if (offline) return st.toast(C.err.offlineShort);
    if (!check.ok) {
      const f = errors[0]!.field.split('.')[0];
      document.querySelector<HTMLElement>(`[data-f="${f}"] input, [data-f="${f}"] textarea, [data-f="${f}"]`)?.focus();
      return;
    }
    onSubmit(input);
  };

  const benchmarks = [...new Set(games.map((g) => g.benchmark).filter(Boolean))].sort();
  const preview = s.answerType === 'text'
    ? C.create.previewText
    : input.fields.length === 1
      ? fieldRule(input.fields[0]!)
      : `${C.create.values(input.fields.length)} · ${input.fields[0] ? fieldRule(input.fields[0]) : ''}`;

  return (
    <form className="gform" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      {extraTop}
      {mode === 'create' && tpl?.helper && (
        <label className="fld" data-f="helper">
          <span className="field-label">{tpl.helper.label}</span>
          <input className="input input-l" type="text" value={s.helper} placeholder={tpl.helper.placeholder} autoFocus maxLength={120}
            onChange={(e) => {
              const helper = e.target.value;
              set({ helper, ...(s.promptEdited ? {} : { prompt: buildPrompt(tpl, helper) }) });
            }} />
        </label>
      )}

      <label className="fld" data-f="prompt">
        <span className="field-label">{C.create.yourQ}</span>
        <textarea className="input input-q" rows={2} value={s.prompt} maxLength={200} disabled={onlyMeta}
          placeholder={C.create.qPlaceholder} aria-invalid={!!errOf('prompt')} autoFocus={mode === 'create' && !tpl?.helper}
          onChange={(e) => set({ prompt: e.target.value.replace(/\n/g, ' '), promptEdited: e.target.value.trim() !== '' })} onBlur={() => touch('prompt')} />
        {errOf('prompt') && <span className="err" role="alert">{errOf('prompt')}</span>}
        {s.answerType === 'text' && SOUNDS_NUMERIC.test(s.prompt) && mode === 'create' && (
          <span className="note">
            {C.create.numeric}{' '}
            {onSwitchTemplate && <button type="button" className="link-btn" onClick={onSwitchTemplate}>{C.create.switchTpl}</button>}
          </span>
        )}
      </label>

      {!onlyMeta && (
        <div data-f="closesAt">
          <DeadlineChips value={s.deadline} date={s.date} onChange={(deadline, date) => { set({ deadline, date }); touch('closesAt'); }}
            hint={errOf('closesAt') ?? (shortened ? C.create.shorten : null)} />
        </div>
      )}
      {onlyMeta && <p className="note">{C.create.resolvedOnly}</p>}

      <details className="disc" open={mode === 'edit' || !!errOf('infoUrl')}>
        <summary>{C.create.more}<Icon n="chevron" size={18} className="disc-chev" /></summary>
        <div className="disc-body">
          <label className="fld" data-f="description">
            <span className="field-label">{C.create.rules}</span>
            <textarea className="input" rows={4} maxLength={2000} value={s.description} onChange={(e) => set({ description: e.target.value })} />
            {errOf('description') && <span className="err" role="alert">{errOf('description')}</span>}
          </label>
          <label className="fld" data-f="infoUrl">
            <span className="field-label">{C.create.source}</span>
            <input className="input" type="url" inputMode="url" maxLength={2000} value={s.infoUrl} placeholder="https://"
              aria-invalid={!!errOf('infoUrl')} onChange={(e) => set({ infoUrl: e.target.value })} onBlur={() => touch('infoUrl')} />
            {errOf('infoUrl') && <span className="err" role="alert">{errOf('infoUrl')}</span>}
          </label>
          <label className="fld" data-f="benchmark">
            <span className="field-label">{C.create.topic}</span>
            <input className="input" type="text" list="benchmarks" maxLength={80} value={s.benchmark} onChange={(e) => set({ benchmark: e.target.value })} />
            <datalist id="benchmarks">{benchmarks.map((b) => <option key={b} value={b} />)}</datalist>
          </label>
        </div>
      </details>

      {!onlyMeta && (s.answerType === 'number' || mode === 'edit') && (
        <details className="disc" open={(mode === 'create' && !!tpl?.fineTuneOpen) || errors.some((e) => e.field.startsWith('fields') && tried)}>
          <summary>{C.create.fine}<Icon n="chevron" size={18} className="disc-chev" /></summary>
          <div className="disc-body" data-f="fields">
            {fieldsLocked && others > 0 && <p className="note"><Icon n="lock" size={16} /> {C.manage.locked(others)}</p>}
            {mode === 'edit' && !fieldsLocked && (
              <div className="seg-ctl" role="radiogroup" aria-label={C.create.answerType}>
                {(['number', 'text'] as const).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={s.answerType === t}
                    onClick={() => set({ answerType: t, ...(t === 'number' && !s.fields.length ? { fields: [toDraft({ label: 'Value', unit: '', min: 0, max: 100, step: 1 })] } : {}) })}>
                    {t === 'number' ? C.create.typeNumber : C.create.typeText}
                  </button>
                ))}
              </div>
            )}
            {s.answerType === 'number' && (
              <FieldEditor fields={s.fields} onChange={(fields) => set({ fields })} locked={fieldsLocked}
                multi={s.template === 'multi' || (mode === 'edit' && s.fields.length > 1)} showErrors={tried} />
            )}
            {errOf('fields') && <span className="err" role="alert">{errOf('fields')}</span>}
            {fieldsChanged && ownTip && !others && <p className="note">{C.create.ownReset}</p>}
          </div>
        </details>
      )}

      <p className="preview"><span className="muted">{C.create.preview}</span> <span className="num">{preview}</span></p>

      <div className="formfoot">
        <p className={cx('formfoot-note', tried && errors.length > 0 && 'err')} role={tried && errors.length ? 'alert' : undefined}>
          {tried && errors.length ? shortProblem(errors[0]!, s) : footNote}
        </p>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-disabled={offline || undefined}>
          {busy ? busyLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
