-- 001_init.sql (SPEC §2.2)
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- vapid_public_key, imported_at, imported_source

CREATE TABLE players (
  key         TEXT PRIMARY KEY,                 -- nameKey()
  name        TEXT NOT NULL,                    -- kanonischer Anzeigename
  color       INTEGER NOT NULL CHECK (color BETWEEN 0 AND 7),
  hidden      INTEGER NOT NULL DEFAULT 0,       -- 1 = nicht im NamePicker (Admin)
  created_at  TEXT NOT NULL
);

CREATE TABLE games (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,  -- Legacy-IDs bleiben erhalten
  prompt               TEXT NOT NULL CHECK (length(prompt) BETWEEN 1 AND 160),
  description          TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  info_url             TEXT CHECK (info_url IS NULL OR length(info_url) <= 2000),
  benchmark            TEXT NOT NULL DEFAULT '' CHECK (length(benchmark) <= 80),
  template             TEXT NOT NULL DEFAULT 'number',     -- aa|api|codename|price|percent|multi|number|text|legacy
  answer_type          TEXT NOT NULL CHECK (answer_type IN ('number','text')),
  fields_json          TEXT NOT NULL DEFAULT '[]',          -- [{label,unit,min,max,step}] (Zahlen), text: []
  created_by_key       TEXT NOT NULL REFERENCES players(key),
  created_by_name      TEXT NOT NULL,                       -- Schreibweise bei Anlage
  created_at           TEXT NOT NULL,
  closes_at            TEXT,                                -- geplanter Tippschluss
  closed_at            TEXT,                                -- tatsächlicher Schluss (manuell, automatisch oder beim Auflösen)
  closed_by            TEXT,                                -- Name, NULL = automatisch
  resolved_at          TEXT,
  resolved_by          TEXT,
  result_json          TEXT,                                -- number[] | string
  winner_tip_ids_json  TEXT,                                -- nur text: int[] = manuelle Wahl; NULL = automatisch
  corrected_at         TEXT,
  edited_at            TEXT,                                -- letzte Bearbeitung nach dem ersten fremden Tipp
  deleted_at           TEXT,
  deleted_by           TEXT,
  push_new_sent_at     TEXT,                                -- Push „Neue Wette“ verschickt (Import: Importzeit)
  creator_due_sent_at  TEXT,                                -- Push „Tippschluss erreicht“ an Ersteller
  creator_overdue_sent_at TEXT                              -- Push „wartet seit 7 Tagen aufs Ergebnis“
);
CREATE INDEX games_open ON games(resolved_at, closed_at, closes_at) WHERE deleted_at IS NULL;

CREATE TABLE tips (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,         -- Legacy-IDs bleiben erhalten
  game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_key      TEXT NOT NULL REFERENCES players(key),
  player_name     TEXT NOT NULL,                             -- Schreibweise bei Abgabe
  values_json     TEXT NOT NULL,                             -- number[] | string
  created_at      TEXT,                                      -- NULL bei Legacy-Tipps
  device_id       TEXT,                                      -- NULL bei Legacy-Tipps
  removed_at      TEXT,                                      -- Moderation (soft)
  removed_by      TEXT,
  removed_reason  TEXT CHECK (removed_reason IS NULL OR removed_reason IN ('duplicate','troll','request'))
);
CREATE UNIQUE INDEX tips_one_per_player ON tips(game_id, player_key) WHERE removed_at IS NULL;
CREATE UNIQUE INDEX tips_one_per_device ON tips(game_id, device_id) WHERE removed_at IS NULL AND device_id IS NOT NULL;
CREATE INDEX tips_player ON tips(player_key);

CREATE TABLE result_seen (
  player_key  TEXT NOT NULL REFERENCES players(key),
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seen_at     TEXT NOT NULL,
  PRIMARY KEY (player_key, game_id)
);

CREATE TABLE push_subscriptions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  player_key       TEXT NOT NULL REFERENCES players(key),
  device_id        TEXT NOT NULL,
  prefs_json       TEXT NOT NULL,     -- {"newGame":true,"result":true,"reminder":true,"reminderHours":2,"creator":true}
  user_agent       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  last_success_at  TEXT,
  last_error_at    TEXT,
  last_error       TEXT,
  fail_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX push_by_player ON push_subscriptions(player_key);

CREATE TABLE push_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  kind             TEXT NOT NULL,     -- new_game|reminder|result|correction|creator_due|creator_overdue|test
  game_id          INTEGER,
  subscription_id  INTEGER,
  dedupe_key       TEXT UNIQUE,       -- "{kind}:{gameId}:{subscriptionId}" (test: NULL)
  status           INTEGER,           -- HTTP-Status des Push-Dienstes
  created_at       TEXT NOT NULL
);

CREATE TABLE events (                 -- Audit/Verlauf + Quelle für SSE
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at          TEXT NOT NULL,
  type        TEXT NOT NULL,          -- siehe §2.10
  game_id     INTEGER,
  tip_id      INTEGER,
  actor_key   TEXT,
  actor_name  TEXT,                   -- NULL = System
  device_tag  TEXT,                   -- 6 Hex
  data_json   TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX events_game ON events(game_id, id);
