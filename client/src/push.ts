// Push subscription lifecycle on this device (SPEC §5.1–5.3, §5.6).
import { useSyncExternalStore } from 'react';
import type { PushPrefs } from '../../shared/types.ts';
import { ApiError, call, errText } from './api.ts';
import { getRegistration, iosNeedsInstall, canPromptInstall, promptInstall } from './pwa.ts';
import { lsGet, lsJson, lsSet, lsSetJson } from './storage.ts';
import * as st from './store.ts';

export type PushStatus = 'unsupported' | 'ios-needs-install' | 'no-name' | 'off' | 'on' | 'blocked';

export type PushApi = {
  status: PushStatus;
  prefs: PushPrefs | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
  setPrefs(p: Partial<PushPrefs>): Promise<void>;
  sendTest(): Promise<void>;
};

export const PUSH_TEXT = {
  on: 'Push is on.',
  off: 'Push is off.',
  failed: 'Couldn’t turn on push. Try again later under Me.',
  testSent: 'Test push is on its way.',
  renewed: 'Push had gone stale on this device – reconnected. Test push is on its way.',
  installAsk: 'BenchBet as an app?',
  install: 'Install',
} as const;

const KEY_STATE = 'benchbet.push'; // 'on' | 'off'
const KEY_SYNC = 'benchbet.pushSync'; // last upsert (ms)
const KEY_PREFS = 'benchbet.pushPrefs';
const KEY_INSTALL_ASKED = 'benchbet.installAsked';
const SYNC_EVERY_MS = 24 * 3600 * 1000;
/** Same key the SW reads on pushsubscriptionchange. */
const META_CACHE = 'benchbet-meta';
const ENDPOINT_KEY = '/__benchbet/push-endpoint';

const supported =
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type PS = { subscribed: boolean; permission: NotificationPermission | 'n/a'; prefs: PushPrefs | null; name: string | null };
let ps: PS = {
  // Optimistic until sync() has checked the real subscription (avoids a flashing PushCard)
  subscribed: supported && Notification.permission === 'granted' && lsGet(KEY_STATE) === 'on',
  permission: supported ? Notification.permission : 'n/a',
  prefs: lsJson<PushPrefs | null>(KEY_PREFS, null),
  name: st.getName(),
};
let snapshot: PushApi;
const subs = new Set<() => void>();
function setPS(p: Partial<PS>): void {
  ps = { ...ps, ...p };
  if (p.prefs !== undefined) lsSetJson(KEY_PREFS, p.prefs);
  snapshot = build();
  subs.forEach((f) => f());
}

function statusOf(s: PS): PushStatus {
  if (iosNeedsInstall) return 'ios-needs-install';
  if (!supported) return 'unsupported';
  if (s.permission === 'denied') return 'blocked';
  if (!s.name) return 'no-name';
  return s.subscribed && s.permission === 'granted' ? 'on' : 'off';
}

function build(): PushApi {
  return { status: statusOf(ps), prefs: ps.prefs, enable, disable, setPrefs, sendTest };
}
snapshot = build();

export function usePush(): PushApi {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => snapshot,
    () => snapshot,
  );
}
export const getPushStatus = (): PushStatus => snapshot.status;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** SW registration; waits for the registration from pwa.ts (production only). */
async function registration(timeoutMs = 10_000): Promise<ServiceWorkerRegistration> {
  const have = getRegistration();
  if (have) return have;
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
  if (!reg) throw new Error('no service worker');
  return reg;
}

async function publicKey(): Promise<string> {
  const k = st.get().state?.config.vapidPublicKey;
  if (k) return k;
  return (await call<{ publicKey: string }>('/api/push/config')).publicKey;
}

const keyMatches = (sub: PushSubscription, key: string): boolean => {
  const k = sub.options?.applicationServerKey;
  return !k || bytesToB64url(k) === key;
};

