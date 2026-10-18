// Gemeinsame Typen für Server, Client und Service Worker (SPEC §2.2, §3.2).
// Nur erasable TypeScript: keine Enums, keine Namespaces, keine Parameter-Properties.

export type Phase = 'open' | 'closed' | 'resolved' | 'archived';
export type AnswerType = 'number' | 'text';

/** Vorlagen aus §1.4.4 plus `legacy` für importierte Altwetten. */
export type TemplateKey = 'aa' | 'api' | 'codename' | 'price' | 'percent' | 'multi' | 'number' | 'text';
export type GameTemplate = TemplateKey | 'legacy';

export type Field = { label: string; unit: string; min: number; max: number; step: number };

/** number: ein Wert pro Feld · text: getrimmter String. */
export type TipValues = number[] | string;

/** Zeitpunkte, aus denen sich die Phase ableitet (§2.3). */
export type PhaseTimes = { resolvedAt: string | null; closedAt: string | null; closesAt: string | null };

// ---------------------------------------------------------------------------
// Domäne (Server-intern, entspricht den Tabellen in §2.2 ohne _json-Suffixe)
// ---------------------------------------------------------------------------

export type Player = {
  key: string;            // nameKey()
  name: string;           // kanonischer Anzeigename
  color: number;          // 0..7
  hidden: boolean;
  createdAt: string;
};

export type Game = PhaseTimes & {
  id: number;
  prompt: string;
  description: string;
  infoUrl: string | null;
  benchmark: string;
  template: GameTemplate;
  answerType: AnswerType;
  fields: Field[];
  createdByKey: string;
  createdBy: string;      // Schreibweise bei Anlage (games.created_by_name)
  createdAt: string;
  closedBy: string | null;
  resolvedBy: string | null;
  result: TipValues | null;
  /** nur text: manuelle Gewinnerwahl; null = automatisch (normalisierte Gleichheit). */
  winnerTipIds: number[] | null;
  correctedAt: string | null;
  editedAt: string | null;
  /** Frage nach dem ersten fremden Tipp geändert (Tag „edited“ am Titel, §1.4.5). */
  promptEditedAt?: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
  pushNewSentAt?: string | null;
  creatorDueSentAt?: string | null;
  creatorOverdueSentAt?: string | null;
};

export type RemovedReason = 'duplicate' | 'troll' | 'request';

export type Tip = {
  id: number;
  gameId: number;
  playerKey: string;
  playerName: string;     // Schreibweise bei Abgabe
  values: TipValues;
  createdAt: string | null;   // null bei Legacy-Tipps
  deviceId?: string | null;
  removedAt?: string | null;
  removedBy?: string | null;
  removedReason?: RemovedReason | null;
};

export type Score = { distance: number | null; rank: number | null; isWinner: boolean };
export type ScoredTip<T = Tip> = T & Score;

/** Minimaler Eingang für computeStats (§2.8). */
export type StatsTip = { playerName: string; playerKey?: string; isWinner: boolean; distance: number | null; rank: number | null };
export type ScoredGame = { id: number; resolvedAt: string | null; result: TipValues | null; tips: StatsTip[] };

// ---------------------------------------------------------------------------
// API-DTOs (§3.2)
// ---------------------------------------------------------------------------

export type TipDTO = {
  id: number;
  playerName: string;     // kanonischer Anzeigename
  playerKey: string;
  isOwn: boolean;
  isNew: boolean;         // erster Tipp dieses Spielers überhaupt UND Spieler < 14 Tage alt
  values: TipValues | null;   // null = verdeckt
  distance: number | null;
  rank: number | null;
  isWinner: boolean;
  createdAt: string | null;
};

export type Viewer = { hasTipped: boolean; tipId: number | null; undoUntil: string | null; resultSeen: boolean };

export type GameDTO = {
  id: number;
  prompt: string;
  description: string;
  infoUrl: string | null;
  benchmark: string;
  template: GameTemplate;
  answerType: AnswerType;
  fields: Field[];
  phase: Phase;
  closingSoon: boolean;
  createdBy: string;
  createdByKey: string;
  createdAt: string;
  closesAt: string | null;
  closedAt: string | null;
  closedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  archiveAt: string | null;
  editedAt: string | null;
  /** nur gesetzt, wenn sich die Frage nach fremden Tipps geändert hat */
  promptEditedAt?: string | null;
  correctedAt: string | null;
  result: TipValues | null;
  winnerMode: 'auto' | 'manual' | null;   // nur text + aufgelöst
  ruleSummary: string;
  tipCount: number;
  canManage: boolean;
  answersRevealed: boolean;
  viewer: Viewer;
  tips: TipDTO[];         // sortiert nach scoreGame-Ordnung
  notYetTipped: string[]; // nur open
  deletedAt?: string;     // nur in /api/trash
  restoreUntil?: string;  // nur in /api/trash
};

export type PlayerDTO = { key: string; name: string; color: number; tipCount: number; lastTipAt: string | null; hidden?: boolean };

export type FormEntry = { gameId: number; resolvedAt: string; rank: number | null; isWinner: boolean };

export type PlayerStats = {
  key: string;
  name: string;
  tips: number;
  settled: number;
  wins: number;
  exact: number;
  winRate: number | null;
  rank: number | null;
  form: FormEntry[];      // neueste zuerst, max. 10
};

