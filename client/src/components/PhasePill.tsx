import type { GameDTO } from '../../../shared/types.ts';
import { closingSoon } from '../../../shared/phase.ts';
import { C } from '../copy.ts';
import { now } from '../store.ts';
import { ph } from '../util.ts';
import { Countdown } from './Countdown.tsx';

/** Phase der Wette (Signal 1 von 2). „Endet bald“ amber mit Countdown. */
export function PhasePill({ game, countdown }: { game: GameDTO; countdown?: boolean }) {
  const p = ph(game);
  const soon = closingSoon(game, now());
  const cls = soon ? 'soon' : p;
  return (
    <span className={`pill pill-${cls}`}>
      <i className="pill-dot" aria-hidden="true" />
      {soon ? C.phase.soon : C.phase[p]}
      {soon && countdown && game.closesAt && <> · <Countdown at={game.closesAt} /></>}
    </span>
  );
}
