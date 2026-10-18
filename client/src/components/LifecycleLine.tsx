import type { GameDTO } from '../../../shared/types.ts';
import { formatDate, formatDay } from '../../../shared/format.ts';
import { STALE_OPEN_DAYS } from '../../../shared/inbox.ts';
import { C } from '../copy.ts';
import { now } from '../store.ts';
import { isDone, ph } from '../util.ts';
import { Link } from './Link.tsx';

/** Genau ein Satz zum Lebenszyklus (§1.4.2). */
export function LifecycleLine({ game: g }: { game: GameDTO }) {
  const p = ph(g);
  const c = g.createdBy;
  if (isDone(p)) {
    return (
      <p className="life">
        {C.life.resolved(formatDate(g.resolvedAt!, { year: 'always' }), g.resolvedBy ?? c)}
        {g.correctedAt && C.life.corrected(formatDay(g.correctedAt))}
      </p>
    );
  }
  if (p === 'closed') {
    const at = g.closedAt ?? g.closesAt!;
    const early = g.closedAt && g.closesAt && Date.parse(g.closedAt) < Date.parse(g.closesAt) - 60_000;
    return (
      <p className="life">
        {g.canManage ? (
          <>{C.life.closedMgr} <Link to={`/bet/${g.id}/resolve`}><b>{C.manage.resolve}</b></Link>.</>
        ) : C.life.closed(formatDate(at), c)}
        {early && C.life.planned(formatDate(g.closesAt!))}
      </p>
    );
  }
  if (g.closesAt) {
    return <p className="life">{C.life.until} <b>{formatDate(g.closesAt)}</b>{C.life.untilAfter(c)}</p>;
  }
  const days = Math.floor((now() - Date.parse(g.createdAt)) / 86_400_000);
  return <p className="life">{g.canManage && days > STALE_OPEN_DAYS ? C.life.stale(days) : C.life.noClose(c)}</p>;
}
