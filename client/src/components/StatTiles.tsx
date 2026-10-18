import type { PlayerStats } from '../../../shared/types.ts';
import { formatPercent } from '../../../shared/format.ts';
import { C } from '../copy.ts';

/** Vier Kacheln mit den Original-Untertiteln (2×2 unter 360 px). */
export function StatTiles({ p }: { p: PlayerStats }) {
  const tiles: [string, string, string][] = [
    [String(p.tips), C.board.tiles.tips, C.board.sub.tips(p.settled)],
    [String(p.wins), C.board.tiles.wins, C.board.sub.wins],
    [String(p.exact), C.board.tiles.exact, C.board.sub.exact],
    [formatPercent(p.winRate), C.board.tiles.rate, C.board.sub.rate],
  ];
  return (
    <dl className="tiles">
      {tiles.map(([v, l, s]) => (
        <div key={l} className="tile">
          <dt className="tile-l">{l}</dt>
          <dd className="tile-v num">{v}</dd>
          <dd className="tile-s">{s}</dd>
        </div>
      ))}
    </dl>
  );
}