async function rememberEndpoint(endpoint: string | null): Promise<void> {
  try {
    const c = await caches.open(META_CACHE);
    if (endpoint) await c.put(ENDPOINT_KEY, new Response(endpoint));
    else await c.delete(ENDPOINT_KEY);
  } catch {
    /* Cache Storage unavailable */
  }
}

/** Current subscription with the right VAPID key, created if needed. */
/** Current subscription (or a new one). `created` = we just subscribed (e.g. after a VAPID key switch). */
async function ensureSubscription(create: boolean): Promise<{ sub: PushSubscription | null; created: boolean }> {
  const reg = await registration();
  const key = await publicKey();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !keyMatches(sub, key)) {
    // Server switched VAPID keys: old subscription is dead, re-subscribe silently (§5.1)
    await sub.unsubscribe().catch(() => false);
    sub = null;
    create = true;
  }
  if (!sub && create) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(key) });
    return { sub, created: true };
  }
  return { sub, created: false };
}

/** Register the subscription. `silent` = automatic re-subscribe, so the server skips the "Push works." test push. */
async function upsert(sub: PushSubscription, prefs?: PushPrefs, silent = false): Promise<PushPrefs> {
  const r = await call<{ subscriptionId: number; prefs: PushPrefs }>('/api/push/subscribe', {
    method: 'POST',
    body: { subscription: sub.toJSON(), ...(prefs ? { prefs } : {}), ...(silent ? { silent: true } : {}) },
  });
  lsSet(KEY_SYNC, String(Date.now()));
  void rememberEndpoint(sub.endpoint);
  return r.prefs;
}

async function currentSub(): Promise<PushSubscription | null> {
  try {
    return await (await registration(3000)).pushManager.getSubscription();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

let busy = false;

async function enable(): Promise<void> {
  if (!supported || iosNeedsInstall || busy) return;
  if (!st.getName()) {
    st.set({ namePicker: true });
    return;
  }
  busy = true;
  try {
    // Must run straight from the tap (user gesture) – no await before this
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    setPS({ permission: perm });
    if (perm !== 'granted') return;
    const { sub } = await ensureSubscription(true);
    if (!sub) throw new Error('no subscription');
    const prefs = await upsert(sub, ps.prefs ?? undefined);
    lsSet(KEY_STATE, 'on');
    setPS({ subscribed: true, prefs });
    st.toast(PUSH_TEXT.on);
    offerInstallOnce();
  } catch (e) {
    st.toast(e instanceof ApiError && e.code !== 'NETWORK' ? errText(e) : PUSH_TEXT.failed, { error: true });
  } finally {
    busy = false;
  }
}

/** Once, after a successful opt-in: "BenchBet as an app? [Install]" (§4.5). */
function offerInstallOnce(): void {
  if (!canPromptInstall() || lsGet(KEY_INSTALL_ASKED)) return;
  lsSet(KEY_INSTALL_ASKED, '1');
  setTimeout(() => {
    if (canPromptInstall()) st.toast(PUSH_TEXT.installAsk, { action: { label: PUSH_TEXT.install, run: () => void promptInstall() }, ms: 8000 });
  }, 3500);
}

async function disable(): Promise<void> {
  if (busy) return;
  busy = true;
  lsSet(KEY_STATE, 'off');
  try {
    const sub = await currentSub();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => false);
      await call<null>('/api/push/subscription', { method: 'DELETE', body: { endpoint } }).catch(() => null);
    }
    void rememberEndpoint(null);
    setPS({ subscribed: false });
    st.toast(PUSH_TEXT.off);
  } finally {
    busy = false;
  }
}

async function setPrefs(p: Partial<PushPrefs>): Promise<void> {
  const before = ps.prefs;
  if (!before) return;
  setPS({ prefs: { ...before, ...p } }); // optimistic
  const patch = async () => {
    if (renewing) await renewing;
    const sub = await currentSub();
    if (!sub) throw new Error('no subscription');
    const r = await call<{ prefs: PushPrefs }>('/api/push/subscription', { method: 'PATCH', body: { endpoint: sub.endpoint, prefs: p } });
    setPS({ prefs: r.prefs });
  };
  try {
    try {
      await patch();
    } catch (e) {
      // Endpoint was dropped by the server: renew once, then apply the change to the fresh subscription
      if (!isGone(e) || !(await renew(await currentSub()))) throw e;
      await patch();
    }
  } catch (e) {
    setPS({ prefs: before });
    st.toast(errText(e), { error: true });
  }
}

