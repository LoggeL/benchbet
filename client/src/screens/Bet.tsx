// Wette (Detail): oben lesen, unten handeln. Genau ein Aktionszustand A/A′/B/C/D (§1.4.2.1).
import { useEffect, useReducer, useRef, useState } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { formatDate, formatTime, relTime, topicLabel } from '../../../shared/format.ts';
import { inboxSections } from '../../../shared/inbox.ts';
import { isFromPush } from '../../../shared/routes.ts';
import { ApiError, loadGame } from '../api.ts';
import { C } from '../copy.ts';
import { back } from '../router.ts';
import * as st from '../store.ts';
import { cx, isDone, ownTip, ph, valueText } from '../util.ts';
import { ActivityLog } from '../components/ActivityLog.tsx';
import { AnswerClusters } from '../components/AnswerClusters.tsx';
import { CreatorMenu } from '../components/CreatorMenu.tsx';
import { Distribution } from '../components/Distribution.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { Icon } from '../components/Icon.tsx';
import { InsightLine } from '../components/InsightLine.tsx';
import { LifecycleLine } from '../components/LifecycleLine.tsx';
import { Link } from '../components/Link.tsx';
import { PhasePill } from '../components/PhasePill.tsx';
import { PushCard } from '../components/PushCard.tsx';
import { ResultView } from '../components/Reveal.tsx';
import { RuleSummary } from '../components/RuleSummary.tsx';
import { RulesDisclosure } from '../components/RulesDisclosure.tsx';
import { SealChips } from '../components/SealChips.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { clearDraft, TipPanel } from '../components/TipPanel.tsx';

export function Gone() {
  return (
    <EmptyState big title={C.empty.gone} text="">
      <Link to="/" className="btn btn-primary">{C.toOpen}</Link>
    </EmptyState>
  );
}

