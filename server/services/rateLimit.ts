// In-Memory-Rate-Limit pro IP (SPEC §3.6): feste Minutenfenster je Kategorie.
import type { Clock } from '../clock.ts';

export type RateCategory = 'write' | 'tip' | 'read' | 'sse';

export const RATE_LIMITS: Record<RateCategory, number> = { write: 30, tip: 10, read: 300, sse: 30 };
const WINDOW_MS = 60_000;

export type RateLimiter = ReturnType<typeof createRateLimiter>;

export function createRateLimiter(clock: Clock, limits: Record<RateCategory, number> = RATE_LIMITS) {
  const buckets = new Map<string, { start: number; count: number }>();

  function sweep(now: number): void {
    for (const [k, b] of buckets) if (now - b.start >= WINDOW_MS) buckets.delete(k);
  }

  return {
    /** null = erlaubt, sonst Sekunden bis zum nächsten Fenster (Retry-After). */
    hit(category: RateCategory, ip: string): number | null {
      const now = clock.now();
      if (buckets.size > 10_000) sweep(now);
      const key = `${category}:${ip}`;
      let b = buckets.get(key);
      if (!b || now - b.start >= WINDOW_MS) {
        b = { start: now, count: 0 };
        buckets.set(key, b);
      }
      b.count++;
      if (b.count > limits[category]) return Math.max(1, Math.ceil((b.start + WINDOW_MS - now) / 1000));
      return null;
    },
    reset(): void {
      buckets.clear();
    },
  };
}

/** Kategorie einer API-Anfrage (null = kein Limit). */
export function categoryOf(method: string, path: string): RateCategory | null {
  if (!path.startsWith('/api/')) return null;
  if (path === '/api/events') return 'sse';
  if (method === 'GET' || method === 'HEAD') return 'read';
  if (method === 'POST' && path === '/api/tips') return 'tip';
  return 'write';
}
