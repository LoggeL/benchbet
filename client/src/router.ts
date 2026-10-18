// Mini-Router (History API). Zurück/Wischgeste funktionieren, Scrollposition pro Route in sessionStorage.
import { useSyncExternalStore } from 'react';
import { legacyRedirect } from '../../shared/routes.ts';
import { ssJson, ssSet } from './storage.ts';

type Guard = (to: string) => boolean;

// Legacy-Deep-Links: /#spiel-1059 → /bet/1059, alte deutsche Pfade (/spiel/:id, /rangliste, …) → englische.
// Vor allem anderen, damit `path` stimmt (der Server leitet auch um; das hier greift z. B. beim SW-Fallback).
const legacy = legacyRedirect(location.pathname, location.search, location.hash);
if (legacy) history.replaceState(history.state, '', legacy);

const subs = new Set<() => void>();
let path = location.pathname;
let idx: number = typeof history.state?.idx === 'number' ? history.state.idx : 0;
let popped = false;
let guard: Guard | null = null;
const scrolls: Record<string, number> = ssJson('benchbet.scroll', {});

if (typeof history.state?.idx !== 'number') history.replaceState({ ...history.state, idx }, '');
try {
  history.scrollRestoration = 'manual';
} catch {
  /* alt */
}

function emit(): void {
  subs.forEach((f) => f());
}
function remember(): void {
  scrolls[path] = Math.round(window.scrollY);
  ssSet('benchbet.scroll', JSON.stringify(scrolls));
}

addEventListener('popstate', (e) => {
  remember();
  path = location.pathname;
  idx = typeof e.state?.idx === 'number' ? e.state.idx : 0;
  popped = true;
  emit();
});

/** In-App-Navigation. `force` umgeht den Guard (z. B. „Entwurf behalten?“). */
export function navigate(to: string, o: { replace?: boolean; force?: boolean } = {}): void {
  if (!o.force && guard && !guard(to)) return;
  const cur = location.pathname + location.search;
  if (to === cur) return;
  remember();
  if (o.replace) history.replaceState({ idx }, '', to);
  else history.pushState({ idx: ++idx }, '', to);
  path = location.pathname;
  popped = false;
  emit();
}

/** Zurück in der App, ohne Vorgeschichte auf `fallback`. */
export function back(fallback = '/'): void {
  if (idx > 0) history.back();
  else navigate(fallback, { replace: true });
}

/** Guard für In-App-Navigation; liefert false = Navigation blockiert (Guard kümmert sich selbst). */
export function setGuard(g: Guard | null): void {
  guard = g;
}

/** Legt `/` unter die aktuelle Seite (Start über Push ohne Vorgeschichte). */
export function ensureHomeBelow(): void {
  if (location.pathname === '/' || idx > 0) return;
  const target = location.pathname + location.search + location.hash;
  history.replaceState({ idx: 0 }, '', '/');
  history.pushState({ idx: (idx = 1) }, '', target);
}

export const usePath = (): string => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => path);

/** Gespeicherte Scrollposition für Zurück-Navigation, sonst oben. */
export function restoreScroll(): void {
  const y = popped ? (scrolls[path] ?? 0) : 0;
  window.scrollTo(0, y);
}
export const wasPopped = (): boolean => popped;
