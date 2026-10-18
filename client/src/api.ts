// API-Client gegen den Vertrag §3 (DTOs aus shared/types.ts) + Laden des Gesamtzustands.
import type {
  ActivityEventDTO, ErrorCode, GameDTO, GameInput, PlayerDTO, RemovedReason, ResolvePreview, StateDTO, TipDTO, TipValues,
} from '../../shared/types.ts';
import { missingCount } from '../../shared/inbox.ts';
import { nameKey } from '../../shared/names.ts';
import { nextPhaseChange } from '../../shared/phase.ts';
import { C } from './copy.ts';
import { deviceId } from './storage.ts';
import * as st from './store.ts';

export class ApiError extends Error {
  code: ErrorCode | 'NETWORK' | 'BAD_JSON' | 'HTTP';
  status: number;
  field?: string;
  constructor(code: ApiError['code'], status: number, message: string, field?: string) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

type Opts = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: Record<string, unknown>; anon?: boolean };

let cachedState = false;
let swFetchedAt: number | null = null;

/** Ein Request: Name als ?name= (lesen) bzw. im Body (schreiben), Gerätekennung im Header. */
export async function call<T>(path: string, o: Opts = {}): Promise<T> {
  const method = o.method ?? 'GET';
  const name = o.anon ? null : st.get().name;
  const headers: Record<string, string> = { 'X-Device-Id': deviceId, Accept: 'application/json' };
  let url = path;
  let body: string | undefined;
  if (method === 'GET') {
    if (name) url += (url.includes('?') ? '&' : '?') + 'name=' + encodeURIComponent(name);
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ ...(name ? { name } : {}), ...o.body });
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, cache: 'no-store', credentials: 'same-origin' });
  } catch {
    if (!st.get().offline) st.set({ offline: true });
    throw new ApiError('NETWORK', 0, C.err.offlineShort);
  }
  cachedState = res.headers.get('X-SW-Cache') === '1';
  const fa = res.headers.get('X-SW-Fetched-At');
  swFetchedAt = fa ? Date.parse(fa) || null : null;
  if (res.status === 204) return null as T;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('BAD_JSON', res.status, C.err.badJson);
  }
  if (!res.ok) {
    const e = (data as { error?: { code?: ErrorCode; message?: string; field?: string } } | null)?.error;
    throw new ApiError(e?.code ?? 'HTTP', res.status, e?.message || C.err.http, e?.field);
  }
  if (!cachedState && st.get().offline && navigator.onLine !== false) st.set({ offline: false });
  return data as T;
}

export const errText = (e: unknown): string => (e instanceof ApiError ? e.message : C.err.other);
/** Fehler als Toast melden. */
export function fail(e: unknown): void {
  st.toast(errText(e), { error: true });
}

// ---------------------------------------------------------------------------
// Gesamtzustand
// ---------------------------------------------------------------------------

let running: Promise<void> | null = null;
let again = false;
export let lastLoad = 0;

/** GET /api/state. Überlappende Aufrufe werden gebündelt (am Ende ggf. ein weiterer Lauf). */
export function load(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    st.set({ loading: true });
    try {
      const nameAt = st.get().name;
      const data = await call<StateDTO>('/api/state');
      if (st.get().name !== nameAt) {
        again = true;
        return;
      }
      lastLoad = Date.now();
      const offset = Date.parse(data.serverTime) - Date.now();
      st.set({
        state: data,
        error: null,
        offset: cachedState ? st.get().offset : offset,
        offline: cachedState ? true : st.get().offline && navigator.onLine === false,
        fetchedAt: cachedState ? (swFetchedAt ?? st.get().fetchedAt) : Date.now(),
      });
      afterState(data);
    } catch (e) {
      st.set({ error: errText(e) });
    } finally {
      st.set({ loading: false });
      running = null;
      if (again) {
        again = false;
        void load();
      }
    }
  })();
  return running;
}

let debounce: ReturnType<typeof setTimeout> | undefined;
/** Gebündelter Refetch (SSE-Änderungen, Debounce 300 ms). */
export function refetch(ms = 300): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => void load(), ms);
}

