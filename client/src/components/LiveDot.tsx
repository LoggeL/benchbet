import { C } from '../copy.ts';
import { useStore } from '../store.ts';

/** 8-px-Punkt: grün = SSE verbunden, grau = getrennt. */
export function LiveDot() {
  const live = useStore((s) => s.live);
  const label = live ? C.live : C.noLive;
  return <span className={live ? 'live on' : 'live'} title={label} role="img" aria-label={label} />;
}
