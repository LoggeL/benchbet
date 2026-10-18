// Env → typisiertes Config-Objekt, Validierung beim Start (SPEC §7.4).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminKeys } from '../shared/names.ts';

export type Config = {
  port: number;
  host: string;
  dataDir: string;
  dbFile: string;
  publicUrl: string;
  adminNames: string;
  adminKeys: Set<string>;
  /** null = Admin-Routen aus (404) */
  adminToken: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string;
  displayTz: string;
  undoSeconds: number;
  newGamePushDelaySeconds: number;
  oneTipPerDevice: boolean;
  trashDays: number;
  logLevel: string;
  gitSha: string;
  /** `{package.version}+{GIT_SHA[0..7]}` */
  version: string;
  /** gebauter Client (dist/client); fehlt er, liefert der Server nur die API. */
  staticDir: string;
  /** Erlaubte Push-Dienste (Hostname oder Suffix); andere Endpoints → 400 (kein SSRF). */
  pushHosts: string[];
  /** Fastify trustProxy: Anzahl vertrauter Proxy-Hops (Default 1 = Traefik), true/false oder IP/CIDR-Liste. */
  trustProxy: boolean | number | string;
  /** Header with the real client IP set by an edge proxy (e.g. `cf-connecting-ip` behind Cloudflare); empty = req.ip. */
  clientIpHeader: string;
  /** In-Memory-Rate-Limit an/aus (Tests schalten es meist aus). */
  rateLimit: boolean;
  /** Wartezeit vor dem einen Retry bei 429/5xx/Netzfehler (§5.4). */
  pushRetryMs: number;
  /** Logging an/aus (Tests: aus). */
  logger: boolean;
};

export class ConfigError extends Error {}

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function packageVersion(): string {
  try {
    return (JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
}

function bool(v: string | undefined, def: boolean, name: string): boolean {
  if (v == null || v.trim() === '') return def;
  const s = v.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  throw new ConfigError(`${name} must be true or false (got: ${v}).`);
}

function int(v: string | undefined, def: number, name: string, min: number, max: number): number {
  if (v == null || v.trim() === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ConfigError(`${name} must be an integer between ${min} and ${max} (got: ${v}).`);
  return n;
}

/** Bekannte Web-Push-Dienste (Chrome/Edge-FCM, Firefox, Safari, Windows). */
export const DEFAULT_PUSH_HOSTS = [
  'fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com',
];

/** TRUST_PROXY: leer = 1 Hop; Zahl = Hops; true/false; sonst IP/CIDR-Liste (kommagetrennt). */
function trustProxy(v: string | undefined): boolean | number | string {
  const s = (v ?? '').trim();
  if (!s) return 1;
  if (/^\d{1,2}$/.test(s)) return Number(s);
  const l = s.toLowerCase();
  if (l === 'true') return true;
  if (l === 'false') return false;
  return s;
}

const str = (v: string | undefined, def: string): string => (v == null || v.trim() === '' ? def : v.trim());

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const dataDir = resolve(str(env.DATA_DIR, production ? '/app/data' : './data'));
  const dbFileRaw = str(env.DB_FILE, '');
  const dbFile = dbFileRaw === ':memory:' ? ':memory:' : dbFileRaw ? resolve(dbFileRaw) : resolve(dataDir, 'benchbet.db');
  const publicUrl = str(env.PUBLIC_URL, 'https://bet.logge.top').replace(/\/+$/, '');
  try {
    const u = new URL(publicUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new ConfigError(`PUBLIC_URL is not a valid http(s) URL (got: ${publicUrl}).`);
  }
  const adminToken = str(env.ADMIN_TOKEN, '') || null;
  if (adminToken !== null && adminToken.length < 32) {
    throw new ConfigError('ADMIN_TOKEN must be at least 32 characters (or empty, which disables the admin routes).');
  }
  const vapidPublicKey = str(env.VAPID_PUBLIC_KEY, '') || null;
  const vapidPrivateKey = str(env.VAPID_PRIVATE_KEY, '') || null;
  if ((vapidPublicKey === null) !== (vapidPrivateKey === null)) {
    throw new ConfigError('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY together (or leave both empty).');
  }
  const displayTz = str(env.DISPLAY_TZ, 'Europe/Berlin');
  try {
    new Intl.DateTimeFormat('de-DE', { timeZone: displayTz });
  } catch {
    throw new ConfigError(`DISPLAY_TZ is not a valid time zone (got: ${displayTz}).`);
  }
  const vapidSubject = str(env.VAPID_SUBJECT, publicUrl.startsWith('https:') ? publicUrl : 'https://bet.logge.top');
  if (!/^(https:\/\/|mailto:)./.test(vapidSubject)) throw new ConfigError(`VAPID_SUBJECT must start with https:// or mailto: (got: ${vapidSubject}).`);
  const adminNames = str(env.ADMIN_NAMES, 'Logge');
  let gitSha = str(env.GIT_SHA, 'dev');
  if (gitSha === 'dev') {
    // Docker builds without a commit hash write a content hash here (see Dockerfile).
    try { gitSha = readFileSync(fileURLToPath(new URL('../dist/build-sha', import.meta.url)), 'utf8').trim() || 'dev'; } catch { /* local dev */ }
  }
  return {
    port: int(env.PORT, 3000, 'PORT', 0, 65535),
    host: str(env.HOST, '0.0.0.0'),
    dataDir,
    dbFile,
    publicUrl,
    adminNames,
    adminKeys: adminKeys(adminNames),
    adminToken,
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
    displayTz,
    undoSeconds: int(env.TIP_UNDO_SECONDS, 5, 'TIP_UNDO_SECONDS', 0, 30),
    newGamePushDelaySeconds: int(env.NEW_GAME_PUSH_DELAY_SECONDS, 60, 'NEW_GAME_PUSH_DELAY_SECONDS', 0, 86400),
    oneTipPerDevice: bool(env.ONE_TIP_PER_DEVICE, true, 'ONE_TIP_PER_DEVICE'),
    trashDays: int(env.TRASH_DAYS, 30, 'TRASH_DAYS', 1, 3650),
    logLevel: str(env.LOG_LEVEL, 'info'),
    gitSha,
    version: `${packageVersion()}+${gitSha.slice(0, 7)}`,
    staticDir: str(env.STATIC_DIR, '') ? resolve(str(env.STATIC_DIR, '')) : resolve(ROOT, 'dist/client'),
    trustProxy: trustProxy(env.TRUST_PROXY),
    clientIpHeader: str(env.CLIENT_IP_HEADER, '').toLowerCase(),
    pushHosts: str(env.PUSH_ENDPOINT_HOSTS, '') ? str(env.PUSH_ENDPOINT_HOSTS, '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean) : DEFAULT_PUSH_HOSTS,
    rateLimit: bool(env.RATE_LIMIT, true, 'RATE_LIMIT'),
    pushRetryMs: 60_000,
    logger: true,
  };
}
