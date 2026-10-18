import { useEffect, useState } from 'react';
import type { ActivityEventDTO, GameDTO } from '../../../shared/types.ts';
import { formatDay, formatTime } from '../../../shared/format.ts';
import { api } from '../api.ts';
import { C } from '../copy.ts';
import { Icon } from './Icon.tsx';

/** Öffentlicher Verlauf mit Gerätekennung (§2.10), eingeklappt. */
export function ActivityLog({ game }: { game: GameDTO }) {
  const [events, setEvents] = useState<ActivityEventDTO[] | null>(null);
  const sig = [game.id, game.tipCount, game.closedAt, game.resolvedAt, game.editedAt, game.correctedAt, game.closesAt].join('|');
  useEffect(() => {
    let on = true;
    api.activity(game.id).then((r) => on && setEvents(r.events)).catch(() => {});
    return () => {
      on = false;
    };
  }, [sig]);
  return (
    <details className="disc log">
      <summary>
        {C.activity(events ? events.length : null)}
        <Icon n="chevron" size={18} className="disc-chev" />
      </summary>
      <ol className="disc-body log-list">
        {events?.length === 0 && <li className="muted">{C.activityEmpty}</li>}
        {events?.map((e) => (
          <li key={e.id}>
            <time className="num" dateTime={e.at}>{formatDay(e.at)}, {formatTime(e.at)}</time> · {e.text}
            {e.deviceTag && <span className="muted">{C.activityDevice(e.deviceTag)}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}
