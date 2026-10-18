import type { GameDTO } from '../../../shared/types.ts';
import { formatDuration } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { now } from '../store.ts';

/** Statuszeile über der Inbox (aria-live). */
export function StatusLine({ named, missing, closedMine }: { named: boolean; missing: GameDTO[]; closedMine: number }) {
  let text: string;
  if (!named) text = C.status.noName;
  else if (missing.length) {
    const t = now();
    const soon = missing.map((g) => (g.closesAt ? Date.parse(g.closesAt) - t : Infinity)).filter((d) => d > 0 && d < 7_200_000);
    text = C.status.missing(missing.length) + (soon.length ? C.status.soon(formatDuration(Math.min(...soon))) : '');
  } else text = C.status.allDone;
  if (named && closedMine > 0) text += C.status.pending(closedMine);
  return <p className="status" aria-live="polite">{text}</p>;
}
