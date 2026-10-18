// Routing (§1.2) + Lade-/Fehlerzustände.
import { useLayoutEffect, useRef } from 'react';
import { load } from './api.ts';
import { C } from './copy.ts';
import { restoreScroll, usePath } from './router.ts';
import * as st from './store.ts';
import { AppShell } from './components/AppShell.tsx';
import { EmptyState } from './components/EmptyState.tsx';
import { Skeleton } from './components/Skeleton.tsx';
import { Bet } from './screens/Bet.tsx';
import { EditBet } from './screens/EditBet.tsx';
import { HowItWorks } from './screens/HowItWorks.tsx';
import { Inbox } from './screens/Inbox.tsx';
import { Leaderboard } from './screens/Leaderboard.tsx';
import { Me } from './screens/Me.tsx';
import { NewBet } from './screens/NewBet.tsx';
import { NotFound } from './screens/NotFound.tsx';
import { Player } from './screens/Player.tsx';
import { Resolve } from './screens/Resolve.tsx';
import { Results } from './screens/Results.tsx';

function route(path: string) {
  let m: RegExpExecArray | null;
  if (path === '/') return { data: true, el: <Inbox /> };
  if ((m = /^\/bet\/(\d+)$/.exec(path))) return { data: true, el: <Bet key={m[1]} id={Number(m[1])} /> };
  if ((m = /^\/bet\/(\d+)\/resolve$/.exec(path))) return { data: true, el: <Resolve key={m[1]} id={Number(m[1])} /> };
  if ((m = /^\/bet\/(\d+)\/edit$/.exec(path))) return { data: true, el: <EditBet key={m[1]} id={Number(m[1])} /> };
  if (path === '/new') return { data: false, el: <NewBet /> };
  if (path === '/results') return { data: true, el: <Results /> };
  if (path === '/leaderboard') return { data: true, el: <Leaderboard /> };
  if ((m = /^\/leaderboard\/([^/]+)$/.exec(path))) {
    let n = m[1]!;
    try {
      n = decodeURIComponent(n);
    } catch {
      /* roh lassen */
    }
    return { data: true, el: <Player key={n} name={n} /> };
  }
  if (path === '/me') return { data: false, el: <Me /> };
  if (path === '/how-it-works') return { data: false, el: <HowItWorks /> };
  return { data: false, el: <NotFound /> };
}

export function App() {
  const raw = usePath();
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  const has = st.useStore((s) => s.state != null);
  const error = st.useStore((s) => s.error);
  const first = useRef(true);

  useLayoutEffect(() => {
    restoreScroll();
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [path]);

  const r = route(path);
  let el = r.el;
  if (r.data && !has) {
    el = error ? (
      <EmptyState big title={C.err.loadFull} text={error}>
        <button type="button" className="btn btn-primary" onClick={() => void load()}>{C.retry}</button>
      </EmptyState>
    ) : <Skeleton />;
  }
  return <AppShell>{el}</AppShell>;
}
