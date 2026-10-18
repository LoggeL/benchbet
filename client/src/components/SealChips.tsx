import type { CSSProperties } from 'react';
import type { GameDTO } from '../../../shared/types.ts';
import { C } from '../copy.ts';
import { cx, valueText } from '../util.ts';
import { Icon } from './Icon.tsx';

/**
 * Siegel-Chips: verdeckt „🔒 Name“, aufgedeckt „Name · Wert“.
 * `flip` = Aufklapp-Animation (Stagger 120 ms, Flip 250 ms), sonst sofort Endzustand.
 */
export function SealChips({ game, revealed, flip }: { game: GameDTO; revealed: boolean; flip?: boolean }) {
  const tips = game.tips;
  if (!tips.length) return null;
  return (
    <ul className={cx('seals', revealed && 'open', revealed && flip && 'flip')} aria-label={revealed ? undefined : C.sealed(tips.length)}>
      {tips.map((t, i) => {
        const v = revealed && t.values != null ? valueText(game, t.values) : null;
        return (
          <li key={t.id} className={cx('seal', t.isOwn && 'own')} style={{ '--i': i } as CSSProperties}
            aria-label={v ? C.sealOpenAria(t.playerName, v) : t.isOwn ? `${t.playerName} (${C.you})` : C.sealAria(t.playerName)}>
            <span className="seal-in" aria-hidden="true">
              <span className="seal-f">
                {t.isOwn && !revealed ? <Icon n="check" size={14} /> : <Icon n="lock" size={14} />}
                {t.playerName}
                {t.isOwn && !revealed && <em> ({C.you})</em>}
                {t.isNew && <em className="new">{C.results.unseen}</em>}
              </span>
              {revealed && (
                <span className="seal-b">
                  {t.playerName}
                  {t.isOwn && <em> ({C.you})</em>}
                  <b className="num">{v ?? '🔒'}</b>
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
