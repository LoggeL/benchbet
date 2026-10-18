import { C } from '../copy.ts';

/** Erstladen ohne Cache: 3 Zeilen-Skelette. */
export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skel" aria-busy="true" aria-label={C.loading}>
      <i className="skel-line short" />
      {Array.from({ length: rows }, (_, i) => <i key={i} className="skel-card" />)}
    </div>
  );
}
