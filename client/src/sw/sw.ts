// BenchBet service worker (SPEC §4.3, §5.5). Classic script without imports; built as IIFE by client/vite.sw.config.ts.
// __SW_VERSION__ and __PRECACHE__ are injected at build time from the main build's Vite manifest.
export {};

declare const self: ServiceWorkerGlobalScope;
declare const __SW_VERSION__: string;
declare const __PRECACHE__: string[];

const SHELL = `benchbet-shell-${__SW_VERSION__}`;
const API = 'benchbet-api';
/** Small key/value store shared with the page (last push endpoint for pushsubscriptionchange). */
const META = 'benchbet-meta';
const ENDPOINT_KEY = '/__benchbet/push-endpoint';
const API_TIMEOUT_MS = 4000;
const PRECACHE = new Set(__PRECACHE__);
const HAS_EXT = /\/[^/]*\.[A-Za-z0-9]+$/;
/** App pages whose last segment may contain a dot (player names like "Max.B"); copy of shared/routes.ts APP_PATH_WITH_DOT. */
const APP_PATH_WITH_DOT = /^\/(?:bet|leaderboard|spiel|rangliste)\/[^/]+(?:\/[^/]*)?\/?$/;

type BadgeNavigator = WorkerNavigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
type NotifOptions = NotificationOptions & { renotify?: boolean; actions?: { action: string; title: string }[]; timestamp?: number };
type PushData = {
  v?: number; kind?: string; gameId?: number | null; title?: string; body?: string; url?: string; tag?: string;
  renotify?: boolean; badge?: number; actions?: { action: string; title: string }[];
};
type SubChangeEvent = ExtendableEvent & { oldSubscription?: PushSubscription | null; newSubscription?: PushSubscription | null };

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

self.addEventListener('install', (e) => {
  // No skipWaiting here: an update waits until the user taps "Reload" (SKIP_WAITING message).
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll([...PRECACHE].map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) {
        if ((k.startsWith('benchbet-shell-') && k !== SHELL) || k.startsWith('tipplab-')) await caches.delete(k);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (e) => {
  const d = e.data as { type?: string; gameId?: number; count?: number } | null;
  if (!d || typeof d.type !== 'string') return;
  if (d.type === 'SKIP_WAITING') void self.skipWaiting();
  else if (d.type === 'CLOSE_GAME_NOTIFICATIONS' && typeof d.gameId === 'number') {
    e.waitUntil(self.registration.getNotifications({ tag: `game-${d.gameId}` }).then((ns) => ns.forEach((n) => n.close())));
  } else if (d.type === 'SET_BADGE') e.waitUntil(setBadge(typeof d.count === 'number' ? d.count : 0));
});

function setBadge(n: number): Promise<void> {
  const nav = self.navigator as BadgeNavigator;
  try {
    return (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.())?.catch(() => {}) ?? Promise.resolve();
  } catch {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    if (p === '/api/state' || /^\/api\/games\/\d+(\/|$)/.test(p)) e.respondWith(apiNetworkFirst(req));
    // /api/events, /api/admin/*, /api/push/* and everything else: straight to the network, never cached
    return;
  }
  if (p === '/healthz' || p === '/sw.js') return;
  if (req.mode === 'navigate' && (!HAS_EXT.test(p) || APP_PATH_WITH_DOT.test(p))) {
    e.respondWith(shellFirst(req));
    return;
  }
  if (p.startsWith('/assets/') || p.startsWith('/icons/') || PRECACHE.has(p)) {
    e.respondWith(cacheFirst(req, p.startsWith('/assets/') || p.startsWith('/icons/')));
    return;
  }
  e.respondWith(networkFirst(req));
});

/** Navigations: the versioned shell from the cache (instant + offline), network as fallback. */
async function shellFirst(req: Request): Promise<Response> {
  const cache = await caches.open(SHELL);
  const hit = (await cache.match('/index.html')) ?? (await cache.match('/'));
  if (hit) return hit;
  try {
    return await fetch(req);
  } catch {
    return offlinePage();
  }
}

async function cacheFirst(req: Request, store: boolean): Promise<Response> {
  const hit = await caches.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (store && res.ok) {
    const copy = res.clone();
    void caches.open(SHELL).then((c) => c.put(req, copy));
  }
  return res;
}

async function networkFirst(req: Request): Promise<Response> {
  try {
    return await fetch(req);
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}

/** /api/state and /api/games/:id: network with a 4 s timeout, last good answer as offline fallback. */
async function apiNetworkFirst(req: Request): Promise<Response> {
  const cache = await caches.open(API);
  try {
    const res = await withTimeout(fetch(req), API_TIMEOUT_MS);
    if (!res.ok || res.status !== 200) return res;
    const fetchedAt = new Date().toISOString();
    const body = await res.arrayBuffer();
    const headers = new Headers(res.headers);
    headers.set('X-SW-Fetched-At', fetchedAt);
    const init = { status: res.status, statusText: res.statusText, headers };
    await cache.put(req.url, new Response(body.slice(0), init)).catch(() => {});
    return new Response(body, init);
  } catch {
    const hit = await cache.match(req.url);
    if (!hit) return Response.error();
    const headers = new Headers(hit.headers);
    headers.set('X-SW-Cache', '1');
    if (!headers.has('X-SW-Fetched-At')) headers.set('X-SW-Fetched-At', new Date(0).toISOString());
    return new Response(await hit.arrayBuffer(), { status: hit.status, statusText: hit.statusText, headers });
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e: unknown) => (clearTimeout(t), reject(e)),
    );
  });
}

