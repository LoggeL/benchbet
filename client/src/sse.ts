// Live-Verbindung (SSE, §3.4): hello → Uhr-Offset, change → gebündelter Refetch, Reconnect mit Voll-Refetch.
import type { SseChange, SseHello } from '../../shared/types.ts';
import { nameKey } from '../../shared/names.ts';
import { lastLoad, load, refetch } from './api.ts';
import { C } from './copy.ts';
import * as st from './store.ts';

let es: EventSource | null = null;
let forName: string | null | undefined;
let opened = false;
let retry: ReturnType<typeof setTimeout> | undefined;
let backoff = 3000;
let lineId = 0;

function connect(): void {
  clearTimeout(retry);
  es?.close();
  es = null;
  forName = st.get().name;
  if (typeof EventSource === 'undefined') return;
  const n = forName;
  const src = new EventSource('/api/events' + (n ? '?name=' + encodeURIComponent(n) : ''));
  es = src;
  src.onopen = () => {
    backoff = 3000;
    st.set({ live: true });
    if (opened) refetch(0);
    opened = true;
  };
  src.onerror = () => {
    if (st.get().live) st.set({ live: false });
    // CLOSED = Browser gibt auf (z. B. 503) → selbst neu verbinden
    if (src.readyState === 2) {
      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 60000);
    }
  };
  src.addEventListener('hello', (e) => {
    try {
      const d = JSON.parse((e as MessageEvent).data) as SseHello;
      st.set({ offset: Date.parse(d.serverTime) - Date.now() });
    } catch {
      /* egal */
    }
  });
  src.addEventListener('change', (e) => {
    let d: SseChange;
    try {
      d = JSON.parse((e as MessageEvent).data) as SseChange;
    } catch {
      return;
    }
    refetch();
    const me = st.get().name;
    if (d.type === 'tip.created' && d.actor && d.gameId != null && (!me || nameKey(d.actor) !== nameKey(me))) {
      st.set({ liveLine: { gameId: d.gameId, text: C.tip.liveTipped(d.actor), id: ++lineId } });
    }
  });
}

/** Startet Live-Updates, Reconnect bei Namenswechsel, Fallback bei Sichtbarkeit und Netzwechsel. */
export function startLive(): void {
  connect();
  st.subscribe(() => {
    if (st.get().name !== forName) {
      opened = false;
      connect();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastLoad > 30000) void load();
    if (!es || es.readyState === 2) connect();
  });
  addEventListener('online', () => {
    st.set({ offline: false });
    void load();
    if (!es || es.readyState === 2) connect();
  });
  addEventListener('offline', () => st.set({ offline: true, live: false }));
}
