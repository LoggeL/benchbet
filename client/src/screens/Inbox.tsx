// Offen (Inbox): sortiert nach Handlungsbedarf (§1.4.1).
import { useEffect, useRef, useState } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { inboxSections } from '../../../shared/inbox.ts';
import { load } from '../api.ts';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { outcomeShort, ownTip, ph, resultText, valueText } from '../util.ts';
import { Countdown } from '../components/Countdown.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { GameCard } from '../components/GameCard.tsx';
import { GameRow } from '../components/GameRow.tsx';
import { InboxSection } from '../components/InboxSection.tsx';
import { InstallCard } from '../components/InstallCard.tsx';
import { Link } from '../components/Link.tsx';
import { PushCard } from '../components/PushCard.tsx';
import { StatusLine } from '../components/StatusLine.tsx';

/** Neue Wetten (seit dem letzten Rendern) – für Lime-Puls bzw. Pille „1 neue Wette ↑“. */
function useFresh(games: GameDTO[]): [Set<number>, number, () => void] {
  const known = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [above, setAbove] = useState(0);
  useEffect(() => {
    const ids = new Set(games.map((g) => g.id));
    if (known.current) {
      const add = [...ids].filter((id) => !known.current!.has(id));
      if (add.length) {
        setFresh(new Set(add));
        if (window.scrollY > 160) setAbove((n) => n + add.length);
        setTimeout(() => setFresh(new Set()), 900);
      }
    }
    known.current = ids;
  }, [games]);
  return [fresh, above, () => setAbove(0)];
}

/** Pull-to-refresh: oben herunterziehen → GET /api/state. */
function usePull(): number {
  const [pull, setPull] = useState(0);
  useEffect(() => {
    let y0: number | null = null;
    let d = 0;
    const start = (e: TouchEvent) => {
      y0 = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
    };
    const move = (e: TouchEvent) => {
      if (y0 == null) return;
      d = Math.max(0, Math.min(120, e.touches[0]!.clientY - y0));
      setPull(d);
    };
    const end = () => {
      if (y0 != null && d > 70) void load();
      y0 = null;
      d = 0;
      setPull(0);
    };
    addEventListener('touchstart', start, { passive: true });
    addEventListener('touchmove', move, { passive: true });
    addEventListener('touchend', end);
    return () => {
      removeEventListener('touchstart', start);
      removeEventListener('touchmove', move);
      removeEventListener('touchend', end);
    };
  }, []);
  return pull;
}

