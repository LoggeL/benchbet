import type { GameDTO } from '../../../shared/types.ts';
import { ruleSummary } from '../../../shared/format.ts';

/** Regel-Kurzfassung: „Nächster dran gewinnt · 0–100 Punkte · Schritte 0,1“ (umbricht nur zwischen den Teilen). */
export function RuleSummary({ game }: { game: GameDTO }) {
  const parts = (game.ruleSummary || ruleSummary(game)).split(' · ');
  return (
    <p className="rule num">
      {parts.map((s, i) => (
        <span key={i}>
          {i > 0 && '\u00a0· '}
          <span className={s.length <= 32 ? 'rule-part' : undefined}>{s}</span>
        </span>
      ))}
    </p>
  );
}
