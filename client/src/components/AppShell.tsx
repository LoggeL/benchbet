// Shell: Skip-Link, Kopfzeile (Wortmarke, Live-Punkt, Namens-Chip), Banner, Inhalt, Bottom-Bar, Toast.
import { useState, type ReactNode } from 'react';
import { C } from '../copy.ts';
import * as st from '../store.ts';
import { useInstall } from '../pwa.ts';
import { BannerZone } from './Banner.tsx';
import { BottomBar } from './BottomBar.tsx';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';
import { LiveDot } from './LiveDot.tsx';
import { NameChip } from './NameChip.tsx';
import { NamePicker } from './NamePicker.tsx';
import { PushCard } from './PushCard.tsx';
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

/** Erststart der installierten iOS-App ohne Namen: Vollbild „Welcome to the app! Who are you?“ → danach PushCard. */
function IosWelcome() {
  const inst = useInstall();
  const name = st.useName();
  const [active] = useState(() => inst.isIOS && inst.isStandalone && !st.getName());
  const [done, setDone] = useState(false);
  if (!active || done) return null;
  const step = name ? 'push' : 'name';
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="w-t">
      <div className="welcome-in">
        <span className="brand big"><WordmarkSvg /></span>
        {step === 'name' ? (
          <>
            <h1 id="w-t" className="h1">{C.iosWelcome}</h1>
            <NamePicker />
          </>
        ) : (
          <>
            <h1 id="w-t" className="h1">{name}</h1>
            <PushCard variant="iosInstalled" />
            <button type="button" className="btn btn-primary" onClick={() => setDone(true)}>{C.iosGo}</button>
          </>
        )}
      </div>
    </div>
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
      <IosWelcome />
    </>
  );
}
