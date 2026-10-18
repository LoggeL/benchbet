// Ergebnisansicht mit Reveal beim ersten Ansehen (§1.4.2.5): Linie fällt, Balken wachsen, Gewinner leuchten.
import { useEffect, useRef, useState } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { joinNames } from '../../../shared/format.ts';
import { nameKey } from '../../../shared/names.ts';
import { api } from '../api.ts';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { cx, distText, ownTip, reducedMotion, resultText } from '../util.ts';
import { AnswerClusters } from './AnswerClusters.tsx';
import { Link } from './Link.tsx';
import { RankedChart } from './RankedChart.tsx';
import { ResultBox } from './ResultBox.tsx';

const shown = new Set<number>();

/** 800 ms Konfetti, 60 Partikel, Canvas. */
export function confetti(): void {
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  if (!ctx) return c.remove();
  ctx.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ['--accent', '--result', '--warn', '--p0', '--p3'].map((v) => cs.getPropertyValue(v).trim() || '#d8fc70');
  const ps = Array.from({ length: 60 }, (_, i) => ({
    x: innerWidth / 2, y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 11, vy: -Math.random() * 10 - 3,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length]!, s: 5 + Math.random() * 5,
  }));
  const t0 = performance.now();
  const frame = (t: number) => {
    const k = (t - t0) / 800;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame);
    else c.remove();
  };
  requestAnimationFrame(frame);
}

function srText(g: GameDTO): string {
  const w = g.tips.filter((t) => t.isWinner);
  const winners = !w.length ? C.result.srNobody
    : C.result.srWinner(joinNames(w.map((t) => t.playerName)), w[0]!.distance != null ? distText(g, w[0]!.distance) : C.result.srRightAnswer);
  const me = ownTip(g);
  return C.result.sr(resultText(g), winners, me?.rank ? C.result.srYou(me.rank) : '');
}

export function ResultView({ game }: { game: GameDTO }) {
  const name = st.useName();
  const stats = st.useStore((s) => s.state?.stats ?? null);
  const reveal = useRef(!!name && !game.viewer.resultSeen && !shown.has(game.id)).current;
  const [stage, setStage] = useState(reveal ? 0 : 3);
  const [fade] = useState(() => reveal && reducedMotion());

  useEffect(() => {
    if (!reveal) return;
    shown.add(game.id);
    const done = () => {
      void api.seen(game.id).catch(() => {});
      st.patchGame(game.id, (g) => ({ ...g, viewer: { ...g.viewer, resultSeen: true } }));
    };
    if (reducedMotion()) {
      setStage(3);
      const t = setTimeout(done, 200);
      return () => clearTimeout(t);
    }
    const ts = [
      setTimeout(() => setStage(1), 60),
      setTimeout(() => setStage(2), 560),
      setTimeout(() => {
        setStage(3);
        if (ownTip(game)?.isWinner) confetti();
      }, 1060),
      setTimeout(done, 1500),
    ];
    return () => ts.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const me = name ? stats?.players.find((p) => p.key === nameKey(name)) : undefined;
  const nobody = !game.tips.some((t) => t.isWinner);
  return (
    <div className={cx('result', fade && 'fade-in', reveal && stage < 3 && 'revealing')}
      onClick={() => stage < 3 && setStage(3)} title={reveal && stage < 3 ? C.result.skip : undefined}>
      <ResultBox game={game} counting={reveal && !fade && stage >= 1} />
      {game.answerType === 'number' ? (
        <RankedChart game={game} stage={stage} />
      ) : (
        <div className="textres">
          <h3 className="label">{C.result.all}</h3>
          <AnswerClusters game={game} scored />
          <p className="muted small">
            {nobody && game.tips.length ? C.result.nobody + ' ' : ''}
            {game.winnerMode === 'manual' ? C.result.judgedBy(game.resolvedBy ?? game.createdBy) : C.result.auto}
          </p>
        </div>
      )}
      {me?.rank != null && (
        <p className="boardlink">
          <Link to="/leaderboard">{C.result.board} <b>{C.result.place(me.rank)}</b> →</Link>
        </p>
      )}
      <p className="sr-only" aria-live="polite">{reveal && stage === 3 ? srText(game) : ''}</p>
    </div>
  );
}
