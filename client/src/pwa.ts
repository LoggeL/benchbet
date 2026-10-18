// Service-worker registration, update flow and install prompt (SPEC §4.3, §4.5, §1.5.9).
import { useSyncExternalStore } from 'react';
import { lsJson, lsSetJson } from './storage.ts';
import * as st from './store.ts';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS =
  /iPad|iPhone|iPod/.test(ua) || (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone =
  (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
  (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone === true);

/** iOS/iPadOS Safari outside the home-screen app: push only works after installing (§4.5). */
export const iosNeedsInstall = isIOS && !isStandalone;

type BeforeInstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

// ---------------------------------------------------------------------------
// Tiny reactive state for this module
// ---------------------------------------------------------------------------

type P = { updateAvailable: boolean; canPrompt: boolean };
let ps: P = { updateAvailable: false, canPrompt: false };
const subs = new Set<() => void>();
function setP(p: Partial<P>): void {
  ps = { ...ps, ...p };
  subs.forEach((f) => f());
}
const sub = (f: () => void) => (subs.add(f), () => void subs.delete(f));
function usePwa<T>(sel: (p: P) => T): T {
  return useSyncExternalStore(sub, () => sel(ps), () => sel(ps));
}

let registration: ServiceWorkerRegistration | null = null;
let deferred: BeforeInstallPromptEvent | null = null;
let reloading = false;
let lastCheck = 0;
const CHECK_EVERY_MS = 30 * 60 * 1000;

/** The registration once the SW is registered (null in dev or without SW support). */
export const getRegistration = (): ServiceWorkerRegistration | null => registration;

// ---------------------------------------------------------------------------
// Registration + updates
// ---------------------------------------------------------------------------

function markWaiting(reg: ServiceWorkerRegistration): void {
  if (reg.waiting && navigator.serviceWorker.controller) setP({ updateAvailable: true });
}

function watch(reg: ServiceWorkerRegistration): void {
  markWaiting(reg);
  reg.addEventListener('updatefound', () => {
    const w = reg.installing;
    w?.addEventListener('statechange', () => {
      if (w.state === 'installed') markWaiting(reg);
    });
  });
}

function check(force = false): void {
  if (!registration) return;
  const t = Date.now();
  if (!force && t - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = t;
  void registration.update().catch(() => {});
}

/** Counts distinct visit days (for the inbox install card, §4.5). */
function recordVisit(): void {
  const day = new Date().toISOString().slice(0, 10);
  const days = lsJson<string[]>('benchbet.visitDays', []);
  if (!Array.isArray(days) || days.includes(day)) return;
  lsSetJson('benchbet.visitDays', [...days, day].slice(-5));
}
export const visitDays = (): number => {
  const d = lsJson<string[]>('benchbet.visitDays', []);
  return Array.isArray(d) ? d.length : 0;
};

export function registerSW(): void {
  recordVisit();

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    setP({ canPrompt: true });
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    setP({ canPrompt: false });
  });

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloading) return;
    reloading = false;
    location.reload();
  });

  const go = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        lastCheck = Date.now();
        watch(reg);
      })
      .catch(() => {
        /* no SW – the app still works online */
      });
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });

  // Server runs a different build → look for the new sw.js right away (once per version).
  let seen: string | null = null;
  st.subscribe(() => {
    const v = st.get().state?.version;
    if (!v || v === seen) return;
    seen = v;
    if (v !== __APP_VERSION__) check(true);
  });
}

export function useUpdate(): { available: boolean; reload(): void } {
  const available = usePwa((p) => p.updateAvailable);
  return { available, reload: applyUpdate };
}

/** "New version – reload": activate the waiting SW, reload once it controls the page. */
export function applyUpdate(): void {
  const w = registration?.waiting;
  if (!w) {
    location.reload();
    return;
  }
  reloading = true;
  w.postMessage({ type: 'SKIP_WAITING' });
  // Safety net if controllerchange never fires
  setTimeout(() => {
    if (reloading) location.reload();
  }, 4000);
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  setP({ canPrompt: false });
  try {
    await e.prompt();
    const r = await e.userChoice;
    return r.outcome === 'accepted';
  } catch {
    return false;
  }
}

export const canPromptInstall = (): boolean => ps.canPrompt;

export function useInstall(): { canPrompt: boolean; prompt(): Promise<void>; isStandalone: boolean; isIOS: boolean } {
  const canPrompt = usePwa((p) => p.canPrompt);
  return { canPrompt, prompt: async () => void (await promptInstall()), isStandalone, isIOS };
}