function offlinePage(): Response {
  const html =
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>BenchBet – offline</title><body style="font:16px system-ui;background:#101211;color:#f3f5ee;display:grid;place-items:center;min-height:90vh;margin:0;text-align:center;padding:16px">' +
    '<div><p style="font-weight:800;font-size:22px;margin:0 0 8px">You’re offline.</p><p style="margin:0;color:#adb5a8">BenchBet needs one online visit first. Try again when you’re back.</p></div>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------------------------------------------------------------------------
// Push (§5.5)
// ---------------------------------------------------------------------------

function readPush(e: PushEvent): PushData {
  try {
    const d = e.data?.json() as PushData | undefined;
    if (d && typeof d === 'object' && typeof d.title === 'string') return d;
  } catch {
    const text = e.data?.text();
    if (text) return { title: 'BenchBet', body: text, url: '/', tag: 'misc' };
  }
  return { title: 'BenchBet', body: '', url: '/', tag: 'misc' };
}

self.addEventListener('push', (e) => {
  const d = readPush(e);
  const tag = d.tag || 'misc';
  const opts: NotifOptions = {
    body: d.body ?? '',
    tag,
    renotify: !!d.renotify,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: d.url || '/', gameId: d.gameId ?? null, kind: d.kind ?? null },
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    lang: 'en',
    timestamp: Date.now(),
  };
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(d.title || 'BenchBet', opts),
      typeof d.badge === 'number' ? setBadge(d.badge) : null,
    ]),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = (e.notification.data ?? {}) as { url?: string; gameId?: number | null };
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  const target = e.action === 'resolve' && data.gameId ? `/bet/${data.gameId}/resolve?from=push` : url;
  e.waitUntil(
    (async () => {
      const wins = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      const win = wins.find((w) => w.focused) ?? wins.find((w) => w.visibilityState === 'visible') ?? wins[0];
      if (win) {
        try {
          await win.focus();
        } catch {
          /* focus not allowed – navigation still works */
        }
        win.postMessage({ type: 'NAVIGATE', url: target });
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener('pushsubscriptionchange', (ev) => {
  const e = ev as unknown as SubChangeEvent;
  e.waitUntil(
    (async () => {
      const meta = await caches.open(META);
      const stored = await meta.match(ENDPOINT_KEY).then((r) => r?.text() ?? null).catch(() => null);
      const oldEndpoint = e.oldSubscription?.endpoint ?? stored;
      if (!oldEndpoint) return;
      let sub = e.newSubscription ?? null;
      if (!sub) {
        const cfg = (await (await fetch('/api/push/config', { cache: 'no-store' })).json()) as { publicKey: string };
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(cfg.publicKey) });
      }
      const res = await fetch('/api/push/resubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldEndpoint, subscription: sub.toJSON() }),
      });
      if (res.ok) await meta.put(ENDPOINT_KEY, new Response(sub.endpoint));
    })().catch(() => {}),
  );
});

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
