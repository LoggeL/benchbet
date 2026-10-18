// Ergebnisse: „Diese Woche“ (resolved) + „Archiv“ (archived, nach Monat) (§1.4.6).
import { useState } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { formatDay, formatMonth, joinNames } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { lsGet, lsSet } from '../storage.ts';
import * as st from '../store.ts';
import { outcomeShort, ownTip, ph, resultText } from '../util.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { GameRow } from '../components/GameRow.tsx';
import { Icon } from '../components/Icon.tsx';
import { InboxSection } from '../components/InboxSection.tsx';
import { Link } from '../components/Link.tsx';
import { MyStatus } from '../components/MyStatus.tsx';

const byResolved = (a: GameDTO, b: GameDTO) => Date.parse(b.resolvedAt!) - Date.parse(a.resolvedAt!);
const winnersOf = (g: GameDTO) => {
  const w = g.tips.filter((t) => t.isWinner).map((t) => t.playerName);
  return w.length ? joinNames(w) : C.results.nobodyShort;
};

function ResultCard({ g }: { g: GameDTO }) {
  const unseen = !g.viewer.resultSeen && st.get().name;
  return (
    <Link to={`/bet/${g.id}`} className="card rcard">
      <span className="rcard-top">
        <span className="rcard-title">{unseen && <i className="dot-new" aria-label={C.results.unseen} />}{g.prompt}</span>
      </span>
      <span className="rcard-res num">{resultText(g)}</span>
      <span className="rcard-foot">
        <span>{C.results.winners(winnersOf(g))}</span>
        <MyStatus game={g} />
      </span>
      {g.archiveAt && <span className="muted small">{C.results.archiveFrom(formatDay(g.archiveAt))}</span>}
    </Link>
  );
}

export function Results() {
  const games = st.useGames();
  const named = st.useName() != null;
  st.useTick();
  const [q, setQ] = useState(() => lsGet('benchbet.search') ?? '');
  const [mine, setMine] = useState(() => lsGet('benchbet.mine') === '1');
  if (!games) return null;

  const done = games.filter((g) => {
    const p = ph(g);
    return p === 'resolved' || p === 'archived';
  });
  const needle = q.trim().toLocaleLowerCase('de-DE');
  const hits = done.filter((g) =>
    (!needle || `${g.prompt} ${g.benchmark} ${g.createdBy}`.toLocaleLowerCase('de-DE').includes(needle)) && (!mine || ownTip(g)));
  const week = hits.filter((g) => ph(g) === 'resolved').sort(byResolved);
  const arch = hits.filter((g) => ph(g) === 'archived').sort(byResolved);
  const months = new Map<string, GameDTO[]>();
  for (const g of arch) {
    const m = formatMonth(g.resolvedAt!);
    months.set(m, [...(months.get(m) ?? []), g]);
  }
  const setSearch = (v: string) => {
    setQ(v);
    lsSet('benchbet.search', v || null);
  };
  const toggleMine = () => {
    setMine(!mine);
    lsSet('benchbet.mine', mine ? null : '1');
  };

  if (!done.length) {
    return (
      <EmptyState big title={C.empty.resultsTitle} text={C.empty.resultsText}>
        <Link to="/" className="btn btn-secondary">{C.toOpen}</Link>
      </EmptyState>
    );
  }

  return (
    <div className="results">
      <h1 className="h1 page-title">{C.nav.results}</h1>
      {(done.length >= 6 || named) && (
        <div className="filters">
          {done.length >= 6 && (
            <label className="search">
              <Icon n="search" size={18} />
              <input type="search" value={q} placeholder={C.results.search} aria-label={C.results.search}
                onChange={(e) => setSearch(e.target.value)} enterKeyHint="search" />
            </label>
          )}
          {named && (
            <button type="button" className="chip" aria-pressed={mine} onClick={toggleMine}>{C.results.mine}</button>
          )}
        </div>
      )}
      {!hits.length && (
        <EmptyState title={C.empty.searchTitle} text={C.empty.searchText}>
          <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); if (mine) toggleMine(); }}>{C.empty.searchCta}</button>
        </EmptyState>
      )}
      {week.length > 0 && (
        <InboxSection title={C.results.week} count={week.length} id="r-week">
          <ul className="cards">{week.map((g) => <li key={g.id}><ResultCard g={g} /></li>)}</ul>
        </InboxSection>
      )}
      {arch.length > 0 && (
        <InboxSection title={C.results.archive} count={arch.length} id="r-arch">
          {[...months].map(([m, list]) => (
            <div key={m} className="month">
              <h3 className="month-h">{m}</h3>
              <ul className="list">
                {list.map((g) => (
                  <li key={g.id}>
                    <GameRow to={`/bet/${g.id}`} title={g.prompt} dot={!g.viewer.resultSeen && named}
                      sub={<><b className="num result-ink">{resultText(g)}</b> · {C.results.winners(winnersOf(g))}</>}
                      side={named ? <span>{outcomeShort(g)}</span> : undefined} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </InboxSection>
      )}
    </div>
  );
}
