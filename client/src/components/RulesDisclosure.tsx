import type { GameDTO } from '../../../shared/types.ts';
import { formatDate, formatDay, ruleSentence } from '../../../shared/format.ts';
import { C } from '../copy.ts';
import { safeHref } from '../util.ts';
import { Icon } from './Icon.tsx';

/** „Regeln & Quelle ⌄“ – eingeklappt, natives <details>. */
export function RulesDisclosure({ game: g }: { game: GameDTO }) {
  return (
    <details className="disc">
      <summary>
        {C.rules.toggle}
        <Icon n="chevron" size={18} className="disc-chev" />
      </summary>
      <div className="disc-body">
        <p className="pre">{g.description || C.rules.fallback}</p>
        <p>{ruleSentence(g)}</p>
        {safeHref(g.infoUrl) && (
          <p>
            <a href={safeHref(g.infoUrl)!} target="_blank" rel="noopener noreferrer" className="ext ext-hit">{C.rules.source}</a>
          </p>
        )}
        <p className="muted small">
          {C.rules.meta(g.createdBy, formatDay(g.createdAt, { year: 'always' }))}
          {g.editedAt && C.rules.edited(formatDate(g.editedAt))}
        </p>
      </div>
    </details>
  );
}
