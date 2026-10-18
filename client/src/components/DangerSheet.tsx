import { useState, type ReactNode } from 'react';
import { C } from '../copy.ts';
import { Sheet } from './Sheet.tsx';

/** Bestätigung nur fürs Löschen (§1.1: Bestätigungs-Sheets gibt es nur hier). */
export function DangerSheet({ open, onClose, title, children, confirm, onConfirm }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; confirm: string; onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} danger>
      <div className="sheet-body">{children}</div>
      <div className="sheet-actions">
        <button type="button" className="btn btn-danger" onClick={go} disabled={busy}>{confirm}</button>
        <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>{C.cancel}</button>
      </div>
    </Sheet>
  );
}
