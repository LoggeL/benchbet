// Alle SQL-Statements (prepared) und das Mapping Row ↔ Domäne (SPEC §2.2).
import type { StatementSync } from 'node:sqlite';
import type { Db } from './index.ts';
import type { Field, Game, GameTemplate, Player, PushPrefs, RemovedReason, Tip, TipValues } from '../../shared/types.ts';
import { DEFAULT_PUSH_PREFS } from '../../shared/types.ts';

type Row = Record<string, unknown>;

const s = (v: unknown): string | null => (v == null ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  try {
    return JSON.parse(String(v)) as T;
  } catch {
    return fallback;
  }
};

export function rowToGame(r: Row): Game {
  return {
    id: Number(r.id),
    prompt: String(r.prompt),
    description: String(r.description ?? ''),
    infoUrl: s(r.info_url),
    benchmark: String(r.benchmark ?? ''),
    template: String(r.template) as GameTemplate,
    answerType: r.answer_type === 'text' ? 'text' : 'number',
    fields: json<Field[]>(r.fields_json, []),
    createdByKey: String(r.created_by_key),
    createdBy: String(r.created_by_name),
    createdAt: String(r.created_at),
    closesAt: s(r.closes_at),
    closedAt: s(r.closed_at),
    closedBy: s(r.closed_by),
    resolvedAt: s(r.resolved_at),
    resolvedBy: s(r.resolved_by),
    result: json<TipValues | null>(r.result_json, null),
    winnerTipIds: json<number[] | null>(r.winner_tip_ids_json, null),
    correctedAt: s(r.corrected_at),
    editedAt: s(r.edited_at),
    promptEditedAt: s(r.prompt_edited_at),
    deletedAt: s(r.deleted_at),
    deletedBy: s(r.deleted_by),
    pushNewSentAt: s(r.push_new_sent_at),
    creatorDueSentAt: s(r.creator_due_sent_at),
    creatorOverdueSentAt: s(r.creator_overdue_sent_at),
  };
}

export function rowToTip(r: Row): Tip {
  return {
    id: Number(r.id),
    gameId: Number(r.game_id),
    playerKey: String(r.player_key),
    playerName: String(r.player_name),
    values: json<TipValues>(r.values_json, []),
    createdAt: s(r.created_at),
    deviceId: s(r.device_id),
    removedAt: s(r.removed_at),
    removedBy: s(r.removed_by),
    removedReason: (s(r.removed_reason) as RemovedReason | null) ?? null,
  };
}

export function rowToPlayer(r: Row): Player {
  return { key: String(r.key), name: String(r.name), color: Number(r.color), hidden: Number(r.hidden) === 1, createdAt: String(r.created_at) };
}

export type Subscription = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  playerKey: string;
  deviceId: string;
  prefs: PushPrefs;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  failCount: number;
};

export function rowToSub(r: Row): Subscription {
  return {
    id: Number(r.id),
    endpoint: String(r.endpoint),
    p256dh: String(r.p256dh),
    auth: String(r.auth),
    playerKey: String(r.player_key),
    deviceId: String(r.device_id),
    prefs: { ...DEFAULT_PUSH_PREFS, ...json<Partial<PushPrefs>>(r.prefs_json, {}) },
    userAgent: s(r.user_agent),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    lastSuccessAt: s(r.last_success_at),
    lastErrorAt: s(r.last_error_at),
    lastError: s(r.last_error),
    failCount: Number(r.fail_count ?? 0),
  };
}

export type EventRow = {
  id: number;
  at: string;
  type: string;
  gameId: number | null;
  tipId: number | null;
  actorKey: string | null;
  actorName: string | null;
  deviceTag: string | null;
  data: Record<string, unknown>;
};

function rowToEvent(r: Row): EventRow {
  return {
    id: Number(r.id),
    at: String(r.at),
    type: String(r.type),
    gameId: r.game_id == null ? null : Number(r.game_id),
    tipId: r.tip_id == null ? null : Number(r.tip_id),
    actorKey: s(r.actor_key),
    actorName: s(r.actor_name),
    deviceTag: s(r.device_tag),
    data: json<Record<string, unknown>>(r.data_json, {}),
  };
}

