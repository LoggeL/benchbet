// Wortmarke „Bench/Bet.“ als Inline-SVG: kräftige Grotesk, violetter Slash und Punkt, Lime-Marker unter „Bet“.
// textLength fixiert die Wortbreiten, damit Slash, Marker und Punkt bei jeder Systemschrift sitzen.
export function WordmarkSvg({ className }: { className?: string }) {
  return (
    <svg className={className ? `wordmark ${className}` : 'wordmark'} viewBox="0 0 132 28" aria-hidden="true" focusable="false">
      <text x="0" y="21" textLength="61" lengthAdjust="spacingAndGlyphs" className="wm-t">Bench</text>
      <path d="M71.5 3h5L68.5 25h-5z" className="wm-v" />
      <rect x="77" y="3.5" width="43" height="21.5" rx="4" className="wm-hl" />
      <text x="80" y="21" textLength="37" lengthAdjust="spacingAndGlyphs" className="wm-t wm-on">Bet</text>
      <circle cx="126.5" cy="21.5" r="3.5" className="wm-v" />
    </svg>
  );
}