async function sendTest(): Promise<void> {
  const sub = await currentSub();
  if (!sub) return;
  try {
    await call<{ ok: boolean }>('/api/push/test', { method: 'POST', body: { endpoint: sub.endpoint } });
    st.toast(PUSH_TEXT.testSent);
  } catch (e) {
    if (isGone(e) && (await renew(sub))) {
      st.toast(PUSH_TEXT.renewed);
      return;
    }
    st.toast(errText(e), { error: true });
  }
}

// ---------------------------------------------------------------------------
// App start
// ---------------------------------------------------------------------------

/** Re-sync on every start with permission 'granted' (§5.2 step 3). */
async function sync(): Promise<void> {
  if (!supported || iosNeedsInstall || Notification.permission !== 'granted') return;
  const wantOn = lsGet(KEY_STATE) !== 'off';
  let sub: PushSubscription | null;
  let created = false;
  try {
    ({ sub, created } = await ensureSubscription(wantOn && lsGet(KEY_STATE) === 'on'));
  } catch {
    return; // no SW (dev) or push service unreachable
  }
  if (!sub) {
    setPS({ subscribed: false });
    return;
  }
  if (!wantOn) {
    setPS({ subscribed: false });
    return;
  }
  setPS({ subscribed: true });
  if (!st.getName()) return;
  try {
    const last = Number(lsGet(KEY_SYNC) ?? 0);
    if (created) {
      // brand-new subscription (key switch): register it right away, without lookup → renew → second subscribe
      setPS({ prefs: await upsert(sub, ps.prefs ?? undefined, true) });
    } else if (Date.now() - last > SYNC_EVERY_MS) {
      setPS({ prefs: await upsert(sub) });
    } else {
      const r = await call<{ prefs: PushPrefs }>('/api/push/lookup', { method: 'POST', body: { endpoint: sub.endpoint } });
      setPS({ prefs: r.prefs });
      void rememberEndpoint(sub.endpoint);
    }
  } catch (e) {
    if (isGone(e)) await renew(sub);
  }
}

const isGone = (e: unknown): boolean => e instanceof ApiError && e.code === 'SUBSCRIPTION_NOT_FOUND';

/**
 * The server dropped this endpoint (push service answered 404/410, too many failures, VAPID switch):
 * the old subscription is dead, so get a fresh one and register it silently with the same prefs.
 */
let renewing: Promise<boolean> | null = null;
function renew(old: PushSubscription | null): Promise<boolean> {
  renewing ??= (async () => {
    try {
      await old?.unsubscribe().catch(() => false);
      const { sub } = await ensureSubscription(true);
      if (!sub) throw new Error('no subscription');
      setPS({ subscribed: true, prefs: await upsert(sub, ps.prefs ?? undefined, true) });
      return true;
    } catch {
      setPS({ subscribed: false });
      return false;
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

let started = false;
export function initPush(): void {
  if (started) return;
  started = true;

  st.onNameChange((name) => {
    setPS({ name });
    if (!name || !ps.subscribed) return;
    // Hang this device's subscription on the new name (§1.5.7)
    void currentSub().then((sub) => {
      if (sub) void call('/api/push/subscription', { method: 'PATCH', body: { endpoint: sub.endpoint } }).catch(() => {});
    });
  });

  if (!supported) return;
  try {
    void navigator.permissions
      ?.query({ name: 'notifications' })
      .then((p) => {
        p.addEventListener('change', () => {
          setPS({ permission: Notification.permission });
          if (Notification.permission === 'granted') void sync();
        });
      })
      .catch(() => {});
  } catch {
    /* permissions API missing */
  }
  void sync();
}