/** Spalten, die per updateGame geändert werden dürfen (Domänen-Schlüssel → Spalte). */
const GAME_COLUMNS = {
  prompt: 'prompt', description: 'description', infoUrl: 'info_url', benchmark: 'benchmark', template: 'template',
  answerType: 'answer_type', fields: 'fields_json', closesAt: 'closes_at', closedAt: 'closed_at', closedBy: 'closed_by',
  resolvedAt: 'resolved_at', resolvedBy: 'resolved_by', result: 'result_json', winnerTipIds: 'winner_tip_ids_json',
  correctedAt: 'corrected_at', editedAt: 'edited_at', promptEditedAt: 'prompt_edited_at', deletedAt: 'deleted_at', deletedBy: 'deleted_by',
  pushNewSentAt: 'push_new_sent_at', creatorDueSentAt: 'creator_due_sent_at', creatorOverdueSentAt: 'creator_overdue_sent_at',
} as const;
type GameColumn = keyof typeof GAME_COLUMNS;
const JSON_COLUMNS = new Set<GameColumn>(['fields', 'result', 'winnerTipIds']);

export type NewGame = Omit<Game, 'id' | 'closedAt' | 'closedBy' | 'resolvedAt' | 'resolvedBy' | 'result' | 'winnerTipIds' | 'correctedAt' | 'editedAt' | 'deletedAt' | 'deletedBy'> & { id?: number } & Partial<Pick<Game, 'closedAt' | 'closedBy' | 'resolvedAt' | 'resolvedBy' | 'result' | 'winnerTipIds'>>;

export type Repo = ReturnType<typeof createRepo>;

