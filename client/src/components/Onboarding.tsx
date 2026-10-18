// Start dialog: name first, then push – asked right on start. The push step only exists where it can work
// (permission prompt straight from the tap; iPhone Safari gets the home-screen how-to instead).
import { useEffect, useState } from 'react';
import { getPushStatus, usePush } from '../push.ts';
import { lsGet, lsSet, ssGet, ssSet } from '../storage.ts';
import * as st from '../store.ts';
import { Icon } from './Icon.tsx';
import { InstallSheet } from './InstallSheet.tsx';
import { NamePicker } from './NamePicker.tsx';
import { snoozePushCards } from './PushCard.tsx';
import { WordmarkSvg } from './Wordmark.tsx';
import './pwa.css';

const T = {
  welcome: 'Welcome to BenchBet',
  intro: 'Bet with your friends on AI models, benchmarks and the next big release. Who are you?',
  look: 'Just look around',
  hi: (n: string) => `Hi ${n}!`,
  pushText: 'Get a ping when a new bet drops, a result is in or a deadline is close.',
  pushOn: 'Turn on push',
  pushBusy: 'Asking your browser …',
  notNow: 'Not now',
  meHint: 'You can change this anytime under Me.',
  iosText: 'On iPhone, push only works once BenchBet is on your home screen. Add it, open it from there, and you’re set.',
  iosHow: 'Show me how',
  iosLater: 'Continue in the browser',
} as const;

/** Push step finished (on, skipped or impossible) – don't ask again on start. */
const DONE_KEY = 'benchbet.onboarded';
/** "Just look around" without a name: quiet for this session only. */
const SKIP_KEY = 'benchbet.onboardSkip';

const ASKABLE = new Set(['off', 'ios-needs-install', 'no-name']);

function needed(): boolean {
  if (ssGet(SKIP_KEY)) return false;
  if (!st.getName()) return true;
  return lsGet(DONE_KEY) !== '1' && ASKABLE.has(getPushStatus());
}

export function Onboarding() {
  const name = st.useName();
  const push = usePush();
  const [open, setOpen] = useState(needed);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const step = name ? 'push' : 'name';

  const finish = () => {
    lsSet(DONE_KEY, '1');
    setOpen(false);
  };
  // Push is on, blocked or not supported here: nothing left to ask
  useEffect(() => {
    if (open && step === 'push' && !ASKABLE.has(push.status)) finish();
  }, [open, step, push.status]);

  if (!open) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await push.enable();
    } finally {
      setBusy(false);
    }
  };
  const notNow = () => {
    snoozePushCards(); // no second ask right after the first guess
    finish();
  };

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="ob-t">
      <div className="welcome-in">
        <span className="brand big"><WordmarkSvg /></span>
        {step === 'name' ? (
          <>
            <h1 id="ob-t" className="h1">{T.welcome}</h1>
            <p className="ob-p">{T.intro}</p>
            <NamePicker />
            <button type="button" className="link-btn ob-skip" onClick={() => { ssSet(SKIP_KEY, '1'); setOpen(false); }}>{T.look}</button>
          </>
        ) : push.status === 'ios-needs-install' ? (
          <>
            <h1 id="ob-t" className="h1">{T.hi(name!)}</h1>
            <p className="ob-p">{T.iosText}</p>
            <button type="button" className="btn btn-primary" onClick={() => setSheet(true)}>{T.iosHow}</button>
            <button type="button" className="btn btn-ghost" onClick={notNow}>{T.iosLater}</button>
            <InstallSheet open={sheet} onClose={() => setSheet(false)} />
          </>
        ) : (
          <>
            <h1 id="ob-t" className="h1">{T.hi(name!)}</h1>
            <p className="ob-p">{T.pushText}</p>
            <button type="button" className="btn btn-primary" onClick={() => void enable()} disabled={busy} aria-busy={busy}>
              <Icon n="bell" size={20} />{busy ? T.pushBusy : T.pushOn}
            </button>
            <button type="button" className="btn btn-ghost" onClick={notNow} disabled={busy}>{T.notNow}</button>
            <p className="ob-hint">{T.meHint}</p>
          </>
        )}
      </div>
    </div>
  );
}
