// Uhr des Servers. In Tests durch eine feste/verstellbare Uhr ersetzbar (SPEC §7.1).

export type Clock = { now(): number };

export const systemClock: Clock = { now: () => Date.now() };

/** ISO-8601-UTC mit Millisekunden und `Z` (§2.2). */
export const iso = (ms: number): string => new Date(ms).toISOString();