export function createRepo(db: Db) {
  const cache = new Map<string, StatementSync>();
  const st = (sql: string): StatementSync => {
    let p = cache.get(sql);
    if (!p) {
      p = db.prepare(sql);
      cache.set(sql, p);
    }
    return p;
  };
  const all = (sql: string, ...params: (string | number | null)[]): Row[] => st(sql).all(...params) as Row[];
  const get = (sql: string, ...params: (string | number | null)[]): Row | undefined => st(sql).get(...params) as Row | undefined;
  const run = (sql: string, ...params: (string | number | null)[]) => st(sql).run(...params);

  return {
    db,

    // ---- meta ----------------------------------------------------------
    getMeta(key: string): string | null {
      return s(get('SELECT value FROM meta WHERE key = ?', key)?.value);
    },
    setMeta(key: string, value: string): void {
      run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
    },

    // ---- players -------------------------------------------------------
    getPlayer(key: string): Player | null {
      const r = get('SELECT * FROM players WHERE key = ?', key);
      return r ? rowToPlayer(r) : null;
    },
    listPlayers(): Player[] {
      return all('SELECT * FROM players ORDER BY created_at, key').map(rowToPlayer);
    },
    countPlayers(): number {
      return Number(get('SELECT COUNT(*) AS n FROM players')!.n);
    },
    insertPlayer(p: Player): void {
      run('INSERT INTO players(key, name, color, hidden, created_at) VALUES (?, ?, ?, ?, ?)', p.key, p.name, p.color, p.hidden ? 1 : 0, p.createdAt);
    },
    updatePlayer(key: string, patch: { name?: string; hidden?: boolean }): void {
      if (patch.name !== undefined) run('UPDATE players SET name = ? WHERE key = ?', patch.name, key);
      if (patch.hidden !== undefined) run('UPDATE players SET hidden = ? WHERE key = ?', patch.hidden ? 1 : 0, key);
    },

    // ---- games ---------------------------------------------------------
    getGame(id: number): Game | null {
      const r = get('SELECT * FROM games WHERE id = ?', id);
      return r ? rowToGame(r) : null;
    },
    listGames(opts: { deleted?: boolean } = {}): Game[] {
      const where = opts.deleted ? 'deleted_at IS NOT NULL' : 'deleted_at IS NULL';
      return all(`SELECT * FROM games WHERE ${where} ORDER BY created_at DESC, id DESC`).map(rowToGame);
    },
    countGames(): number {
      return Number(get('SELECT COUNT(*) AS n FROM games')!.n);
    },
    insertGame(g: NewGame): number {
      const r = run(
        `INSERT INTO games(id, prompt, description, info_url, benchmark, template, answer_type, fields_json, created_by_key, created_by_name,
           created_at, closes_at, closed_at, closed_by, resolved_at, resolved_by, result_json, winner_tip_ids_json,
           push_new_sent_at, creator_due_sent_at, creator_overdue_sent_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        g.id ?? null, g.prompt, g.description, g.infoUrl, g.benchmark, g.template, g.answerType, JSON.stringify(g.fields),
        g.createdByKey, g.createdBy, g.createdAt, g.closesAt, g.closedAt ?? null, g.closedBy ?? null, g.resolvedAt ?? null,
        g.resolvedBy ?? null, g.result == null ? null : JSON.stringify(g.result), g.winnerTipIds == null ? null : JSON.stringify(g.winnerTipIds),
        g.pushNewSentAt ?? null, g.creatorDueSentAt ?? null, g.creatorOverdueSentAt ?? null,
      );
      return Number(r.lastInsertRowid);
    },
    updateGame(id: number, patch: Partial<Pick<Game, GameColumn>>): void {
      const keys = (Object.keys(patch) as GameColumn[]).filter((k) => k in GAME_COLUMNS);
      if (keys.length === 0) return;
      const sets = keys.map((k) => `${GAME_COLUMNS[k]} = ?`).join(', ');
      const vals = keys.map((k) => {
        const v = patch[k];
        if (JSON_COLUMNS.has(k)) return v == null ? null : JSON.stringify(v);
        return v == null ? null : (v as string);
      });
      db.prepare(`UPDATE games SET ${sets} WHERE id = ?`).run(...vals, id);
    },
    deleteGameHard(id: number): void {
      run('DELETE FROM games WHERE id = ?', id);
    },
    /** Für den Scheduler: frühester geplanter Tippschluss offener Wetten. */
    nextClosesAt(): string | null {
      return s(get('SELECT MIN(closes_at) AS t FROM games WHERE resolved_at IS NULL AND closed_at IS NULL AND closes_at IS NOT NULL AND deleted_at IS NULL')?.t);
    },
    dueToClose(nowIso: string): Game[] {
      return all('SELECT * FROM games WHERE resolved_at IS NULL AND closed_at IS NULL AND closes_at <= ? AND deleted_at IS NULL ORDER BY closes_at, id', nowIso).map(rowToGame);
    },
    setSequence(table: 'games' | 'tips', seq: number): void {
      const r = run('UPDATE sqlite_sequence SET seq = ? WHERE name = ?', seq, table);
      if (Number(r.changes) === 0) run('INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)', table, seq);
    },
    maxId(table: 'games' | 'tips'): number {
      return Number(get(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table}`)!.m);
    },

    // ---- tips ----------------------------------------------------------
    getTip(id: number): Tip | null {
      const r = get('SELECT * FROM tips WHERE id = ?', id);
      return r ? rowToTip(r) : null;
    },
    /** Aktive (nicht entfernte) Tipps einer Wette, nach id. */
    activeTips(gameId: number): Tip[] {
      return all('SELECT * FROM tips WHERE game_id = ? AND removed_at IS NULL ORDER BY id', gameId).map(rowToTip);
    },
    /** Alle aktiven Tipps aller nicht gelöschten Wetten. */
    allActiveTips(): Tip[] {
      return all('SELECT t.* FROM tips t JOIN games g ON g.id = t.game_id WHERE t.removed_at IS NULL AND g.deleted_at IS NULL ORDER BY t.id').map(rowToTip);
    },
    findActiveTip(gameId: number, playerKey: string): Tip | null {
      const r = get('SELECT * FROM tips WHERE game_id = ? AND player_key = ? AND removed_at IS NULL', gameId, playerKey);
      return r ? rowToTip(r) : null;
    },
    /** Hat der Spieler auf dieser Wette einen entfernten (moderierten) Tipp? */
    hasRemovedTip(gameId: number, playerKey: string): boolean {
      return !!get('SELECT 1 AS x FROM tips WHERE game_id = ? AND player_key = ? AND removed_at IS NOT NULL LIMIT 1', gameId, playerKey);
    },
    findActiveTipByDevice(gameId: number, deviceId: string): Tip | null {
      const r = get('SELECT * FROM tips WHERE game_id = ? AND device_id = ? AND removed_at IS NULL', gameId, deviceId);
      return r ? rowToTip(r) : null;
    },
    insertTip(t: { id?: number; gameId: number; playerKey: string; playerName: string; values: TipValues; createdAt: string | null; deviceId: string | null }): number {
      const r = run(
        'INSERT INTO tips(id, game_id, player_key, player_name, values_json, created_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        t.id ?? null, t.gameId, t.playerKey, t.playerName, JSON.stringify(t.values), t.createdAt, t.deviceId,
      );
      return Number(r.lastInsertRowid);
    },
    deleteTipHard(id: number): void {
      run('DELETE FROM tips WHERE id = ?', id);
    },
    removeTip(id: number, at: string, by: string, reason: RemovedReason): void {
      run('UPDATE tips SET removed_at = ?, removed_by = ?, removed_reason = ? WHERE id = ?', at, by, reason, id);
    },
    restoreTip(id: number): void {
      run('UPDATE tips SET removed_at = NULL, removed_by = NULL, removed_reason = NULL WHERE id = ?', id);
    },

    // ---- result_seen ---------------------------------------------------
    seenGames(playerKey: string): Set<number> {
      return new Set(all('SELECT game_id FROM result_seen WHERE player_key = ?', playerKey).map((r) => Number(r.game_id)));
    },
    markSeen(playerKey: string, gameId: number, at: string): void {
      run('INSERT INTO result_seen(player_key, game_id, seen_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', playerKey, gameId, at);
    },

    // ---- events --------------------------------------------------------
    insertEvent(e: { at: string; type: string; gameId: number | null; tipId: number | null; actorKey: string | null; actorName: string | null; deviceTag: string | null; data: unknown }): number {
      const r = run(
        'INSERT INTO events(at, type, game_id, tip_id, actor_key, actor_name, device_tag, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        e.at, e.type, e.gameId, e.tipId, e.actorKey, e.actorName, e.deviceTag, JSON.stringify(e.data ?? {}),
      );
      return Number(r.lastInsertRowid);
    },
    /** Hat dieser Spieler die verdeckten Werte in der Auflösen-Vorschau gesehen (game.previewed)? */
    hasPreviewed(gameId: number, playerKey: string): boolean {
      return !!get("SELECT 1 AS x FROM events WHERE game_id = ? AND type = 'game.previewed' AND actor_key = ? LIMIT 1", gameId, playerKey);
    },
    gameEvents(gameId: number): EventRow[] {
      return all('SELECT * FROM events WHERE game_id = ? ORDER BY id', gameId).map(rowToEvent);
    },

    // ---- push ----------------------------------------------------------
    listSubs(): Subscription[] {
      return all('SELECT * FROM push_subscriptions ORDER BY id').map(rowToSub);
    },
    subsForPlayer(playerKey: string): Subscription[] {
      return all('SELECT * FROM push_subscriptions WHERE player_key = ? ORDER BY id', playerKey).map(rowToSub);
    },
    getSub(id: number): Subscription | null {
      const r = get('SELECT * FROM push_subscriptions WHERE id = ?', id);
      return r ? rowToSub(r) : null;
    },
    subByEndpoint(endpoint: string): Subscription | null {
      const r = get('SELECT * FROM push_subscriptions WHERE endpoint = ?', endpoint);
      return r ? rowToSub(r) : null;
    },
    insertSub(x: { endpoint: string; p256dh: string; auth: string; playerKey: string; deviceId: string; prefs: PushPrefs; userAgent: string | null; at: string }): number {
      const r = run(
        `INSERT INTO push_subscriptions(endpoint, p256dh, auth, player_key, device_id, prefs_json, user_agent, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        x.endpoint, x.p256dh, x.auth, x.playerKey, x.deviceId, JSON.stringify(x.prefs), x.userAgent, x.at, x.at,
      );
      return Number(r.lastInsertRowid);
    },
    updateSub(id: number, x: Partial<{ endpoint: string; p256dh: string; auth: string; playerKey: string; deviceId: string; prefs: PushPrefs; userAgent: string | null }>, at: string): void {
      const map: Record<string, string> = { endpoint: 'endpoint', p256dh: 'p256dh', auth: 'auth', playerKey: 'player_key', deviceId: 'device_id', prefs: 'prefs_json', userAgent: 'user_agent' };
      const keys = Object.keys(x).filter((k) => k in map && (x as Record<string, unknown>)[k] !== undefined);
      const sets = [...keys.map((k) => `${map[k]} = ?`), 'updated_at = ?'].join(', ');
      const vals = keys.map((k) => {
        const v = (x as Record<string, unknown>)[k];
        return k === 'prefs' ? JSON.stringify(v) : (v as string | null);
      });
      db.prepare(`UPDATE push_subscriptions SET ${sets} WHERE id = ?`).run(...vals, at, id);
    },
    deleteSub(id: number): void {
      run('DELETE FROM push_subscriptions WHERE id = ?', id);
    },
    deleteAllSubs(): number {
      return Number(run('DELETE FROM push_subscriptions').changes);
    },
    subSuccess(id: number, at: string): void {
      run('UPDATE push_subscriptions SET last_success_at = ?, fail_count = 0 WHERE id = ?', at, id);
    },
    subFailure(id: number, at: string, error: string): void {
      run('UPDATE push_subscriptions SET last_error_at = ?, last_error = ?, fail_count = fail_count + 1 WHERE id = ?', at, error.slice(0, 500), id);
    },
    deleteFailingSubs(minFails: number): number {
      return Number(run('DELETE FROM push_subscriptions WHERE fail_count >= ?', minFails).changes);
    },
    /** Dedupe-Eintrag vor dem Versand; false = gab es schon (§5.4). */
    insertPushLog(x: { kind: string; gameId: number | null; subscriptionId: number | null; dedupeKey: string | null; at: string; status?: number | null }): number | null {
      const r = run(
        'INSERT INTO push_log(kind, game_id, subscription_id, dedupe_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dedupe_key) DO NOTHING',
        x.kind, x.gameId, x.subscriptionId, x.dedupeKey, x.status ?? null, x.at,
      );
      return Number(r.changes) > 0 ? Number(r.lastInsertRowid) : null;
    },
    setPushLogStatus(id: number, status: number): void {
      run('UPDATE push_log SET status = ? WHERE id = ?', status, id);
    },
    deletePushLogs(kind: string, gameId: number): void {
      run('DELETE FROM push_log WHERE kind = ? AND game_id = ?', kind, gameId);
    },
    pushLogs(): { kind: string; gameId: number | null; subscriptionId: number | null; dedupeKey: string | null; status: number | null }[] {
      return all('SELECT * FROM push_log ORDER BY id').map((r) => ({
        kind: String(r.kind), gameId: r.game_id == null ? null : Number(r.game_id),
        subscriptionId: r.subscription_id == null ? null : Number(r.subscription_id), dedupeKey: s(r.dedupe_key),
        status: r.status == null ? null : Number(r.status),
      }));
    },

    // ---- Export --------------------------------------------------------
    dumpTable(table: string, omit: string[] = []): Row[] {
      return all(`SELECT * FROM ${table} ORDER BY rowid`).map((r) => {
        const o: Row = {};
        for (const [k, v] of Object.entries(r)) if (!omit.includes(k)) o[k] = v;
        return o;
      });
    },
  };
}
