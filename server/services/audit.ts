// recordEvent(): schreibt den Audit-Eintrag und sendet das SSE-Event (SPEC §2.10, §3.4).
import { createHash } from 'node:crypto';
import type { Db } from '../db/index.ts';
import { transaction } from '../db/index.ts';
import type { Repo } from '../db/repo.ts';
import type { Clock } from '../clock.ts';
import { iso } from '../clock.ts';
import type { ChangeType, EventType, SseChange } from '../../shared/types.ts';
import type { SseHub } from './sse.ts';

const CHANGE_TYPES = new Set<string>([
  'game.created', 'game.edited', 'game.closed', 'game.reopened', 'game.resolved', 'game.corrected', 'game.deleted',
  'game.restored', 'tip.created', 'tip.undone', 'tip.removed', 'tip.restored', 'player.updated', 'import.completed',
]);

/** „Gerät a3f9c1“ = erste 6 Hex von sha256(deviceId). */
export const deviceTag = (deviceId: string | null | undefined): string | null =>
  deviceId ? createHash('sha256').update(deviceId).digest('hex').slice(0, 6) : null;

export type Actor = { key: string | null; name: string | null; deviceId?: string | null };

export type RecordInput = {
  type: EventType;
  gameId?: number | null;
  tipId?: number | null;
  actor?: Actor | null;
  data?: Record<string, unknown>;
  /** false = nur protokollieren, kein SSE (z. B. game.imported). */
  broadcast?: boolean;
};

export type Audit = ReturnType<typeof createAudit>;

export function createAudit(deps: { db: Db; repo: Repo; clock: Clock; sse: SseHub }) {
  const { db, repo, clock, sse } = deps;
  /** Innerhalb einer Transaktion gesammelte SSE-Sendungen; gehen erst nach COMMIT raus. */
  let pending: (() => void)[] | null = null;

  function emit(fn: () => void): void {
    if (pending) pending.push(fn);
    else fn();
  }

  function recordEvent(e: RecordInput): number {
    const at = iso(clock.now());
    const id = repo.insertEvent({
      at,
      type: e.type,
      gameId: e.gameId ?? null,
      tipId: e.tipId ?? null,
      actorKey: e.actor?.key ?? null,
      actorName: e.actor?.name ?? null,
      deviceTag: deviceTag(e.actor?.deviceId),
      data: e.data ?? {},
    });
    if (e.broadcast !== false && CHANGE_TYPES.has(e.type)) {
      const payload: SseChange = { type: e.type as ChangeType, gameId: e.gameId ?? null, at, actor: e.actor?.name ?? null };
      if (e.gameId != null) payload.tipCount = repo.activeTips(e.gameId).length;
      emit(() => sse.broadcast(id, payload));
    }
    return id;
  }

  /** Transaktion; SSE-Events werden erst nach erfolgreichem COMMIT verschickt (bei Rollback verworfen). */
  function tx<T>(fn: () => T): T {
    if (pending) return fn();
    pending = [];
    try {
      const out = transaction(db, fn);
      const list = pending;
      pending = null;
      for (const f of list) f();
      return out;
    } catch (e) {
      pending = null;
      throw e;
    }
  }

  return { recordEvent, tx };
}
