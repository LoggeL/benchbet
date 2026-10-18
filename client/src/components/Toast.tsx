import { useEffect } from 'react';
import { C } from '../copy.ts';
import { hideToast, useStore } from '../store.ts';

/** Ein Toast zur Zeit, unten mittig. Undo-Toasts 8 s mit Fortschrittsbalken. */
export function Toast() {
  const t = useStore((s) => s.toast);
  const fs = useStore((s) => s.fullscreen);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => hideToast(t.id), t.ms ?? (t.undo || t.action ? 8000 : 4000));
    return () => clearTimeout(h);
  }, [t]);
  return (
    <div className={fs ? 'toast-zone fs' : 'toast-zone'} role="status" aria-live="polite">
      {t && (
        <div className={t.error ? 'toast t-err' : 'toast'} key={t.id}>
          <span className="toast-msg">{t.msg}</span>
          {t.undo && (
            <button type="button" className="toast-btn" onClick={() => { hideToast(t.id); t.undo!(); }}>{C.manage.undo}</button>
          )}
          {t.action && (
            <button type="button" className="toast-btn" onClick={() => { hideToast(t.id); t.action!.run(); }}>{t.action.label}</button>
          )}
          {(t.undo || t.action) && <i className="toast-bar" aria-hidden="true" />}
        </div>
      )}
    </div>
  );
}
