// Zentrale Test-Hilfen (SPEC §7.6): makeApp() mit :memory:-DB, fester Uhr, Fake-Push-Sender; toSnapshot().
import webpush from 'web-push';
import { buildApp } from '../server/app.ts';
import type { App } from '../server/app.ts';
import { loadConfig } from '../server/config.ts';
import type { Config } from '../server/config.ts';
import { openDb } from '../server/db/index.ts';
import type { PushOptions } from '../server/services/pushTexts.ts';
import type { PushTarget, SendResult, VapidKeys } from '../server/services/push.ts';
import type { Timers } from '../server/services/scheduler.ts';
import type { PushPayload } from '../shared/types.ts';
import { toSnapshot } from './helpers-shared.ts';

export { toSnapshot, loadFixture, fixtureLeaks, FIXTURE_PATH, LEGACY_SOURCE } from './helpers-shared.ts';
export type { LegacyApiGame, LegacyApiResponse, LegacyApiTip } from './helpers-shared.ts';

/** Stand der Fixture: Import am 18.10.2026 (kurz nach dem Abruf). */
export const FIXTURE_NOW = '2026-10-18T16:00:00.000Z';
export const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef-xyz';
export const DEVICE = 'device-aaaaaaaa-0000-4000-8000-000000000001';

let vapidCache: VapidKeys | null = null;
export const testVapid = (): VapidKeys => (vapidCache ??= webpush.generateVAPIDKeys());

/** Verstellbare Uhr. */
export class FakeClock {
  t: number;
  constructor(start: string | number) {
    this.t = typeof start === 'number' ? start : Date.parse(start);
  }
  now(): number {
    return this.t;
  }
  set(at: string | number): void {
    this.t = typeof at === 'number' ? at : Date.parse(at);
  }
  advance(ms: number): void {
    this.t += ms;
  }
  iso(): string {
    return new Date(this.t).toISOString();
  }
}

/** Manuelle Timer für den Scheduler: merkt sich geplante Callbacks, nichts läuft von selbst. */
export class FakeTimers implements Timers {
  next = 1;
  timeouts = new Map<number, { fn: () => void; ms: number }>();
  intervals = new Map<number, { fn: () => void; ms: number }>();
  setTimeout = (fn: () => void, ms: number): unknown => {
    const id = this.next++;
    this.timeouts.set(id, { fn, ms });
    return id;
  };
  clearTimeout = (t: unknown): void => void this.timeouts.delete(t as number);
  setInterval = (fn: () => void, ms: number): unknown => {
    const id = this.next++;
    this.intervals.set(id, { fn, ms });
    return id;
  };
  clearInterval = (t: unknown): void => void this.intervals.delete(t as number);
  /** Alle aktuell geplanten Timeouts ausführen (und entfernen). */
  fireTimeouts(): void {
    const list = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const t of list) t.fn();
  }
}

/** ASCII-Gerätekennung pro Name (wie eine UUID aus localStorage). */
export const deviceFor = (name: string, salt = 'tip'): string => `dev-${salt}-${Buffer.from(name).toString('hex')}-00000000`;

export type SentPush = { endpoint: string; payload: PushPayload; options: PushOptions };

export type MakeAppOptions = {
  now?: string | number;
  config?: Partial<Config>;
  /** Status je Endpoint (Default 201). */
  pushStatus?: (endpoint: string, payload: PushPayload) => number;
  timers?: Timers;
  /** Fixture direkt importieren. */
  fixture?: boolean;
};

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export function testConfig(overrides: Partial<Config> = {}): Config {
  const base = loadConfig({ NODE_ENV: 'test', DATA_DIR: '/nonexistent-benchbet-test', DB_FILE: ':memory:', ADMIN_TOKEN, ADMIN_NAMES: 'Logge', PUBLIC_URL: 'https://benchbet.test', GIT_SHA: 'test' });
  return { ...base, rateLimit: false, logger: false, pushRetryMs: 3_600_000, staticDir: '/nonexistent-benchbet-static', pushHosts: [...base.pushHosts, 'push.example'], ...overrides };
}

