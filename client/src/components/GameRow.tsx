import type { ReactNode } from 'react';
import { C } from '../copy.ts';
import { cx } from '../util.ts';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';

/** Kompakte Zeile (≥ 64 px): Titel + Unterzeile links, Status rechts. */
export function GameRow({ to, title, sub, side, dim, dot, fresh }: {
  to: string; title: ReactNode; sub?: ReactNode; side?: ReactNode; dim?: boolean; dot?: boolean; fresh?: boolean;
}) {
  return (
    <Link to={to} className={cx('row', dim && 'dim', fresh && 'fresh')}>
      <span className="row-main">
        <span className="row-title">{dot && <i className="dot-new" aria-label={C.results.unseen} />}{title}</span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      {side && <span className="row-side">{side}</span>}
      <Icon n="right" size={16} className="row-chev" />
    </Link>
  );
}
