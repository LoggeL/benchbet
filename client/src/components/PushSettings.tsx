// Push settings for this device in Me (SPEC §1.4.9, §5.3, §5.6).
import { useState } from 'react';
import { DEFAULT_PUSH_PREFS, type PushPrefs } from '../../../shared/types.ts';
import { usePush } from '../push.ts';
import * as st from '../store.ts';
import { InstallSheet } from './InstallSheet.tsx';
import './pwa.css';

const T = {
  unsupported: 'Push doesn’t work here (browser too old). Everything else still does.',
  'ios-needs-install': 'On iPhone, push only works in the app from your home screen.',
  'no-name': 'Pick your name first, then we can ping you.',
  off: 'Push is off.',
  on: 'Push is on for this device ✓',
  blocked: 'Push is blocked in your browser. Here’s how to unblock it:',
  enable: 'Push on',
  master: 'Push on this device',
  test: 'Send test push',
  how: 'Show me how',
  pickName: 'Pick your name',
  newGame: 'New bet',
  result: 'Result is in (incl. corrections)',
  reminder: 'Reminder before the deadline if you haven’t guessed yet',
  howEarly: 'How early',
  creator: 'My bets (deadline hit, result due)',
} as const;

const BLOCKED_HELP = [
  ['Android Chrome', 'lock icon in the address bar → Permissions → allow notifications'],
  ['iPhone app', 'Settings → Notifications → BenchBet → Allow Notifications'],
  ['Desktop', 'lock icon → Site settings → Notifications'],
] as const;

const HOURS: PushPrefs['reminderHours'][] = [1, 2, 6, 24];
const BOOLS = ['newGame', 'result', 'reminder', 'creator'] as const;

export function PushSettings(_props: Record<string, never>) {
  const p = usePush();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = (f: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
    }
  };

  if (p.status !== 'on') {
    return (
      <div className="pset">
        <p className="pset-st">{T[p.status]}</p>
        {p.status === 'off' && (
          <button type="button" className="btn btn-primary" disabled={busy} onClick={run(p.enable)}>{T.enable}</button>
        )}
        {p.status === 'blocked' && (
          <ul>{BLOCKED_HELP.map(([k, v]) => <li key={k}><b>{k}:</b> {v}</li>)}</ul>
        )}
        {p.status === 'ios-needs-install' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setSheet(true)}>{T.how}</button>
            <InstallSheet open={sheet} onClose={() => setSheet(false)} />
          </>
        )}
        {p.status === 'no-name' && (
          <button type="button" className="btn btn-secondary" onClick={() => st.set({ namePicker: true })}>{T.pickName}</button>
        )}
      </div>
    );
  }

  const prefs = p.prefs ?? DEFAULT_PUSH_PREFS;
  const loading = p.prefs == null;
  return (
    <div className="pset">
      <p className="pset-st on">{T.on}</p>
      <label className="switch">
        <input type="checkbox" role="switch" checked disabled={busy} onChange={run(p.disable)} />
        <span>{T.master}</span>
      </label>
      <div className="pset-l">
        {BOOLS.map((k) => (
          <div key={k}>
            <label className="switch">
              <input type="checkbox" role="switch" checked={prefs[k]} disabled={loading} onChange={(e) => void p.setPrefs({ [k]: e.target.checked })} />
              <span>{T[k]}</span>
            </label>
            {k === 'reminder' && prefs.reminder && (
              <div className="pset-h">
                <div className="seg-ctl" role="radiogroup" aria-label={T.howEarly}>
                  {HOURS.map((h) => (
                    <button key={h} type="button" role="radio" aria-checked={prefs.reminderHours === h} disabled={loading}
                      onClick={() => prefs.reminderHours !== h && void p.setPrefs({ reminderHours: h })}>
                      {h} h
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-small" disabled={busy} onClick={run(p.sendTest)}>{T.test}</button>
    </div>
  );
}
