// Neue Wette: Vorlage → Formular auf einem Screen, Entwurf in localStorage (§1.4.4).
import { useEffect, useState } from 'react';
import type { GameInput } from '../../../shared/types.ts';
import { getTemplate, type Template } from '../../../shared/templates.ts';
import { api, fail } from '../api.ts';
import { C } from '../copy.ts';
import { navigate, setGuard } from '../router.ts';
import { lsJson, lsSetJson } from '../storage.ts';
import * as st from '../store.ts';
import { useFullscreen } from '../util.ts';
import { FsHeader } from '../components/FsHeader.tsx';
import { fromTemplate, GameForm, type FormState } from '../components/GameForm.tsx';
import { NamePicker } from '../components/NamePicker.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { TemplatePicker } from '../components/TemplatePicker.tsx';

const KEY = 'benchbet.draft';
type Draft = { form: FormState };

export function NewBet() {
  const name = st.useName();
  const nameSheetOpen = st.useStore((x) => x.namePicker);
  const [saved] = useState(() => lsJson<Draft | null>(KEY, null));
  const [form, setForm] = useState<FormState | null>(saved?.form ?? null);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(!!saved?.form);
  const [busy, setBusy] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const [audience, setAudience] = useState<number | null>(null);
  const tpl = form ? getTemplate(form.template) ?? null : null;
  useFullscreen(!!form);

  useEffect(() => {
    if (!name) st.set({ namePicker: true });
  }, []);
  useEffect(() => {
    if (!name) return;
    api.pushConfig().then((r) => setAudience(r.audience), () => setAudience(null));
  }, [name]);

  // Beim Verlassen mit Eingaben: „Entwurf behalten?“
  useEffect(() => {
    setGuard(form && dirty ? (to) => (setLeaveTo(to), false) : null);
    return () => setGuard(null);
  }, [form, dirty]);

  const change = (s: FormState) => {
    setForm(s);
    setDirty(true);
    lsSetJson(KEY, { form: s });
  };
  const pick = (t: Template) => {
    setForm(fromTemplate(t, form));
    setRestored(false);
  };
  const discard = () => {
    lsSetJson(KEY, null);
    setDirty(false);
    setRestored(false);
    setForm(null);
  };

  const submit = async (input: GameInput) => {
    if (!name) return st.set({ namePicker: true });
    setBusy(true);
    try {
      const r = await api.createGame(input);
      st.upsertGame(r.game);
      lsSetJson(KEY, null);
      setGuard(null);
      setDirty(false);
      st.set({ justCreated: r.game.id });
      navigate(`/bet/${r.game.id}`, { force: true });
      st.toast(C.create.done);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  if (!form) {
    return (
      <div className="new-bet">
        {/* Ohne Namen öffnet sich der NamePicker als Sheet (§1.4.4) – kein zweiter inline darunter */}
        <TemplatePicker onPick={pick} />
      </div>
    );
  }

  return (
    <div className="new-bet fs">
      <FsHeader title={C.create.title} onBack={() => (dirty || restored ? setLeaveTo('/new#template') : setForm(null))}
        sub={tpl ? <><span className="tpl-badge sm num" aria-hidden="true">{tpl.badge}</span> {tpl.title} · <button type="button" className="link-btn" onClick={() => setForm(null)}>{C.create.switchTpl}</button></> : null} />
      {restored && (
        <p className="note restored">
          {C.create.restored} <button type="button" className="link-btn" onClick={discard}>{C.create.discard}</button>
        </p>
      )}
      {!name && !nameSheetOpen && <div className="card pad needname"><p>{C.create.needName}</p><NamePicker /></div>}
      <GameForm mode="create" state={form} onChange={change} onSubmit={submit} tpl={tpl} busy={busy}
        submitLabel={C.create.publish} busyLabel={C.create.publishing} onSwitchTemplate={() => setForm(null)}
        footNote={audience != null ? C.create.audience(audience) : ' '} />

      <Sheet open={leaveTo != null} onClose={() => setLeaveTo(null)} title={C.create.keep}>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" data-autofocus onClick={() => {
            const to = leaveTo!;
            setLeaveTo(null);
            if (to === '/new#template') return setForm(null);
            setGuard(null);
            navigate(to, { force: true });
          }}>{C.create.keepYes}</button>
          <button type="button" className="btn btn-ghost danger-text" onClick={() => {
            const to = leaveTo!;
            setLeaveTo(null);
            discard();
            if (to !== '/new#template') navigate(to, { force: true });
          }}>{C.create.keepNo}</button>
        </div>
      </Sheet>
    </div>
  );
}
