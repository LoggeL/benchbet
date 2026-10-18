// How it works: Regeln, Ablauf, Wertung, Name, Push & iPhone (§1.4.10).
import { useState } from 'react';
import { InstallSheet } from '../components/InstallSheet.tsx';
import { Link } from '../components/Link.tsx';

const STEPS = [['Open', 'Everyone guesses, values stay hidden.'], ['Closed', 'Deadline hit, no more guesses.'],
  ['Resolved', 'Result is in, all guesses revealed.'], ['Archive', 'After 7 days the bet moves to the archive.']] as const;

export function HowItWorks() {
  const [sheet, setSheet] = useState(false);
  return (
    <article className="howto prose">
      <h1 className="h1 page-title">How it works</h1>

      <h2>The three rules</h2>
      <ol className="rules3">
        <li><b>One guess per person per bet.</b> It locks in after 5 seconds – until then you can take it back.</li>
        <li><b>Guess first, then you see everyone else’s.</b> You can see who’s in – only the values stay hidden.</li>
        <li><b>Closest wins. Ties are shared.</b></li>
      </ol>

      <h2>Life of a bet</h2>
      <ol className="flow">
        {STEPS.map(([t, d], i) => (
          <li key={t}><span className={`pill pill-${['open', 'closed', 'resolved', 'archived'][i]}`}><i className="pill-dot" />{t}</span> {d}</li>
        ))}
      </ol>
      <p>Whoever created the bet closes it (or the deadline does it automatically) and enters the result. Until it’s resolved, everything can be corrected, reopened or extended – and it all shows up in the activity log.</p>

      <h2>Scoring</h2>
      <ul>
        <li><b>Number:</b> The smallest absolute miss wins. Equally close = multiple winners.</li>
        <li><b>Multiple values:</b> Misses are added up, the smallest sum wins.</li>
        <li><b>Text:</b> Whoever created the bet decides which spellings count when resolving.</li>
        <li><b>Leaderboard:</b> Wins first, then win rate (wins divided by scored guesses). Ties share a spot.</li>
      </ul>

      <h2>Your name</h2>
      <p>There’s no login. Your name is your key – same name means same person, on any device. Names are public so everyone can see who’s already in.</p>
      <p>Every action lands in the bet’s public activity log, tagged with a device ID. Deleted bets sit in the trash for 30 days.</p>
      <p className="callout">Sure, you could pretend to be someone else. It shows up in the log though – we’re friends, so don’t.</p>

      <h2>Push &amp; iPhone</h2>
      <p>Push covers new bets, results and a reminder before the deadline. Turn it on under <Link to="/me">Me</Link>.</p>
      <p>On iPhone, push only works once BenchBet is on your home screen: in Safari tap <b>Share</b>, then <b>Add to Home Screen</b>, then open the app from there.</p>
      <button type="button" className="btn btn-secondary" onClick={() => setSheet(true)}>Show me how</button>
      <p>Push blocked? Android: lock icon in the address bar → Permissions → allow notifications. iPhone app: Settings → Notifications → BenchBet → Allow Notifications. Desktop: lock icon → Site settings → Notifications.</p>
      <InstallSheet open={sheet} onClose={() => setSheet(false)} />
    </article>
  );
}
