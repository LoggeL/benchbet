import type { CSSProperties } from 'react';
import { initials } from '../../../shared/names.ts';
import { usePlayers } from '../store.ts';
import { colorOf } from '../util.ts';

/** Kreis mit Initialen in Spielerfarbe. Farbe steht nie allein. */
export function Avatar({ name, size = 's' }: { name: string; size?: 'xs' | 's' | 'm' | 'l' }) {
  const players = usePlayers();
  const style = { '--pc': `var(--p${colorOf(players, name)})` } as CSSProperties;
  return (
    <span className={`av av-${size}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
