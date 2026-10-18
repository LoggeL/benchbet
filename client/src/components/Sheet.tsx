// Bottom-Sheet: Fokusfalle, Esc, aria-modal, Fokus-Rückgabe, Rest der App inert.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { C } from '../copy.ts';
import { Icon } from './Icon.tsx';

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, children, danger }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; danger?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    document.documentElement.classList.add('locked');
    const el = ref.current!;
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? el).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
      } else if (e.key === 'Tab') {
        const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      if (!document.querySelector('.sheet-wrap ~ .sheet-wrap')) {
        root?.removeAttribute('inert');
        document.documentElement.classList.remove('locked');
      }
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={danger ? 'sheet danger' : 'sheet'} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined}
        aria-label={title ? undefined : C.close} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          {title ? <h2 id={id}>{title}</h2> : <span />}
          <button type="button" className="icon-btn" onClick={onClose} aria-label={C.close}>
            <Icon n="x" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
