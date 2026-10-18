import { useEffect, useState } from 'react';
import { C } from '../copy.ts';
import { now } from '../store.ts';
import { cx, useNow } from '../util.ts';

/** So lange nach dem Tippen ist der Undo-Button noch gesperrt. */
export const UNDO_ARM_MS = 700;

/** Tipp-Button mit Wert im Label; im Undo-Fenster „✓ Getippt · Rückgängig (5)“. Sticky über der Bottom-Bar. */
export function SubmitTipButton({ label, disabled, busy, undoUntil, undoTotal, onSubmit, onUndo, offline }: {
  label: string; disabled: boolean; busy: boolean; undoUntil: number | null; undoTotal: number;
  onSubmit: () => void; onUndo: () => void; offline: boolean;
}) {
  useNow(undoUntil ? 250 : 60_000);
  // Undo erst nach kurzer Zeit scharf: sonst landet der zweite Klick eines Doppelklicks auf „Lock in“
  // direkt auf dem Undo-Button, der an derselben Stelle erscheint (Tipp wäre sofort wieder weg).
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(false);
    if (!undoUntil) return;
    const t = setTimeout(() => setArmed(true), UNDO_ARM_MS);
    return () => clearTimeout(t);
  }, [undoUntil]);
  const left = undoUntil ? Math.max(0, Math.ceil((undoUntil - now()) / 1000)) : 0;
  if (undoUntil && left > 0) {
    const frac = Math.max(0, Math.min(1, (undoUntil - now()) / (undoTotal * 1000)));
    return (
      <div className="dock">
        <button type="button" className="btn btn-primary btn-undo" onClick={onUndo} disabled={busy || !armed}>
          <span className="btn-undo-bar" style={{ transform: `scaleX(${frac})` }} aria-hidden="true" />
          <span className="btn-label">{C.tip.undo(left)}</span>
        </button>
      </div>
    );
  }
  const off = offline && !disabled;
  return (
    <div className="dock">
      <button type="button" className={cx('btn btn-primary', off && 'is-off')} onClick={() => !off && onSubmit()}
        disabled={disabled || busy} aria-disabled={off || undefined} title={off ? C.err.offlineShort : undefined}>
        <span className="btn-label">{busy ? C.tip.saving : label}</span>
      </button>
    </div>
  );
}
