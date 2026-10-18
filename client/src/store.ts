// Globaler Zustand ohne Bibliothek: ein Objekt, Subscriber, useSyncExternalStore.
import { useSyncExternalStore } from 'react';
import type { GameDTO, PlayerDTO, StateDTO } from '../../shared/types.ts';
import { cleanName, nameKey } from '../../shared/names.ts';
import { lsGet, lsSet, ssKeys, ssSet } from './storage.ts';

export type ToastOpts = {
  /** Undo-Toast (8 s, Fortschrittsbalken, Button „Rückgängig“) */
  undo?: () => void;
  /** Sonstige Aktion im Toast, z. B. „Installieren“ */
  action?: { label: string; run: () => void };
  error?: boolean;
  ms?: number;
};
export type ToastT = ToastOpts & { id: number; msg: string };

export type S = {
  state: StateDTO | null;
  loading: boolean;
  /** letzter Ladefehler (Text) */
  error: string | null;
  offline: boolean;
  /** lokaler Zeitpunkt des angezeigten Stands (für „Stand von …“) */
  fetchedAt: number | null;
  /** SSE verbunden */
  live: boolean;
  name: string | null;
  /** Server-Uhr minus lokale Uhr */
  offset: number;
  /** zählt bei jedem Phasenwechsel (open→closed, resolved→archived) hoch */
  tick: number;
  toast: ToastT | null;
  liveLine: { gameId: number; text: string; id: number } | null;
  /** Vollbild-Screens blenden die Bottom-Bar aus */
  fullscreen: boolean;
  /** Wette, in der in dieser Sitzung getippt wurde (PushCard, Tipp-Serie) */
  justTipped: number | null;
  /** gerade angelegte Wette (Teilen-Puls, PushCard) */
  justCreated: number | null;
  /** Wette, deren Siegel gerade aufklappen sollen */
  flip: number | null;
  /** NamePicker als Sheet offen */
  namePicker: boolean;
  welcomeSeen: boolean;
};

let s: S = {
  state: null,
  loading: false,
  error: null,
  offline: typeof navigator !== 'undefined' && navigator.onLine === false,
  fetchedAt: null,
  live: false,
  name: lsGet('benchbet.name'),
  offset: 0,
  tick: 0,
  toast: null,
  liveLine: null,
  fullscreen: false,
  justTipped: null,
  justCreated: null,
  flip: null,
  namePicker: false,
  welcomeSeen: lsGet('benchbet.welcome') === '1',
};

const subs = new Set<() => void>();
export const get = (): S => s;
export function set(p: Partial<S>): void {
  s = { ...s, ...p };
  subs.forEach((f) => f());
}
export function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}
/** Selektor muss stabile Werte liefern (Primitive oder bestehende Referenzen). */
export function useStore<T>(sel: (s: S) => T): T {
  return useSyncExternalStore(subscribe, () => sel(s), () => sel(s));
}

/** Serverzeit in ms (Client-Uhr + Offset aus /api/state bzw. SSE hello). */
export const now = (): number => Date.now() + s.offset;

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle (auch für push.ts/pwa.ts)
// ---------------------------------------------------------------------------

export const getName = (): string | null => s.name;
export const useName = (): string | null => useStore((x) => x.name);
export const useMeKey = (): string | null => useStore((x) => (x.name ? nameKey(x.name) : null));

export type ServerConfig = StateDTO['config'];
export const useServerConfig = (): ServerConfig | null => useStore((x) => x.state?.config ?? null);

let nameListeners: ((n: string | null) => void)[] = [];
/** Für push.ts: wird nach jedem Namenswechsel aufgerufen (z. B. PATCH /api/push/subscription). */
export function onNameChange(f: (n: string | null) => void): () => void {
  nameListeners.push(f);
  return () => {
    nameListeners = nameListeners.filter((x) => x !== f);
  };
}

/** Angefangene Tipp-Entwürfe (sessionStorage), für den Hinweis beim Namenswechsel. */
export const tipDraftKeys = (): string[] => ssKeys('benchbet.tipdraft.');

/** Name setzen (localStorage), Tipp-Entwürfe verwerfen, Listener informieren. Laden übernimmt api.ts. */
export function setName(n: string | null): void {
  const clean = n == null ? null : cleanName(n);
  if (clean === s.name) return;
  const switched = s.name != null;
  lsSet('benchbet.name', clean);
  if (switched) for (const k of tipDraftKeys()) ssSet(k, null);
  set({ name: clean, justTipped: null, flip: null });
  for (const f of nameListeners) {
    try {
      f(clean);
    } catch {
      /* Listener-Fehler nicht durchreichen */
    }
  }
}

let toastId = 0;
export function toast(msg: string, opts: ToastOpts = {}): void {
  set({ toast: { ...opts, msg, id: ++toastId } });
}
export const hideToast = (id: number): void => {
  if (s.toast?.id === id) set({ toast: null });
};

export function dismissWelcome(): void {
  lsSet('benchbet.welcome', '1');
  if (!s.welcomeSeen) set({ welcomeSeen: true });
}

// ---------------------------------------------------------------------------
// State-Helfer
// ---------------------------------------------------------------------------

export function upsertGame(g: GameDTO): void {
  const st = s.state;
  if (!st) return;
  const i = st.games.findIndex((x) => x.id === g.id);
  const games = i < 0 ? [g, ...st.games] : st.games.map((x) => (x.id === g.id ? g : x));
  set({ state: { ...st, games } });
}
export function dropGame(id: number): void {
  const st = s.state;
  if (st) set({ state: { ...st, games: st.games.filter((g) => g.id !== id) } });
}
export function patchGame(id: number, f: (g: GameDTO) => GameDTO): void {
  const g = s.state?.games.find((x) => x.id === id);
  if (g) upsertGame(f(g));
}

export const useGames = (): GameDTO[] | null => useStore((x) => x.state?.games ?? null);
export const useGame = (id: number): GameDTO | null => useStore((x) => x.state?.games.find((g) => g.id === id) ?? null);
export const usePlayers = (): PlayerDTO[] => useStore((x) => x.state?.players ?? EMPTY);
const EMPTY: PlayerDTO[] = [];
/** Re-Render bei Phasenwechseln. */
export const useTick = (): number => useStore((x) => x.tick);
export const useOffline = (): boolean => useStore((x) => x.offline);
