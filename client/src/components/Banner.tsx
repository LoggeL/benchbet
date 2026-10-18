// Banner-Zone: höchstens ein Banner. Priorität: Offline > Ladefehler > Neue Version > Speicher blockiert > Willkommen.
import type { ReactNode } from 'react';
import { formatTime } from '../../../shared/format.ts';
import { load } from '../api.ts';
import { C } from '../copy.ts';
import { storageOk } from '../storage.ts';
import * as st from '../store.ts';
import { useUpdate } from '../pwa.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Link } from './Link.tsx';
import { UpdateBanner } from './UpdateBanner.tsx';

export function Banner({ icon, tone, children, onClose }: { icon?: IconName; tone?: 'warn' | 'err' | 'hi'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={tone ? `banner t-${tone}` : 'banner'} role={tone === 'err' ? 'alert' : 'status'}>
      {icon && <Icon n={icon} size={18} />}
      <p>{children}</p>
      {onClose && (
        <button type="button" className="icon-btn" onClick={onClose} aria-label={C.close}><Icon n="x" size={18} /></button>
      )}
    </div>
  );
}

export function BannerZone() {
  const offline = st.useOffline();
  const error = st.useStore((s) => s.error);
  const has = st.useStore((s) => s.state != null);
  const fetchedAt = st.useStore((s) => s.fetchedAt);
  const name = st.useName();
  const welcomeSeen = st.useStore((s) => s.welcomeSeen);
  const upd = useUpdate();

  let b: ReactNode = null;
  if (offline) b = <Banner icon="wifiOff" tone="warn">{C.err.offline(fetchedAt ? formatTime(fetchedAt) : '–')}</Banner>;
  else if (error && has) {
    b = (
      <Banner tone="err">
        {C.err.loadBanner(error)}{' '}
        <button type="button" className="link-btn" onClick={() => void load()}>{C.retry}</button>
      </Banner>
    );
  } else if (upd.available) b = <UpdateBanner />;
  else if (!storageOk) {
    b = (
      <Banner tone="warn">
        {C.err.storage} <button type="button" className="link-btn" onClick={() => location.reload()}>{C.reload}</button>
      </Banner>
    );
  } else if (!name && !welcomeSeen) {
    b = (
      <Banner tone="hi" onClose={st.dismissWelcome}>
        <b>{C.err.welcome}</b>{C.err.welcomeText} <Link to="/how-it-works" className="link-btn">{C.me.howto}</Link>
      </Banner>
    );
  }
  return b ? <div className="banners">{b}</div> : null;
}
