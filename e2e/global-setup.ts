// Startet den Server mit temporärem DATA_DIR und importiert die öffentliche Fixture (SPEC §7.6).
// Gibt eine Teardown-Funktion zurück, die den Server sicher beendet.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSnapshot } from '../test/helpers-shared.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
/** `ADMIN_TOKEN=e2e` laut SPEC, auf die geforderten ≥ 32 Zeichen verlängert. */
export const E2E_ADMIN_TOKEN = 'e2e-admin-token-0123456789abcdef0123';

async function waitForHealth(timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  let last = '';
  while (Date.now() < until) {
    try {
      const r = await fetch(`${BASE}/healthz`);
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  throw new Error(`e2e: server at ${BASE} not ready (${last}).`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(join(ROOT, 'dist/client/index.html'))) {
    throw new Error('e2e: dist/client missing – run `npm run build` first.');
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'benchbet-e2e-'));
  const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.ts'], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ADMIN_TOKEN: E2E_ADMIN_TOKEN,
      ADMIN_NAMES: 'Logge',
      PUBLIC_URL: BASE,
      LOG_LEVEL: 'warn',
      // every request comes from 127.0.0.1 – the per-IP limiter would throttle the smoke run
      RATE_LIMIT: 'false',
    },
  });
  const kill = () => { if (server.exitCode === null) server.kill('SIGTERM'); };
  process.once('exit', kill);

  try {
    await waitForHealth(20_000);
    const res = await fetch(`${BASE}/api/admin/import?mode=empty`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': E2E_ADMIN_TOKEN },
      body: JSON.stringify(toSnapshot()),
    });
    if (!res.ok) throw new Error(`e2e: import failed (HTTP ${res.status}): ${await res.text()}`);
  } catch (e) {
    kill();
    rmSync(dataDir, { recursive: true, force: true });
    throw e;
  }

  return async () => {
    kill();
    await new Promise<void>((res) => {
      if (server.exitCode !== null) return res();
      const t = setTimeout(() => { server.kill('SIGKILL'); res(); }, 5000);
      server.once('exit', () => { clearTimeout(t); res(); });
    });
    rmSync(dataDir, { recursive: true, force: true });
  };
}