export async function makeApp(o: MakeAppOptions = {}) {
  const clock = new FakeClock(o.now ?? FIXTURE_NOW);
  const db = openDb(':memory:');
  const config = testConfig(o.config);
  const sent: SentPush[] = [];
  const statusFor = o.pushStatus ?? (() => 201);
  const pushSender = async (target: PushTarget, payload: string, options: PushOptions): Promise<SendResult> => {
    const p = JSON.parse(payload) as PushPayload;
    sent.push({ endpoint: target.endpoint, payload: p, options });
    return { status: statusFor(target.endpoint, p) };
  };
  const app: App = await buildApp({ db, config, clock, pushSender, vapid: testVapid(), timers: o.timers });
  const ctx = app.benchbet;

  type Res = { status: number; body: any; headers: Record<string, unknown>; text: string };
  async function request(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> {
    const res = await app.inject({
      method,
      url,
      headers: { 'x-device-id': DEVICE, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { payload: JSON.stringify(body) } : {}),
    });
    let parsed: unknown = null;
    try {
      parsed = res.body ? JSON.parse(res.body) : null;
    } catch {
      parsed = null;
    }
    return { status: res.statusCode, body: parsed, headers: res.headers as Record<string, unknown>, text: res.body };
  }

  const t = {
    app,
    ctx,
    db,
    clock,
    config,
    sent,
    get: (url: string, headers?: Record<string, string>) => request('GET', url, undefined, headers),
    post: (url: string, body: unknown = {}, headers?: Record<string, string>) => request('POST', url, body, headers),
    patch: (url: string, body: unknown = {}, headers?: Record<string, string>) => request('PATCH', url, body, headers),
    del: (url: string, body: unknown = {}, headers?: Record<string, string>) => request('DELETE', url, body, headers),
    /** Fixture (öffentliche Daten) per Admin-Route importieren. */
    async importFixture(query = 'mode=empty') {
      const r = await request('POST', `/api/admin/import?${query}`, toSnapshot(), { 'x-admin-token': ADMIN_TOKEN });
      if (r.status !== 200) throw new Error(`Import fehlgeschlagen: ${r.status} ${r.text}`);
      return r.body;
    },
    /** Wette anlegen (Default: AA-Vorlage, ohne Tippschluss). */
    async createGame(over: Record<string, unknown> = {}, name = 'Logge') {
      const r = await request('POST', '/api/games', {
        name, template: 'aa', prompt: 'Test model – AA Index', description: '', infoUrl: null, benchmark: 'AA Index',
        answerType: 'number', fields: [{ label: 'Score', unit: 'points', min: 0, max: 100, step: 0.1 }], closesAt: null, ...over,
      });
      if (r.status !== 201) throw new Error(`Anlegen fehlgeschlagen: ${r.status} ${r.text}`);
      return r.body.game as { id: number } & Record<string, any>;
    },
    async tip(gameId: number, name: string, values: unknown, device = deviceFor(name)) {
      return request('POST', '/api/tips', { name, gameId, values }, { 'x-device-id': device });
    },
    async subscribe(name: string, endpoint: string, prefs?: Record<string, unknown>, device = deviceFor(name, 'sub')) {
      const r = await request('POST', '/api/push/subscribe', {
        name, subscription: { endpoint, keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' } },
        ...(prefs ? { prefs } : {}),
      }, { 'x-device-id': device });
      if (r.status !== 201) throw new Error(`Subscribe fehlgeschlagen: ${r.status} ${r.text}`);
      await ctx.push.idle();
      return r.body as { subscriptionId: number };
    },
    async close() {
      await ctx.push.idle();
      await app.close();
      db.close();
    },
  };
  if (o.fixture) await t.importFixture();
  return t;
}