export function Inbox() {
  const games = st.useGames();
  const meKey = st.useMeKey();
  st.useTick();
  const [fresh, above, clearAbove] = useFresh(games ?? []);
  const pull = usePull();
  if (!games) return null;

  const s = inboxSections(games, { now: st.now(), meKey });
  const named = meKey != null;
  const closedMine = s.tipped.filter((g) => ph(g) === 'closed').length;
  const nothingOpen = named
    ? !s.missing.length && !s.tipped.length && !s.closedWithout.length && !s.todo.length && !s.newResults.length
    : !s.open.length && !s.waiting.length;

  return (
    <div className="inbox">
      {pull > 0 && <div className="pull" style={{ height: pull / 2 }} aria-hidden="true">{pull > 70 ? C.inbox.pulling : ''}</div>}
      {above > 0 && (
        <button type="button" className="newpill" onClick={() => { scrollTo({ top: 0, behavior: 'smooth' }); clearAbove(); }}>
          {C.inbox.newPill(above)}
        </button>
      )}
      <StatusLine named={named} missing={s.missing} closedMine={closedMine} />

      {nothingOpen ? (
        <EmptyState big title={C.empty.inboxTitle} text={C.empty.inboxText}>
          <Link to="/new" className="btn btn-primary">{C.empty.inboxCta}</Link>
          <PushCard variant="empty" />
        </EmptyState>
      ) : named ? (
        <>
          {!s.missing.length && <PushCard variant="inline" />}
          {s.todo.length > 0 && (
            <InboxSection title={C.inbox.todo} count={s.todo.length} id="s-todo">
              <ul className="list">
                {s.todo.map((t) => (
                  <li key={t.game.id}>
                    {t.kind === 'resolve' ? (
                      <GameRow to={`/bet/${t.game.id}/resolve`} title={C.inbox.dueResolve(t.game.prompt)}
                        side={<span className="accent-ink">{C.inbox.dueResolveCta}</span>} />
                    ) : (
                      <GameRow to={`/bet/${t.game.id}`} title={t.game.prompt}
                        sub={<>{C.inbox.stale(t.days)} · <span className="accent-ink">{C.inbox.staleCta} ›</span></>} />
                    )}
                  </li>
                ))}
              </ul>
            </InboxSection>
          )}
          {s.missing.length > 0 && (
            <InboxSection title={C.inbox.missing} count={s.missing.length} id="s-missing">
              <ul className="cards">
                {s.missing.map((g) => <li key={g.id}><GameCard game={g} cta={C.ctaTip} fresh={fresh.has(g.id)} /></li>)}
              </ul>
            </InboxSection>
          )}
          {s.newResults.length > 0 && (
            <InboxSection title={C.inbox.newResults} count={s.newResults.length} id="s-new">
              <ul className="list">
                {s.newResults.map((g) => (
                  <li key={g.id}>
                    <GameRow to={`/bet/${g.id}`} dot title={g.prompt}
                      side={<><b className="num result-ink">{resultText(g)}</b><span>{outcomeShort(g)}</span></>} />
                  </li>
                ))}
              </ul>
            </InboxSection>
          )}
          {s.tipped.length > 0 && (
            <InboxSection title={C.inbox.tipped} count={s.tipped.length} id="s-tipped">
              <ul className="list">
                {s.tipped.map((g) => {
                  const t = ownTip(g);
                  const open = ph(g) === 'open';
                  return (
                    <li key={g.id}>
                      <GameRow to={`/bet/${g.id}`} title={g.prompt} fresh={fresh.has(g.id)}
                        sub={open && g.closesAt ? <Countdown at={g.closesAt} /> : open ? C.inbox.noDeadline : C.waitsResult}
                        side={<><span className="num" aria-label={C.my.tip(t?.values != null ? valueText(g, t.values) : '✓')}>{t?.values != null ? valueText(g, t.values) : '✓'}</span><span>{C.tipCount(g.tipCount)}</span></>} />
                    </li>
                  );
                })}
              </ul>
            </InboxSection>
          )}
          {s.closedWithout.length > 0 && (
            <InboxSection title={C.inbox.closedWithout} count={s.closedWithout.length} id="s-closed">
              <ul className="list">
                {s.closedWithout.map((g) => (
                  <li key={g.id}><GameRow to={`/bet/${g.id}`} dim title={g.prompt} side={<span>{C.tippingClosed}</span>} /></li>
                ))}
              </ul>
            </InboxSection>
          )}
        </>
      ) : (
        <>
          {s.open.length > 0 && (
            <InboxSection title={C.inbox.open} count={s.open.length} id="s-open">
              <ul className="cards">
                {s.open.map((g) => <li key={g.id}><GameCard game={g} cta={C.ctaJoin} fresh={fresh.has(g.id)} /></li>)}
              </ul>
            </InboxSection>
          )}
          {s.waiting.length > 0 && (
            <InboxSection title={C.inbox.waiting} count={s.waiting.length} id="s-wait">
              <ul className="list">
                {s.waiting.map((g) => (
                  <li key={g.id}><GameRow to={`/bet/${g.id}`} dim title={g.prompt} side={<span>{C.tipCount(g.tipCount)}</span>} /></li>
                ))}
              </ul>
            </InboxSection>
          )}
        </>
      )}
      <InstallCard />
      <p className="foot-link"><Link to="/results">{C.inbox.allResults}</Link></p>
    </div>
  );
}
