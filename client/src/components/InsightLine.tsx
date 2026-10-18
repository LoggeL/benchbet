import type { GameDTO } from '../../../shared/types.ts';
import { insightLine } from '../../../shared/insight.ts';

/** Eine Zeile Einordnung nach dem eigenen Tipp (§1.7.4). */
export function InsightLine({ game }: { game: GameDTO }) {
  const text = insightLine(game, game.tips, game.viewer.tipId);
  return text ? <p className="insight">{text}</p> : null;
}
