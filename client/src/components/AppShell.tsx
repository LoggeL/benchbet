// Shell: Skip-Link, Kopfzeile (Wortmarke, Live-Punkt, Namens-Chip), Banner, Inhalt, Bottom-Bar, Toast.
import { type ReactNode } from 'react';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { BannerZone } from './Banner.tsx';
import { BottomBar } from './BottomBar.tsx';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';
import { LiveDot } from './LiveDot.tsx';
import { NameChip } from './NameChip.tsx';
import { NamePicker } from './NamePicker.tsx';
import { Onboarding } from './Onboarding.tsx';
import { Sheet } from './Sheet.tsx';
import { Toast } from './Toast.tsx';
import { WordmarkSvg } from './Wordmark.tsx';

function Wordmark() {
  return (
    <Link to="/" className="brand" aria-label={C.brand}>
      <WordmarkSvg />
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const fullscreen = st.useStore((s) => s.fullscreen);
  const picker = st.useStore((s) => s.namePicker);
  return (
    <>
      <a className="skip" href="#main">{C.skip}</a>
      <header className="hdr">
        <div className="hdr-in">
          <Wordmark />
          <BottomBar variant="top" />
          <span className="hdr-r">
            <Link to="/new" className="btn btn-primary btn-small hdr-new"><Icon n="plus" size={18} />{C.nav.createLong}</Link>
            <LiveDot />
            <NameChip />
          </span>
        </div>
      </header>
      <BannerZone />
      <main id="main" tabIndex={-1} className={fullscreen ? 'main fs' : 'main'}>{children}</main>
      {!fullscreen && <BottomBar variant="bottom" />}
      <Toast />
      <Sheet open={picker} onClose={() => st.set({ namePicker: false })} title={C.name.sheetTitle}>
        <div className="sheet-body">
          <NamePicker onDone={() => st.set({ namePicker: false })} />
        </div>
      </Sheet>
      <Onboarding />
    </>
  );
}
