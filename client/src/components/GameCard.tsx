import type { GameDTO } from '../../../shared/types.ts';
import { topicLabel } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { cx } from '../util.ts';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';
import { PhasePill } from './PhasePill.tsx';

/** Große Karte für „Dein Tipp fehlt“ – die ganze Karte ist der Link. */
export function GameCard({ game, cta, fresh }: { game: GameDTO; cta: string; fresh?: boolean }) {
  const n = game.tipCount;
  return (
    <Link to={`/bet/${game.id}`} className={cx('card gcard', fresh && 'fresh')}>
      <span className="gcard-top">
        <PhasePill game={game} countdown />
        <span className="topic">{topicLabel(game)}</span>
      </span>
      <span className="gcard-title">{game.prompt}</span>
      <span className="gcard-foot">
        <span className="seals-mini" aria-hidden="true">
          {Array.from({ length: Math.min(n, 5) }, (_, i) => <Icon key={i} n="lock" size={14} />)}
        </span>
        <span className="muted">{n ? C.hiddenTips(n) : C.noTipsYet.split('.')[0]}</span>
        <span className="cta">{cta}<Icon n="right" size={16} /></span>
      </span>
    </Link>
  );
}
