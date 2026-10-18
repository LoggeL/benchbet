// Gemeinsame Helfer der Routen: Identität (§3.1), IDs, Spieler anlegen, Sicht des Betrachters.
import type { FastifyRequest } from 'fastify';
import { validateName } from '../../shared/names.ts';
import type { Player } from '../../shared/types.ts';
import type { Ctx } from '../app.ts';
import { iso } from '../clock.ts';
import type { Actor } from '../services/audit.ts';
import { loadWorld, makeView } from '../services/dto.ts';
import type { View } from '../services/dto.ts';
import { err } from '../services/errors.ts';

export type Who = { name: string; key: string };

export const bodyOf = (req: FastifyRequest): Record<string, unknown> =>
  req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {};

export const queryOf = (req: FastifyRequest): Record<string, string | undefined> =>
  (req.query && typeof req.query === 'object' ? req.query : {}) as Record<string, string | undefined>;

/** Lesende Routen: `?name=` optional; leer = ohne Namen, ungültig = 400 NAME_INVALID. */
export function optionalName(v: unknown): Who | null {
  if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
  const c = validateName(v);
  if (!c.ok) throw err.nameInvalid();
  return { name: c.name, key: c.key };
}

/** Schreibende Routen: `name` im Body ist Pflicht. */
export function requireName(body: Record<string, unknown>): Who {
  const v = body.name;
  if (v == null || (typeof v === 'string' && v.trim() === '')) throw err.nameRequired();
  const c = validateName(v);
  if (!c.ok) throw err.nameInvalid();
  return { name: c.name, key: c.key };
}

/** Header X-Device-Id (UUID; wir akzeptieren 8–100 sichtbare Zeichen). */
export function deviceIdOf(req: FastifyRequest): string | null {
  const h = req.headers['x-device-id'];
  const v = (Array.isArray(h) ? h[0] : h)?.trim();
  return v && /^[\x21-\x7e]{8,100}$/.test(v) ? v : null;
}

export function requireDevice(req: FastifyRequest): string {
  const d = deviceIdOf(req);
  if (!d) throw err.deviceRequired();
  return d;
}

/** `:id`-Parameter; alles andere als eine positive ganze Zahl → 404. */
export function idParam(req: FastifyRequest, notFound = err.gameNotFound): number {
  const raw = (req.params as Record<string, string>)?.id ?? '';
  if (!/^\d{1,15}$/.test(raw) || Number(raw) <= 0) throw notFound();
  return Number(raw);
}

/** Spieler anlegen, falls neu (nur bei schreibenden Aktionen: Tipp, Wette, Push-Abo). Farbe = Anzahl Spieler mod 8. */
export function ensurePlayer(ctx: Ctx, who: Who): Player {
  const existing = ctx.repo.getPlayer(who.key);
  if (existing) return existing;
  const p: Player = { key: who.key, name: who.name, color: ctx.repo.countPlayers() % 8, hidden: false, createdAt: iso(ctx.clock.now()) };
  ctx.repo.insertPlayer(p);
  return p;
}

/** Akteur fürs Audit: kanonischer Name, falls bekannt. */
export function actorOf(ctx: Ctx, who: Who, req: FastifyRequest): Actor {
  return { key: who.key, name: ctx.repo.getPlayer(who.key)?.name ?? who.name, deviceId: deviceIdOf(req) };
}

export const isAdmin = (ctx: Ctx, key: string | null): boolean => key !== null && ctx.config.adminKeys.has(key);

/** Sicht eines Betrachters auf den aktuellen Datenstand. */
export function viewFor(ctx: Ctx, viewerKey: string | null): View {
  return makeView(loadWorld(ctx.repo), {
    now: ctx.clock.now(),
    undoMs: ctx.config.undoSeconds * 1000,
    viewerKey,
    adminKeys: ctx.config.adminKeys,
    seen: viewerKey ? ctx.repo.seenGames(viewerKey) : new Set(),
  });
}

/** Sicherheits-Header für alle Antworten (§3.6). */
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

export function securityHeaders(): Record<string, string> {
  return {
    'content-security-policy': CSP,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  };
}
