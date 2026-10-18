// Server-Sent Events (SPEC §3.4): Verbindungs-Set, broadcast, Heartbeat.
import type { ServerResponse } from 'node:http';
import type { SseChange, SseHello } from '../../shared/types.ts';

export const SSE_MAX_CONNECTIONS = 200;
export const SSE_HEARTBEAT_MS = 25_000;

/** Minimale Schreib-Schnittstelle (ServerResponse oder Test-Double). */
export type SseSink = Pick<ServerResponse, 'write' | 'end' | 'destroy' | 'writableNeedDrain' | 'destroyed' | 'writableEnded'>;

export type SseHub = ReturnType<typeof createSse>;

export function createSse(opts: { heartbeatMs?: number; maxConnections?: number } = {}) {
  const heartbeatMs = opts.heartbeatMs ?? SSE_HEARTBEAT_MS;
  const max = opts.maxConnections ?? SSE_MAX_CONNECTIONS;
  const conns = new Set<SseSink>();
  let timer: ReturnType<typeof setInterval> | null = null;

  function drop(c: SseSink): void {
    conns.delete(c);
    try {
      if (!c.destroyed) c.destroy();
    } catch {
      /* egal */
    }
  }

  /** Schreibt einen Block; ist der Socket nicht schreibbar (Backpressure), wird die Verbindung geschlossen. */
  function write(c: SseSink, chunk: string): void {
    if (c.destroyed || c.writableEnded || c.writableNeedDrain) return drop(c);
    try {
      c.write(chunk);
    } catch {
      drop(c);
    }
  }

  function ensureTimer(): void {
    if (timer || conns.size === 0) return;
    timer = setInterval(ping, heartbeatMs);
    timer.unref?.();
  }

  function ping(): void {
    for (const c of [...conns]) write(c, ': ping\n\n');
    if (conns.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    get size(): number {
      return conns.size;
    },
    isFull: (): boolean => conns.size >= max,
    /** Verbindung aufnehmen und `retry` + `hello` schicken. */
    add(c: SseSink, hello: SseHello): void {
      conns.add(c);
      write(c, `retry: 3000\n\nevent: hello\ndata: ${JSON.stringify(hello)}\n\n`);
      ensureTimer();
    },
    remove(c: SseSink): void {
      conns.delete(c);
    },
    broadcast(id: number, change: SseChange): void {
      const chunk = `id: ${id}\nevent: change\ndata: ${JSON.stringify(change)}\n\n`;
      for (const c of [...conns]) write(c, chunk);
    },
    ping,
    closeAll(): void {
      if (timer) clearInterval(timer);
      timer = null;
      for (const c of [...conns]) {
        conns.delete(c);
        try {
          c.end();
        } catch {
          /* egal */
        }
      }
    },
  };
}
