// SQLite über node:sqlite (SPEC §2.2): Öffnen, Pragmas, Migrationen, Transaktionen.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export type Db = DatabaseSync;

const MIGRATIONS_DIR = fileURLToPath(new URL('./migrations/', import.meta.url));

/** Öffnet die DB (Datei oder `:memory:`), setzt die Pragmas und spielt Migrationen ein. */
export function openDb(file: string): Db {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  migrate(db);
  return db;
}

/** Migrationen `NNN_name.sql` mit NNN > user_version, jede in einer Transaktion. */
export function migrate(db: Db): number {
  const current = Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
  let version = current;
  for (const f of files) {
    const n = Number(f.slice(0, 3));
    if (n <= current) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${n}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    version = n;
  }
  return version;
}

/** Führt fn in einer Transaktion aus (nicht verschachtelbar – innere Aufrufe laufen in der äußeren mit). */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}
