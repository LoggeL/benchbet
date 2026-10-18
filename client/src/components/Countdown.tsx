import { countdown } from '../../../shared/format.ts';
import { now } from '../store.ts';
import { useNow } from '../util.ts';

/** „noch 2 Tage“ … „noch 4:59“ … „Tippschluss“. Takt passt sich der Restzeit an. */
export function Countdown({ at }: { at: string }) {
  const left = Date.parse(at) - now();
  useNow(left < 300_000 ? 1000 : left < 3_600_000 ? 15_000 : 60_000);
  return <span className="num">{countdown(at, now())}</span>;
}
