// Lebenszyklus einer Wette (SPEC §2.3). Server und Client nutzen exakt diese Funktionen.
import type { Phase, PhaseTimes } from './types.ts';

export const ARCHIVE_MS = 7 * 24 * 3600 * 1000;
export const CLOSING_SOON_MS = 24 * 3600 * 1000;
/** Mindestabstand für einen Tippschluss beim Anlegen/Wieder öffnen/Verkürzen. */
export const MIN_CLOSE_LEAD_MS = 10 * 60 * 1000;

export function phaseOf(g: PhaseTimes, now: number): Phase {
  if (g.resolvedAt) return now >= Date.parse(g.resolvedAt) + ARCHIVE_MS ? 'archived' : 'resolved';
  if (g.closedAt || (g.closesAt && now >= Date.parse(g.closesAt))) return 'closed';
  return 'open';
}

export const closingSoon = (g: PhaseTimes, now: number): boolean =>
  phaseOf(g, now) === 'open' && !!g.closesAt && Date.parse(g.closesAt) - now < CLOSING_SOON_MS;

export const archiveAt = (g: Pick<PhaseTimes, 'resolvedAt'>): string | null =>
  g.resolvedAt ? new Date(Date.parse(g.resolvedAt) + ARCHIVE_MS).toISOString() : null;

export const isResolvedPhase = (p: Phase): boolean => p === 'resolved' || p === 'archived';

/**
 * Nächster Zeitpunkt, an dem sich die Phase von selbst ändert (open→closed bzw. resolved→archived),
 * oder null. Für Client-Timer und den Scheduler.
 */
export function nextPhaseChange(g: PhaseTimes, now: number): number | null {
  const p = phaseOf(g, now);
  if (p === 'open' && g.closesAt) return Date.parse(g.closesAt);
  if (p === 'resolved' && g.resolvedAt) return Date.parse(g.resolvedAt) + ARCHIVE_MS;
  return null;
}
