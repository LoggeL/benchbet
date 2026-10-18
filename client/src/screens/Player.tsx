// Spieler: Bilanz, Form (letzte 10), Historie aller Tipps (§1.4.8).
import { useEffect } from 'react';
import { nameKey } from '../../../shared/names.ts';
import { C } from '../copy.ts';
import { back } from '../router.ts';
import * as st from '../store.ts';
import { isDone, ph, resultText, valueText } from '../util.ts';
import { Avatar } from '../components/Avatar.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { FormStrip } from '../components/FormStrip.tsx';
import { GameRow } from '../components/GameRow.tsx';
import { Icon } from '../components/Icon.tsx';
import { InboxSection } from '../components/InboxSection.tsx';
import { Link } from '../components/Link.tsx';
import { StatTiles } from '../components/StatTiles.tsx';

export function Player({ name }: { name: string }) {
  const state = st.useStore((s) => s.state);
  const meKey = st.useMeKey();
  const key = nameKey(name);
  const p = state?.stats.players.find((x) => x.key === key);
  useEffect(() => {
    if (p) document.title = `${p.name} · ${C.appName}`;
    return () => {
      document.title = C.appName;
    };
  }, [p?.name]);
  if (!state) return null;
  if (!p) {
    return (
      <EmptyState big title={C.empty.player404} text="">
        <Link to="/leaderboard" className="btn btn-secondary">{C.board.title}</Link>
      </EmptyState>
    );
  }
  const hist = state.games
    .map((g) => ({ g, t: g.tips.find((t) => t.playerKey === key) }))
    .filter((x) => x.t)
    .sort((a, b) => Date.parse(b.g.createdAt) - Date.parse(a.g.createdAt) || b.g.id - a.g.id);

  return (
    <div className="player">
      <div className="topbar">
        <button type="button" className="icon-btn back" onClick={() => back('/leaderboard')} aria-label={C.back}>
          <Icon n="back" />
          <span className="back-l">{C.board.title}</span>
        </button>
      </div>
      <header className="phead">
        <Avatar name={p.name} size="l" />
        <div>
          <h1 className="h1">{p.name}{p.key === meKey && <em className="you">{C.board.you}</em>}</h1>
          <p className="muted">{p.rank != null ? C.board.placeOf(p.rank) : C.board.noPlace}</p>
        </div>
      </header>
      <StatTiles p={p} />
      {p.form.length > 0 && (
        <p className="pform"><span className="label">{C.board.form}</span><FormStrip form={p.form} n={10} /></p>
      )}
      <InboxSection title={C.board.history} count={hist.length} id="p-hist">
        <ul className="list">
          {hist.map(({ g, t }) => {
            const done = isDone(ph(g));
            const val = t!.values != null ? valueText(g, t!.values) : C.board.hidden;
            return (
              <li key={g.id}>
                <GameRow to={`/bet/${g.id}`} title={g.prompt}
                  sub={done ? <>{C.result.label} <b className="num result-ink">{resultText(g)}</b></> : C.phase[ph(g)]}
                  side={<><span className="num">{val}</span>{done && <span>{t!.isWinner ? '🏆' : t!.rank ? C.board.placeOf(t!.rank) : '✗'}</span>}</>} />
              </li>
            );
          })}
        </ul>
      </InboxSection>
    </div>
  );
}
