// Tipp-Panel (Zustand A / A′): Eingabe, NamePicker inline, Tipp-Button mit Wert, Undo-Fenster.
import { useState } from 'react';
import type { GameDTO, TipValues } from '../../../shared/types.ts';
import { formatTipLabel } from '../../../shared/format.ts';
import { validateTip } from '../../../shared/parse.ts';
import { api, ApiError, fail, loadGame } from '../api.ts';
import { C } from '../copy.ts';
import { ssGet, ssSet } from '../storage.ts';
import * as st from '../store.ts';
import { clip } from '../util.ts';
import { MultiNumberTip } from './MultiNumberTip.tsx';
import { NamePicker } from './NamePicker.tsx';
import { NumberTip } from './NumberTip.tsx';
import { SubmitTipButton, UNDO_ARM_MS } from './SubmitTipButton.tsx';
import { TextTip } from './TextTip.tsx';

type Draft = (number | null)[] | string;
const drafts = new Map<number, Draft>();
const dkey = (id: number) => `benchbet.tipdraft.${id}`;
/** Zeitpunkt des letzten „Lock in“-Klicks je Wette. Modulweit, weil das Panel nach dem Tipp neu gemountet wird. */
const lastSubmitAt = new Map<number, number>();


function initial(g: GameDTO): Draft {
  const have = drafts.get(g.id);
  if (have !== undefined) return have;
  try {
    const raw = ssGet(dkey(g.id));
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    if (g.answerType === 'text' && typeof d === 'string') return d;
    if (g.answerType === 'number' && Array.isArray(d) && d.length === g.fields.length) return d;
  } catch {
    /* kaputt → neu */
  }
  return g.answerType === 'text' ? '' : g.fields.map(() => null);
}

/** Entwurf einer Wette verwerfen (nach dem Aufdecken). */
export function clearDraft(id: number): void {
  drafts.delete(id);
  ssSet(dkey(id), null);
}

export function draftValues(g: GameDTO, d: Draft): TipValues | null {
  if (g.answerType === 'text') return typeof d === 'string' && d.trim() ? d.trim() : null;
  return Array.isArray(d) && d.every((x) => x != null) ? (d as number[]) : null;
}

export function TipPanel({ game, undoUntil }: { game: GameDTO; undoUntil: number | null }) {
  const [draft, setDraftState] = useState<Draft>(() => initial(game));
  const [busy, setBusy] = useState(false);
  const [changing, setChanging] = useState(false);
  const name = st.useName();
  const offline = st.useOffline();
  const undoSecs = st.useServerConfig()?.undoSeconds ?? 5;
  const locked = undoUntil != null;

  const setDraft = (d: Draft) => {
    drafts.set(game.id, d);
    ssSet(dkey(game.id), JSON.stringify(d));
    setDraftState(d);
  };

  const values = draftValues(game, draft);
  const valid = values != null && validateTip(game, values).ok;
  // Ungültiger Wert (außerhalb des Bereichs/Rasters): kein „Lock in 1.500“ auf dem gesperrten Button
  const label = values == null || !valid
    ? C.tip.buttonEmpty
    : C.tip.button(typeof values === 'string' ? `“${clip(values, 24)}”` : formatTipLabel(game.fields, values));

  const submit = async () => {
    if (!valid || !name || busy || locked) return;
    lastSubmitAt.set(game.id, Date.now());
    setBusy(true);
    try {
      const r = await api.tip(game.id, values!);
      st.upsertGame(r.game);
      st.set({ justTipped: game.id });
      st.dismissWelcome();
      try {
        navigator.serviceWorker?.controller?.postMessage({ type: 'CLOSE_GAME_NOTIFICATIONS', gameId: game.id });
      } catch {
        /* kein SW */
      }
    } catch (e) {
      fail(e);
      if (e instanceof ApiError && e.status === 409) void loadGame(game.id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    const tipId = game.viewer.tipId;
    if (tipId == null || busy) return;
    if (Date.now() - (lastSubmitAt.get(game.id) ?? 0) < UNDO_ARM_MS) return;
    setBusy(true);
    try {
      await api.undoTip(tipId);
      st.toast(C.tip.undone);
      st.set({ justTipped: null });
    } catch (e) {
      st.toast(e instanceof ApiError && e.code === 'UNDO_EXPIRED' ? C.tip.tooLate : (e as Error).message);
    } finally {
      setBusy(false);
      void loadGame(game.id).catch(() => {});
    }
  };

  return (
    <div className="panel">
      {game.answerType === 'text' ? (
        <TextTip value={typeof draft === 'string' ? draft : ''} onChange={setDraft} onEnter={submit} disabled={locked} />
      ) : game.fields.length > 1 ? (
        <MultiNumberTip fields={game.fields} values={draft as (number | null)[]} onChange={setDraft} disabled={locked} />
      ) : (
        <NumberTip field={game.fields[0]!} value={(draft as (number | null)[])[0] ?? null} onChange={(v) => setDraft([v])} disabled={locked} />
      )}

      <p className="hint center">{C.tip.hint(undoSecs)}</p>

      {!locked && (!name || changing ? (
        <NamePicker onDone={() => setChanging(false)} />
      ) : (
        <p className="as">
          {C.name.tippingAs} <b>{name}</b> ·{' '}
          <button type="button" className="link-btn tp-change" onClick={() => setChanging(true)}>{C.name.change}</button>
        </p>
      ))}

      <SubmitTipButton label={label} disabled={!valid || !name} busy={busy} undoUntil={undoUntil} undoTotal={undoSecs}
        onSubmit={submit} onUndo={undo} offline={offline} />
    </div>
  );
}
