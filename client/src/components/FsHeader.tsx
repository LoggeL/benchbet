import type { ReactNode } from 'react';
import { C } from '../copy.ts';
import { Icon } from './Icon.tsx';

/** Kopf für Vollbild-Screens: Zurück · Titel · rechts optional. */
export function FsHeader({ title, sub, onBack, right }: { title: string; sub?: ReactNode; onBack: () => void; right?: ReactNode }) {
  return (
    <header className="fsh">
      <div className="topbar">
        <button type="button" className="icon-btn back" onClick={onBack} aria-label={C.back}>
          <Icon n="back" />
          <span className="back-l">{C.back}</span>
        </button>
        {right}
      </div>
      <h1 className="h1">{title}</h1>
      {sub && <p className="fsh-sub">{sub}</p>}
    </header>
  );
}
