// Push opt-in at the right moments, never on the first visit (SPEC §5.6). iOS Safari gets the InstallCard instead.
import { useState } from 'react';
import { usePush } from '../push.ts';
import { lsJson, lsSetJson } from '../storage.ts';
import { Icon } from './Icon.tsx';
import { InstallCard } from './InstallCard.tsx';
import './pwa.css';

export type PushCardVariant = 'afterTip' | 'afterCreate' | 'inline' | 'empty' | 'iosInstalled';

const T = {
  afterTip: 'Want a ping when a new bet drops or a result is in?',
  afterCreate: 'Want a heads-up when your deadline hits?',
  iosInstalled: 'You installed it – turn on push too?',
  inline: 'Don’t want to miss a bet?',
  empty: 'Ping me when something drops',
  on: 'Push on',
  later: 'Later',
} as const;

const LATER_KEY = 'benchbet.pushLater';
const LATER_MS = 14 * 24 * 3600 * 1000;
type Later = { until: number; count: number };

/** "Later" hides the card for 14 days; after the second "Later" it only lives in Me. */
function laterBlocked(): boolean {
  const l = lsJson<Later | null>(LATER_KEY, null);
  return !!l && (l.count >= 2 || Date.now() < l.until);
}
export function snoozePushCards(): void {
  const l = lsJson<Later | null>(LATER_KEY, null);
  lsSetJson(LATER_KEY, { until: Date.now() + LATER_MS, count: (l?.count ?? 0) + 1 });
}

export function PushCard({ variant }: { variant: PushCardVariant }) {
  const p = usePush();
  const [gone, setGone] = useState(false);
  if (gone) return null;
  const respectsLater = variant === 'afterTip' || variant === 'afterCreate' || variant === 'inline';
  if (respectsLater && laterBlocked()) return null;

  if (p.status === 'ios-needs-install') {
    return variant === 'afterTip' || variant === 'afterCreate' ? <InstallCard push /> : null;
  }
  if (p.status !== 'off') return null;
  const on = () => void p.enable();

  if (variant === 'inline') {
    return (
      <p className="pline">
        <Icon n="bell" size={18} />
        <span>{T.inline} <button type="button" className="link-btn" onClick={on}>{T.on}</button></span>
      </p>
    );
  }
  if (variant === 'empty') {
    return (
      <button type="button" className="btn btn-secondary pempty" onClick={on}>
        <Icon n="bell" size={18} /> {T.empty}
      </button>
    );
  }
  return (
    <section className="pcard" aria-label={T.on}>
      <div className="pcard-t">
        <Icon n="bell" />
        <p>{T[variant]}</p>
      </div>
      <div className="pcard-a">
        <button type="button" className="btn btn-primary" onClick={on}><Icon n="bell" size={18} />{T.on}</button>
        {variant !== 'iosInstalled' && (
          <button type="button" className="btn btn-ghost" onClick={() => { snoozePushCards(); setGone(true); }}>{T.later}</button>
        )}
      </div>
    </section>
  );
}
