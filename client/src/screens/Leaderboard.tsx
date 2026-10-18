// Rangliste: Deine Bilanz + alle, Formel exakt nach §2.8 (kommt fertig vom Server).
import { useEffect, useRef, useState } from 'react';
import { nameKey } from '../../../shared/names.ts';
import { statsHeadline } from '../../../shared/stats.ts';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { LeaderRow } from '../components/LeaderRow.tsx';
import { Link } from '../components/Link.tsx';
import { StatTiles } from '../components/StatTiles.tsx';

export function Leaderboard() {
  const stats = st.useStore((s) => s.state?.stats ?? null);
  const name = st.useName();
  const ownRef = useRef<HTMLLIElement>(null);
  const [ownHidden, setOwnHidden] = useState(false);
  const key = name ? nameKey(name) : null;
  const me = stats?.players.find((p) => p.key === key);

  useEffect(() => {
    const el = ownRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setOwnHidden(!e!.isIntersecting), { rootMargin: '-52px 0px -80px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [!!me]);

  if (!stats) return null;
  if (!stats.tipCount) {
    return (
      <EmptyState big title={C.empty.boardTitle} text={C.empty.boardText}>
        <Link to="/" className="btn btn-secondary">{C.toOpen}</Link>
      </EmptyState>
    );
  }

  return (
    <div className="board">
      <section className="sec">
        <h2 className="label bal-head">
          <span>{C.board.yours}{name && <> · <span className="norm">{name}</span></>}</span>
          {me?.rank != null && <span className="bal-rank">{C.board.place(me.rank)}</span>}
        </h2>
        {!name ? (
          <div className="card pad">
            <p>{C.empty.balNoName}</p>
            <button type="button" className="btn btn-secondary" onClick={() => st.set({ namePicker: true })}>{C.empty.balNoName2}</button>
          </div>
        ) : !me ? (
          <div className="card pad">
            <p>{C.empty.balNone}</p>
            <Link to="/" className="btn btn-secondary">{C.toOpen}</Link>
          </div>
        ) : (
          <>
            <StatTiles p={me} />
            {!me.settled && <p className="muted small">{C.empty.balPending}</p>}
          </>
        )}
      </section>

      <section className="sec">
        <h1 className="label">{C.board.title}</h1>
        <p className="muted small num">{statsHeadline(stats)}</p>
        {!stats.resolvedCount && <p className="muted">{C.empty.boardNoResults}</p>}
        <ol className="leaders">
          {stats.players.map((p) => (
            <li key={p.key} ref={p.key === key ? ownRef : undefined}>
              <LeaderRow p={p} me={p.key === key} />
            </li>
          ))}
        </ol>
        <p className="foot muted small">{C.board.foot1}<br />{C.board.foot2}</p>
      </section>
      {me && ownHidden && (
        <div className="sticky-own"><LeaderRow p={me} me sticky /></div>
      )}
    </div>
  );
}
