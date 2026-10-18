import { missingCount } from '../../../shared/inbox.ts';
import { C } from '../copy.ts';
import { usePath } from '../router.ts';
import * as st from '../store.ts';
import { cx, ph } from '../util.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Link } from './Link.tsx';

function useCounts(): { missing: number; unseen: boolean } {
  const games = st.useGames();
  const meKey = st.useMeKey();
  st.useTick();
  if (!games || !meKey) return { missing: 0, unseen: false };
  const t = st.now();
  return {
    missing: missingCount(games, meKey, t),
    unseen: games.some((g) => ph(g) === 'resolved' && !g.viewer.resultSeen),
  };
}

const ITEMS: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/', label: C.nav.open, icon: 'inbox', match: (p) => p === '/' || p.startsWith('/bet') },
  { to: '/results', label: C.nav.results, icon: 'trophy', match: (p) => p.startsWith('/results') },
  { to: '/leaderboard', label: C.nav.board, icon: 'podium', match: (p) => p.startsWith('/leaderboard') },
];

/** Bottom-Bar (Handy) bzw. Segmentleiste in der Kopfzeile (Desktop ≥ 900 px). */
export function BottomBar({ variant }: { variant: 'bottom' | 'top' }) {
  const path = usePath();
  const { missing, unseen } = useCounts();
  const item = (i: (typeof ITEMS)[number]) => {
    const on = i.match(path);
    return (
      <Link key={i.to} to={i.to} className={cx('tab', on && 'on')} aria-current={on ? 'page' : undefined}>
        <span className="tab-ic">
          <Icon n={i.icon} size={22} />
          {i.to === '/' && missing > 0 && <b className="badge-n num" aria-label={C.status.missing(missing)}>{missing}</b>}
          {i.to === '/results' && unseen && <i className="badge-dot" aria-label={C.nav.newResults} />}
        </span>
        <span className="tab-l">{i.label}</span>
      </Link>
    );
  };
  return (
    <nav className={variant === 'bottom' ? 'bbar' : 'tnav'} aria-label={C.nav.main}>
      {item(ITEMS[0]!)}
      {item(ITEMS[1]!)}
      {variant === 'bottom' && (
        <Link to="/new" className={cx('fab', path === '/new' && 'on')} aria-label={C.nav.create} aria-current={path === '/new' ? 'page' : undefined}>
          <Icon n="plus" size={28} />
        </Link>
      )}
      {item(ITEMS[2]!)}
    </nav>
  );
}
