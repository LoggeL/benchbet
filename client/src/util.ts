// Kleine Client-Helfer rund um GameDTO.
import { useEffect, useState } from 'react';
import type { GameDTO, Phase, PlayerDTO, TipDTO, TipValues } from '../../shared/types.ts';
import { formatAnswer, formatDistance, formatTipLabel } from '../../shared/format.ts';
import { phaseOf } from '../../shared/phase.ts';
import { nameKey } from '../../shared/names.ts';
import { C } from './copy.ts';
import { now, set } from './store.ts';

/** Phase jetzt (gleiche Funktion wie der Server, sekundengenau mit Uhr-Offset). */
export const ph = (g: GameDTO): Phase => phaseOf(g, now());
export const isDone = (p: Phase): boolean => p === 'resolved' || p === 'archived';
export const ownTip = (g: GameDTO): TipDTO | undefined => g.tips.find((t) => t.isOwn);

/** Wert eines Tipps für Anzeige (Mehrfeld kompakt mit „/“). */
export function valueText(g: GameDTO, v: TipValues | null): string {
  if (v == null) return '–';
  if (typeof v === 'string') return `“${v}”`;
  return v.length > 1 ? formatTipLabel(g.fields, v) : formatAnswer(g, v);
}
/** Ergebnis für Listen: Text ohne Anführungszeichen. */
export const resultText = (g: GameDTO): string =>
  typeof g.result === 'string' ? g.result : g.result ? valueText(g, g.result) : '–';

export const unitOf = (g: GameDTO): string => g.fields[0]?.unit ?? '';
export const distText = (g: GameDTO, d: number): string => formatDistance(d, unitOf(g));

/** Eigener Ausgang einer aufgelösten Wette (Inbox/Results): „You: 🏆“, „You: #2“, „no guess“. */
export function outcomeShort(g: GameDTO): string {
  const t = ownTip(g);
  if (!t) return C.my.noneLower;
  if (t.isWinner) return C.inbox.youWon;
  if (g.answerType === 'text') return C.inbox.youMissed;
  return t.rank ? C.inbox.youPlace(t.rank) : 'You: –';
}

/** Spielerfarbe 0..7 (fester Index aus players, sonst stabiler Hash). */
export function colorOf(players: readonly PlayerDTO[], keyOrName: string): number {
  const key = nameKey(keyOrName);
  const p = players.find((x) => x.key === key);
  if (p) return p.color % 8;
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return h % 8;
}

export const reducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Re-Render im Takt (für Countdowns). */
export function useNow(ms: number): number {
  const [, bump] = useState(0);
  useEffect(() => {
    const t = setInterval(() => bump((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now();
}

/** Kürzt auf n Zeichen mit „…“. */
export const clip = (s: string, n: number): string => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

export const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/** Vollbild-Screen: Bottom-Bar ausblenden, solange aktiv. */
export function useFullscreen(on = true): void {
  useEffect(() => {
    if (!on) return;
    set({ fullscreen: true });
    return () => set({ fullscreen: false });
  }, [on]);
}

/** Nur http(s)-Links ins href (Defense in depth gegen javascript:-URLs aus Altdaten). */
export const safeHref = (u: string | null | undefined): string | null => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
