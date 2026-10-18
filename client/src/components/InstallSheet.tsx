// iOS "add to home screen" guide (SPEC §4.6): three steps, each with an inline pictogram.
import { Sheet } from './Sheet.tsx';
import './pwa.css';

const T = {
  title: 'Put BenchBet on your home screen',
  note: 'The app starts fresh – just pick your name there once more (one tap).',
  ok: 'Got it',
} as const;

function ShareGlyph() {
  return (
    <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <path className="pg-s" d="M26 12v19 M20 18l6-6 6 6 M19 24h-3v16h20V24h-3" />
    </svg>
  );
}
function AddGlyph() {
  return (
    <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <rect className="pg-s" x="14" y="14" width="24" height="24" rx="6" />
      <path className="pg-s" d="M26 20v12 M20 26h12" />
    </svg>
  );
}
function AppGlyph() {
  return (
    <svg viewBox="0 0 52 52" aria-hidden="true" focusable="false">
      <rect className="pg-d" x="12" y="12" width="28" height="28" rx="7" />
      <rect className="pg-a" x="24" y="18" width="11" height="14" rx="2.5" />
      <path className="pg-v" d="M22 16h3.5l-6 20H16z" />
      <circle className="pg-v" cx="36" cy="36" r="2" />
    </svg>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  return (
    <Sheet open={open} onClose={onClose} title={T.title}>
      <div className="sheet-body">
        <ol className="isteps">
          <li><ShareGlyph /><span>In Safari, tap <b>Share</b>. Depending on the layout it hides behind <b>⋯</b> at the bottom right.</span></li>
          <li><AddGlyph /><span>Scroll down, pick <b>Add to Home Screen</b>, then <b>Add</b>.</span></li>
          <li><AppGlyph /><span>Open BenchBet <b>from your home screen</b> and tap <b>Push on</b> there.</span></li>
        </ol>
        <p className="note">{T.note}</p>
        <button type="button" className="btn btn-primary" data-autofocus onClick={onClose}>{T.ok}</button>
      </div>
    </Sheet>
  );
}
