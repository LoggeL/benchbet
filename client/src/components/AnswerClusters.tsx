import type { GameDTO } from '../../../shared/types.ts';
import { answerClusters } from '../../../shared/scoring.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';

/** Text-Antworten gruppiert („2× Nova-2“). Mit `scored`: ✓ zählt / ✗ zählt nicht. */
export function AnswerClusters({ game, scored }: { game: GameDTO; scored?: boolean }) {
  const cl = answerClusters(game.tips);
  if (!cl.length) return null;
  if (scored) cl.sort((a, b) => Number(b.tips.some((t) => t.isWinner)) - Number(a.tips.some((t) => t.isWinner)));
  return (
    <ul className="clusters">
      {cl.map((c) => {
        const win = c.tips.some((t) => t.isWinner);
        const own = c.tips.some((t) => t.isOwn);
        return (
          <li key={c.key} className={cx('cluster', scored && (win ? 'win' : 'lose'), own && 'own')}>
            {scored && <span className="cl-mark" aria-label={win ? C.result.counts : C.result.notCounts}>{win ? '✓' : '✗'}</span>}
            <span className="cl-n num">{c.tips.length}×</span>
            <span className="cl-a">{c.answer}</span>
            <span className="cl-who">{c.tips.map((t) => t.playerName + (t.isOwn ? ` (${C.you})` : '')).join(', ')}</span>
          </li>
        );
      })}
    </ul>
  );
}