let phaseTimer: ReturnType<typeof setTimeout> | undefined;
function afterState(data: StateDTO): void {
  // App-Badge = „Dein Tipp fehlt“
  const name = st.get().name;
  const n = missingCount(data.games, name ? nameKey(name) : null, st.now());
  const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (name && n > 0) void nav.setAppBadge?.(n).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* nicht unterstützt */
  }
  // Sekundengenauer Phasenwechsel (open→closed, resolved→archived)
  clearTimeout(phaseTimer);
  const t = st.now();
  let next = Infinity;
  for (const g of data.games) {
    const c = nextPhaseChange(g, t);
    if (c != null && c > t && c < next) next = c;
  }
  if (next < Infinity) {
    phaseTimer = setTimeout(() => {
      st.set({ tick: st.get().tick + 1 });
      refetch(1500);
    }, Math.min(next - t + 50, 2 ** 31 - 1));
  }
}

/** Einzelne Wette nachladen und in den Zustand übernehmen. */
export async function loadGame(id: number): Promise<GameDTO> {
  const r = await call<{ game: GameDTO }>(`/api/games/${id}`);
  st.upsertGame(r.game);
  return r.game;
}

// ---------------------------------------------------------------------------
// Aktionen
// ---------------------------------------------------------------------------

type G = { game: GameDTO };
const post = <T>(path: string, body: Record<string, unknown> = {}) => call<T>(path, { method: 'POST', body });

export const api = {
  createGame: (input: GameInput) => post<G>('/api/games', input),
  patchGame: (id: number, patch: Partial<GameInput>) => call<G>(`/api/games/${id}`, { method: 'PATCH', body: { patch } }),
  close: (id: number) => post<G>(`/api/games/${id}/close`),
  reopen: (id: number, closesAt: string | null) => post<G>(`/api/games/${id}/reopen`, { closesAt }),
  resolve: (id: number, result: TipValues | null, winnerTipIds?: number[]) =>
    post<G>(`/api/games/${id}/resolve`, { result, ...(winnerTipIds ? { winnerTipIds } : {}), dryRun: false }),
  correct: (id: number, result: TipValues, reason: string, winnerTipIds?: number[]) =>
    post<G>(`/api/games/${id}/correct`, { result, reason, ...(winnerTipIds ? { winnerTipIds } : {}), dryRun: false }),
  preview: (id: number, result: TipValues | null, correct: boolean, winnerTipIds?: number[]) =>
    post<{ preview: ResolvePreview }>(`/api/games/${id}/${correct ? 'correct' : 'resolve'}`, {
      ...(result != null ? { result } : {}), ...(winnerTipIds ? { winnerTipIds } : {}), dryRun: true,
    }),
  seen: (id: number) => post<null>(`/api/games/${id}/seen`),
  remove: (id: number) => call<{ deletedAt: string; restoreUntil: string }>(`/api/games/${id}`, { method: 'DELETE' }),
  restore: (id: number) => post<G>(`/api/games/${id}/restore`),
  trash: () => call<{ games: GameDTO[] }>('/api/trash'),
  activity: (id: number) => call<{ events: ActivityEventDTO[] }>(`/api/games/${id}/activity`),
  tip: (gameId: number, values: TipValues) =>
    post<{ tip: TipDTO; undoUntil: string; game: GameDTO }>('/api/tips', { gameId, values }),
  undoTip: (tipId: number) => call<null>(`/api/tips/${tipId}`, { method: 'DELETE' }),
  removeTip: (tipId: number, reason: RemovedReason) =>
    call<{ tip: { id: number; removedAt: string } }>(`/api/tips/${tipId}`, { method: 'DELETE', body: { reason } }),
  restoreTip: (tipId: number) => post<{ tip: TipDTO }>(`/api/tips/${tipId}/restore`),
  patchPlayer: (key: string, patch: { hidden?: boolean; displayName?: string }) =>
    call<{ player: PlayerDTO }>(`/api/players/${encodeURIComponent(key)}`, { method: 'PATCH', body: { patch } }),
  pushConfig: () => call<{ publicKey: string; audience: number }>('/api/push/config'),
};