export type StatsDTO = { gameCount: number; resolvedCount: number; playerCount: number; tipCount: number; players: PlayerStats[] };

export type PushPrefs = { newGame: boolean; result: boolean; reminder: boolean; reminderHours: 1 | 2 | 6 | 24; creator: boolean };
export const DEFAULT_PUSH_PREFS: PushPrefs = { newGame: true, result: true, reminder: true, reminderHours: 2, creator: true };

export type Me = { name: string; key: string; isAdmin: boolean; known: boolean };

export type StateDTO = {
  serverTime: string;
  version: string;
  me: Me | null;
  games: GameDTO[];
  players: PlayerDTO[];
  stats: StatsDTO;
  config: { undoSeconds: number; vapidPublicKey: string; newGamePushDelaySeconds: number };
};

/** Eingabe für POST /api/games bzw. `patch` in PATCH /api/games/:id (ohne `name`). */
export type GameInput = {
  template: TemplateKey;
  prompt: string;
  description?: string;
  infoUrl?: string | null;
  benchmark?: string;
  answerType: AnswerType;
  fields: Field[];
  closesAt: string | null;
};

export type PreviewTip = { id: number; playerName: string; values: TipValues; distance: number | null; rank: number | null; isWinner: boolean };
export type ResolvePreview = {
  tips: PreviewTip[];
  winners: string[];
  suggestions?: { checked: number[]; similar: number[] };
};

export type ActivityEventDTO = {
  id: number;
  at: string;
  type: EventType;
  actorName: string | null;
  deviceTag: string | null;
  data: Record<string, unknown>;
  text: string;
};

// ---------------------------------------------------------------------------
// Events, SSE, Push
// ---------------------------------------------------------------------------

export type EventType =
  | 'game.created' | 'game.edited' | 'game.closed' | 'game.reopened' | 'game.resolved' | 'game.corrected'
  | 'game.deleted' | 'game.restored' | 'game.purged' | 'game.imported'
  | 'tip.created' | 'tip.undone' | 'tip.removed' | 'tip.restored'
  | 'player.updated' | 'import.completed'
  /** Verwalter ohne eigenen Tipp hat in der Auflösen-Vorschau alle Werte gesehen (sperrt danach seinen Tipp). */
  | 'game.previewed';

/** Typen, die per SSE `change` verschickt werden (§3.4). */
export type ChangeType = Exclude<EventType, 'game.purged' | 'game.imported' | 'game.previewed'>;

export type SseHello = { serverTime: string; version: string };
/** Payload von `event: change` – nie Tippwerte, nie Ergebnisse. */
export type SseChange = { type: ChangeType; gameId: number | null; at: string; actor: string | null; tipCount?: number };

export type PushKind = 'new_game' | 'reminder' | 'result' | 'correction' | 'creator_due' | 'creator_overdue' | 'test';

export type PushPayload = {
  v: 1;
  kind: PushKind;
  gameId: number | null;
  title: string;
  body: string;
  url: string;
  tag: string;
  renotify: boolean;
  badge?: number;
  actions: { action: 'tip' | 'resolve'; title: string }[];
};

// ---------------------------------------------------------------------------
// Fehler (§3.5)
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'VALIDATION' | 'NAME_REQUIRED' | 'NAME_INVALID' | 'DEVICE_REQUIRED' | 'ADMIN_TOKEN' | 'FORBIDDEN'
  | 'GAME_NOT_FOUND' | 'TIP_NOT_FOUND' | 'SUBSCRIPTION_NOT_FOUND' | 'NOT_FOUND'
  | 'TIP_EXISTS' | 'DEVICE_TIPPED' | 'GAME_CLOSED' | 'GAME_OPEN' | 'GAME_NOT_OPEN' | 'GAME_NOT_CLOSED'
  | 'GAME_RESOLVED' | 'GAME_NOT_RESOLVED' | 'GAME_ARCHIVED' | 'FIELDS_LOCKED' | 'UNDO_EXPIRED' | 'NOT_DELETED'
  | 'IMPORT_NOT_EMPTY' | 'PAYLOAD_TOO_LARGE' | 'IMPORT_INVALID' | 'IMPORT_MISMATCH' | 'RATE_LIMITED'
  | 'INTERNAL' | 'PUSH_FAILED' | 'UNAVAILABLE' | 'TIP_BLOCKED' | 'TIP_STALE';

export type ApiError = { error: { code: ErrorCode; message: string; field?: string; details?: string[] } };

// ---------------------------------------------------------------------------
// Legacy-Snapshot (§6.2)
// ---------------------------------------------------------------------------

export type SnapshotTip = {
  gameId: number;
  id: number;
  playerName: string;
  values: TipValues;      // nie null
  expected?: Score;       // nur v2, nur aufgelöste Wetten
};

export type SnapshotGame = {
  id: number;
  prompt: string;
  description: string;
  infoUrl: string | null;
  benchmark: string;
  answerType: AnswerType;
  fields: Field[];
  phase: Phase;
  createdBy: string;
  createdAt: string;      // 'YYYY-MM-DD HH:MM:SS' (UTC ohne Zone)
  resolvedAt: string | null;
  closesAt: string | null;
  archiveAt: string | null;
  result: TipValues | null;
  tips: SnapshotTip[];
};

export type Snapshot = {
  format?: 'tipplab-legacy-snapshot@2';
  source: string;
  fetchedAt: string;
  capturedAs?: string[];
  games: SnapshotGame[];
};
