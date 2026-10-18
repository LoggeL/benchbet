// Install offer (SPEC §4.5): iOS Safari → "push needs the home screen" + InstallSheet; Android/desktop → native prompt.
// Without props it is the quiet inbox card (from the 3rd visit day, ✕ hides it for 30 days).
import { useState } from 'react';
import { lsGet, lsSet } from '../storage.ts';
import { iosNeedsInstall, useInstall, visitDays } from '../pwa.ts';
import { Icon } from './Icon.tsx';
import { InstallSheet } from './InstallSheet.tsx';
import './pwa.css';

const T = {
  ios: 'On iPhone, push only works once BenchBet is on your home screen.',
  android: 'Put BenchBet on your home screen – opens like an app, pings like one too.',
  how: 'Show me how',
  install: 'Install',
  hide: 'Hide',
} as const;

const HIDE_KEY = 'benchbet.installCardHidden';
const HIDE_MS = 30 * 24 * 3600 * 1000;

export function InstallCard({ push = false }: { push?: boolean }) {
  const inst = useInstall();
  const [sheet, setSheet] = useState(false);
  const [hidden, setHidden] = useState(() => !push && Number(lsGet(HIDE_KEY) ?? 0) > Date.now());
  if (inst.isStandalone || hidden) return null;
  if (push ? !iosNeedsInstall : !(iosNeedsInstall || inst.canPrompt) || visitDays() < 3) return null;

  const hide = () => {
    lsSet(HIDE_KEY, String(Date.now() + HIDE_MS));
    setHidden(true);
  };
  return (
    <section className={push ? 'pcard' : 'pcard ic-card'} aria-label={T.install}>
      <div className="pcard-t">
        <Icon n={iosNeedsInstall ? 'bell' : 'download'} />
        <p>{iosNeedsInstall ? T.ios : T.android}</p>
        {!push && (
          <button type="button" className="icon-btn sm x" onClick={hide} aria-label={T.hide}><Icon n="x" size={18} /></button>
        )}
      </div>
      <div className="pcard-a">
        {iosNeedsInstall ? (
          <button type="button" className="btn btn-secondary" onClick={() => setSheet(true)}>{T.how}</button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={() => void inst.prompt()}><Icon n="download" size={18} />{T.install}</button>
        )}
      </div>
      {iosNeedsInstall && <InstallSheet open={sheet} onClose={() => setSheet(false)} />}
    </section>
  );
}
