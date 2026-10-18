// Einstieg: Config lesen, DB öffnen, buildApp(), listen, Scheduler starten, SIGTERM → close (SPEC §7.1).
import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError, loadConfig } from './config.ts';
import type { Config } from './config.ts';
import { openDb } from './db/index.ts';
import { buildApp } from './app.ts';

function fatal(msg: string): never {
  console.error(msg);
  process.exit(1);
}

let config: Config;
try {
  config = loadConfig(process.env);
} catch (e) {
  fatal(e instanceof ConfigError ? `Config error: ${e.message}` : String(e));
}

// DATA_DIR muss beschreibbar sein (Docker-Volume-Rechte)
try {
  mkdirSync(config.dataDir, { recursive: true });
  accessSync(config.dataDir, constants.W_OK);
  const probe = join(config.dataDir, `.write-test-${process.pid}`);
  writeFileSync(probe, 'ok');
  rmSync(probe, { force: true });
} catch {
  fatal(`DATA_DIR ${config.dataDir} is not writable (volume permissions? owner must be uid 1000).`);
}

const db = openDb(config.dbFile);
const app = await buildApp({ db, config });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (e) {
  app.log.error({ err: e }, 'Server start failed');
  db.close();
  process.exit(1);
}
app.log.info({ version: config.version, dataDir: config.dataDir }, 'BenchBet is running');
void app.benchbet.scheduler.start();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'Shutting down');
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await app.close();
    await app.benchbet.push.idle();
  } finally {
    try {
      db.close();
    } catch {
      /* schon zu */
    }
    clearTimeout(force);
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