async function share(g: GameDTO, done: () => void) {
  const url = `${location.origin}/bet/${g.id}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: g.prompt, url });
      return done();
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    st.toast(C.shareCopied);
  } catch {
    history.replaceState(history.state, '', `/bet/${g.id}`);
    st.toast(C.shareFail);
  }
  done();
}

/** „Noch nicht dabei: A, B, C, D +2“ */
function notYet(names: string[]): string {
  const head = names.slice(0, 4).join(', ');
  return names.length > 4 ? `${head} +${names.length - 4}` : head;
}

function OwnTip({ game: g }: { game: GameDTO }) {
  const t = ownTip(g);
  if (!t) return null;
  return (
    <div className="owntip">
      <p className="owntip-head">
        <Icon n="check" size={18} />
        <span>{C.tip.yourTip.replace('✓ ', '')} <b className="num">{t.values == null ? '…' : valueText(g, t.values)}</b></span>
      </p>
      <p className="muted small">{t.createdAt ? C.tip.placedAt(formatDate(t.createdAt)) : C.tip.legacy}</p>
    </div>
  );
}

function NextUp({ id }: { id: number }) {
  const games = st.useGames() ?? [];
  const me = st.useMeKey();
  const missing = inboxSections(games, { now: st.now(), meKey: me }).missing.filter((g) => g.id !== id);
  if (!missing.length) return <p className="next done">{C.tip.allDone}</p>;
  return (
    <Link to={`/bet/${missing[0]!.id}`} className="next">
      <span>{C.tip.more(missing.length)}</span>
      <b>{C.tip.moreCta}<Icon n="right" size={16} /></b>
    </Link>
  );
}

export function Bet({ id }: { id: number }) {
  const game = st.useGame(id);
  const loaded = st.useStore((s) => s.state != null);
  st.useTick();
  const [gone, setGone] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const justTipped = st.useStore((s) => s.justTipped === id);
  const justCreated = st.useStore((s) => s.justCreated === id);
  const flip = st.useStore((s) => s.flip === id);
  const live = st.useStore((s) => (s.liveLine?.gameId === id ? s.liveLine : null));
  const [liveText, setLiveText] = useState('');

  useEffect(() => {
    if (!loaded || game) return;
    loadGame(id).catch((e) => e instanceof ApiError && e.status === 404 && setGone(true));
  }, [loaded, !!game, id]);

  useEffect(() => {
    if (game) document.title = `${game.prompt} · ${C.appName}`;
    return () => {
      document.title = C.appName;
    };
  }, [game?.prompt]);

  // „{actor} hat gerade getippt.“ für 4 s
  useEffect(() => {
    if (!live) return;
    setLiveText(live.text);
    const t = setTimeout(() => setLiveText(''), 4000);
    return () => clearTimeout(t);
  }, [live?.id]);

  // Teilen-Button 5 s pulsieren lassen nach dem Anlegen
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!justCreated) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 5000);
    return () => clearTimeout(t);
  }, [justCreated]);

  // Undo-Fenster: am Ende neu laden → Werte sichtbar → Siegel klappen auf
  const undoUntil = game?.viewer.undoUntil ? Date.parse(game.viewer.undoUntil) : 0;
  const inUndo = !!game?.viewer.hasTipped && undoUntil > st.now();
  const wasUndo = useRef(false);
  useEffect(() => {
    if (!inUndo) return;
    wasUndo.current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const fetchIt = async (n: number) => {
      rerender();
      try {
        const g = await loadGame(id);
        if (!g.answersRevealed && g.viewer.hasTipped && n < 5) retry = setTimeout(() => void fetchIt(n + 1), 1000);
      } catch {
        if (n < 5) retry = setTimeout(() => void fetchIt(n + 1), 1500);
      }
    };
    const t = setTimeout(() => void fetchIt(0), undoUntil - st.now() + 150);
    return () => {
      clearTimeout(t);
      clearTimeout(retry);
    };
  }, [inUndo, undoUntil, id]);
  useEffect(() => {
    if (!game || inUndo || !wasUndo.current) return;
    if (!game.viewer.hasTipped) {
      wasUndo.current = false;
      return;
    }
    if (game.answersRevealed) {
      wasUndo.current = false;
      clearDraft(id);
      st.set({ flip: id });
      st.toast(C.tip.stands);
    }
  }, [inUndo, game?.answersRevealed, game?.viewer.hasTipped]);

  if (!game) return gone ? <Gone /> : <Skeleton rows={2} />;

  const g = game;
  const p = ph(g);
  const v = g.viewer;
  const viaPush = isFromPush(location.search);
  const sealDelay = g.tips.length * 120 + 250;

  let action;
  if (isDone(p)) {
    action = <ResultView game={g} />;
  } else if (p === 'open' && !v.hasTipped) {
    action = (
      <>
        <Seals game={g} />
        <TipPanel key={`${g.id}-${v.tipId}`} game={g} undoUntil={null} />
      </>
    );
  } else if (v.hasTipped && inUndo) {
    action = (
      <>
        <Seals game={g} />
        <TipPanel key={`${g.id}-u`} game={g} undoUntil={undoUntil} />
      </>
    );
  } else if (v.hasTipped) {
    action = (
      <>
        <OwnTip game={g} />
        <section className="sec" aria-label={C.result.all}>
          <h2 className="label">{C.tipCount(g.tipCount)}</h2>
          <SealChips game={g} revealed={g.answersRevealed} flip={flip} />
          {g.answersRevealed && (
            <>
              <Distribution game={g} delay={flip ? sealDelay : undefined} />
              {g.answerType === 'text' && <AnswerClusters game={g} />}
              <InsightLine game={g} />
            </>
          )}
          {p === 'open' && g.notYetTipped.length > 0 && <p className="muted small">{C.notYet(notYet(g.notYetTipped))}</p>}
          {p === 'closed' && <p className="muted">{C.tip.waiting(g.createdBy)}</p>}
        </section>
        {justTipped && g.answersRevealed && (
          <>
            <PushCard variant="afterTip" />
            <NextUp id={g.id} />
          </>
        )}
      </>
    );
  } else {
    const closedAt = g.closedAt ?? g.closesAt;
    action = (
      <div className="closedc">
        <p className="callout">
          <Icon n="lock" size={18} />
          <span>{viaPush && closedAt ? C.tip.tooLatePush(formatTime(closedAt)) + ' ' : ''}{C.tip.closedC(g.createdBy)}</span>
        </p>
        <SealChips game={g} revealed={false} />
      </div>
    );
  }

  return (
    <article className={cx('detail', `ph-${p}`)}>
      <div className="topbar">
        <button type="button" className="icon-btn back" onClick={() => back('/')} aria-label={C.back}>
          <Icon n="back" />
          <span className="back-l">{C.back}</span>
        </button>
        <span className="topbar-r">
          <button type="button" className={cx('icon-btn', pulse && 'pulse')} onClick={() => share(g, () => setPulse(false))} aria-label={C.share}>
            <Icon n="share" />
          </button>
          {g.canManage && (
            <button type="button" className="icon-btn" onClick={() => setMenu(true)} aria-label={C.more} aria-haspopup="dialog">
              <Icon n="more" />
            </button>
          )}
        </span>
      </div>

      <header className="dhead">
        <div className="dhead-pills">
          <PhasePill game={g} countdown />
          <span className="topic">{topicLabel(g)}</span>
        </div>
        <h1 className="h1">
          {g.prompt}
          {g.promptEditedAt && <span className="edited"> {C.editedTag}</span>}
        </h1>
        <p className="muted small">{C.by(g.createdBy, relTime(g.createdAt, { now: st.now() }))}</p>
        <LifecycleLine game={g} />
        <RuleSummary game={g} />
        <RulesDisclosure game={g} />
      </header>

      <div className="action">
        {g.canManage && p === 'closed' && (
          <Link to={`/bet/${g.id}/resolve`} className="btn btn-primary resolve-cta">{C.manage.resolve}</Link>
        )}
        {action}
        {justCreated && <PushCard variant="afterCreate" />}
      </div>

      <p className="liveline" aria-live="polite">{p === 'open' ? liveText : ''}</p>

      <ActivityLog game={g} />
      {g.canManage && <CreatorMenu game={g} open={menu} onClose={() => setMenu(false)} />}
    </article>
  );
}

/** VERDECKT · n + Siegel + „Dein Tipp deckt sie auf. · Noch nicht dabei: …“ */
function Seals({ game: g }: { game: GameDTO }) {
  const p = ph(g);
  return (
    <section className="sec sealsec" aria-label={C.sealed(g.tipCount)}>
      {g.tipCount > 0 ? (
        <>
          <h2 className="label">{C.sealed(g.tipCount)}</h2>
          <SealChips game={g} revealed={false} />
          <p className="muted small">
            {g.viewer.hasTipped ? C.sealedPending : C.sealedHint}
            {p === 'open' && g.notYetTipped.length > 0 && <> · {C.notYet(notYet(g.notYetTipped))}</>}
          </p>
        </>
      ) : (
        <p className="muted">{C.noTipsYet}</p>
      )}
    </section>
  );
}
