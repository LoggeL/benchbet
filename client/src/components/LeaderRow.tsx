import type { PlayerStats } from '../../../shared/types.ts';
import { formatPercent } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';
import { Avatar } from './Avatar.tsx';
import { FormStrip } from './FormStrip.tsx';
import { Link } from './Link.tsx';

/** Ranglistenzeile: alle sechs Kennzahlen sichtbar, nichts abgeschnitten. */
export function LeaderRow({ p, me, sticky }: { p: PlayerStats; me: boolean; sticky?: boolean }) {
  return (
    <Link to={`/leaderboard/${encodeURIComponent(p.name)}`} className={cx('lrow', me && 'me', sticky && 'sticky-me')}>
      <span className="lrow-rank num">{p.rank ?? '–'}</span>
      <Avatar name={p.name} />
      <span className="lrow-main">
        <span className="lrow-name">
          {p.name}
          {me && <em className="you">{C.board.you}</em>}
        </span>
        <span className="lrow-k num"><b>{C.board.wins(p.wins)}</b> · {formatPercent(p.winRate)}</span>
        <span className="lrow-s num">{C.board.line2(p.tips, p.settled, p.exact)}</span>
      </span>
      <FormStrip form={p.form} />
    </Link>
  );
}
