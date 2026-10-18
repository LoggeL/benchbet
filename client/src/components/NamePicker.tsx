// NamePicker: Chips bekannter Spieler, „+ New“ mit Ähnlichkeitsprüfung, keine extra Bestätigung.
import { useState, type FormEvent } from 'react';
import { NAME_MAX, findPlayer, similarPlayer, validateName } from '../../../shared/names.ts';
import { load } from '../api.ts';
import { C } from '../copy.ts';
import { getName, setName, toast, useName, usePlayers } from '../store.ts';
import { Avatar } from './Avatar.tsx';

export function NamePicker({ onDone, autoNew }: { onDone?: (n: string) => void; autoNew?: boolean }) {
  const players = usePlayers();
  const current = useName();
  const list = players.filter((p) => !p.hidden).sort((a, b) => b.tipCount - a.tipCount || a.name.localeCompare(b.name, 'de'));
  // Modus ableiten statt einfrieren: bei direktem Aufruf (/me, /new) kommen die Spieler erst nach dem ersten Render
  const [modeRaw, setMode] = useState<'chips' | 'new' | 'confirm' | null>(autoNew ? 'new' : null);
  const mode = modeRaw ?? (list.length ? 'chips' : 'new');
  const [all, setAll] = useState(false);
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [similar, setSimilar] = useState('');

  const pick = (n: string) => {
    const switched = getName() != null && getName() !== n;
    setName(n);
    void load();
    toast(switched ? C.name.toastSwitch(n) : C.name.toast(n));
    onDone?.(n);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = validateName(input);
    if (!v.ok) return setErr(v.message);
    const exact = findPlayer(v.name, players);
    if (exact) return pick(exact.name);
    const sim = similarPlayer(v.name, list);
    if (sim) {
      setSimilar(sim);
      setMode('confirm');
      return;
    }
    pick(v.name);
  };

  if (mode === 'confirm') {
    const typed = validateName(input);
    const mine = typed.ok ? typed.name : input;
    return (
      <div className="np" role="group" aria-label={C.name.youAre}>
        <p className="np-q" role="alert">
          {C.name.similarPre}<b>{similar}</b>{C.name.similarPost}
        </p>
        <div className="np-actions">
          <button type="button" className="btn btn-secondary" onClick={() => pick(similar)}>{C.name.iAm(similar)}</button>
          <button type="button" className="btn btn-ghost" onClick={() => pick(mine)}>{C.name.notMe(mine)}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="np" role="group" aria-label={C.name.youAre}>
      <span className="np-label">{C.name.youAre}</span>
      {mode === 'chips' ? (
        <div className="chips">
          {(all ? list : list.slice(0, 8)).map((p) => (
            <button key={p.key} type="button" className="chip chip-name" aria-pressed={current === p.name} onClick={() => pick(p.name)}>
              <Avatar name={p.name} size="xs" />
              {p.name}
            </button>
          ))}
          {!all && list.length > 8 && (
            <button type="button" className="chip chip-ghost" onClick={() => setAll(true)}>{C.name.more}</button>
          )}
          <button type="button" className="chip chip-add" onClick={() => setMode('new')}>{C.name.add}</button>
        </div>
      ) : (
        <form className="np-new" onSubmit={submit}>
          <input className="input" type="text" value={input} maxLength={NAME_MAX} autoComplete="nickname" placeholder={C.name.placeholder}
            aria-label={C.name.placeholder} autoFocus enterKeyHint="done" aria-invalid={!!err} aria-describedby={err ? 'np-err' : undefined}
            onChange={(e) => { setInput(e.target.value); setErr(''); }} />
          <button type="submit" className="btn btn-secondary">{C.name.ok}</button>
          {list.length > 0 && (
            <button type="button" className="link-btn np-back" onClick={() => setMode('chips')}>{C.back}</button>
          )}
          {err && <p className="err" id="np-err" role="alert">{err}</p>}
        </form>
      )}
    </div>
  );
}
