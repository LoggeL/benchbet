// Einstieg: Styles, Router (inkl. Legacy-Hash-Redirect), App, Daten, Live, SW, Push.
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/motion.css';
import { createRoot } from 'react-dom/client';
import { isFromPush } from '../../shared/routes.ts';
import { load } from './api.ts';
import { ensureHomeBelow, navigate } from './router.ts';
import { startLive } from './sse.ts';
import { App } from './App.tsx';
import { initPush } from './push.ts';
import { registerSW } from './pwa.ts';

// Start über Push ohne Vorgeschichte: „/“ darunterlegen, damit Zurück in der App bleibt.
if (isFromPush(location.search)) ensureHomeBelow();

// Klick auf Notification bei offenem Fenster: SW schickt NAVIGATE.
navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
  const d = e.data as { type?: string; url?: string } | null;
  if (d?.type === 'NAVIGATE' && typeof d.url === 'string' && d.url.startsWith('/')) {
    if (history.length <= 1) ensureHomeBelow();
    navigate(d.url);
  }
});

createRoot(document.getElementById('root')!).render(<App />);
void load();
startLive();
registerSW();
initPush();
