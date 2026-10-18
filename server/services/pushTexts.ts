// Push-Texte (SPEC §5.4). Nie Tippwerte – nur Ergebnisse aufgelöster Wetten.
import type { Field, Game, PushKind, PushPayload, TipValues } from '../../shared/types.ts';
import { formatAnswer, formatDate, formatDuration, formatNumber, joinNames } from '../../shared/format.ts';
import { FROM_PUSH, paths } from '../../shared/routes.ts';

export const PAYLOAD_MAX_BYTES = 1024;
const HOUR = 3600;

export type PushOptions = { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic: string };
export type PushMessage = { payload: PushPayload; options: PushOptions };

type GameLite = Pick<Game, 'id' | 'prompt' | 'closesAt' | 'answerType'> & { fields: readonly Field[] };

const gameUrl = (id: number) => `${paths.bet(id)}?${FROM_PUSH}`;
const resolveUrl = (id: number) => paths.resolve(id);

function cut(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max - 1).join('').trimEnd() + '…';
}

function message(
  p: Omit<PushPayload, 'v' | 'actions' | 'renotify'> & { actions?: PushPayload['actions']; renotify?: boolean },
  ttlS: number,
  urgency: PushOptions['urgency'] = 'normal',
): PushMessage {
  const payload: PushPayload = { v: 1, kind: p.kind, gameId: p.gameId, title: p.title, body: p.body, url: p.url, tag: p.tag, renotify: !!p.renotify, actions: p.actions ?? [] };
  if (p.badge !== undefined) payload.badge = p.badge;
  return { payload: fitPayload(payload), options: { TTL: Math.max(0, Math.round(ttlS)), urgency, topic: topicOf(p.tag) } };
}

/** Topic-Header: max. 32 Zeichen aus dem URL-sicheren Base64-Alphabet. */
const topicOf = (tag: string): string => tag.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 32);

/** Hält die Payload ≤ 1 KB (kürzt erst body, dann title). */
export function fitPayload(p: PushPayload): PushPayload {
  const size = () => Buffer.byteLength(JSON.stringify(p));
  let body = p.body;
  while (size() > PAYLOAD_MAX_BYTES && [...body].length > 20) {
    body = cut(body, Math.floor([...body].length * 0.8));
    p = { ...p, body };
  }
  if (size() > PAYLOAD_MAX_BYTES) p = { ...p, title: cut(p.title, 60) };
  return p;
}

export function newGameMessage(g: GameLite, creator: string, o: { now: number; tz: string; badge?: number }): PushMessage {
  const body = g.closesAt
    ? `${g.prompt} · closes ${formatDate(g.closesAt, { now: o.now, timeZone: o.tz })}`
    : `${g.prompt} · Who’s first?`;
  return message({
    kind: 'new_game', gameId: g.id, title: `New bet from ${creator}`, body, url: gameUrl(g.id), tag: `game-${g.id}`,
    renotify: false, badge: o.badge, actions: [{ action: 'tip', title: 'Place guess' }],
  }, 24 * HOUR);
}

export function newGamesBundleMessage(games: GameLite[], creator: string, o: { badge?: number }): PushMessage {
  return message({
    kind: 'new_game', gameId: null, title: `${creator} opened ${games.length} new bets`,
    body: cut(games.map((g) => g.prompt).join(', '), 120), url: `/?${FROM_PUSH}`, tag: 'new-games', renotify: false, badge: o.badge,
  }, 24 * HOUR);
}

export function reminderMessage(g: GameLite, o: { now: number; othersTipped: number; badge?: number }): PushMessage {
  const left = Date.parse(g.closesAt!) - o.now;
  return message({
    kind: 'reminder', gameId: g.id, title: `${formatDuration(left)} left: ${g.prompt}`,
    body: o.othersTipped === 0 ? 'You haven’t placed a guess yet. Be the first.' : `You haven’t placed a guess yet. ${o.othersTipped} ${o.othersTipped === 1 ? 'other has' : 'others have'}.`,
    url: gameUrl(g.id), tag: `game-${g.id}`, renotify: true, badge: o.badge, actions: [{ action: 'tip', title: 'Place guess' }],
  }, Math.max(60, left / 1000), 'high');
}

/** „LZH wins“ / „LZH and Nöl win“. */
const winnersPhrase = (names: string[]): string => `${joinNames(names)} ${names.length > 1 ? 'win' : 'wins'}`;

export type Outcome = {
  /** Tipp des Empfängers (gewertet), null = nicht getippt */
  own: { distance: number | null; rank: number | null; isWinner: boolean } | null;
  /** Gewinner (kanonische Namen) */
  winners: string[];
  /** Name des Empfängers (für „with {andere Gewinner}“) */
  ownName: string | null;
};

/** Personalisierter Ergebnis-Body (§5.4, Tabelle „Ergebnis-Body“). */
export function resultBody(game: GameLite & { result: TipValues }, o: Outcome): string {
  const res = formatAnswer(game, game.result);
  const own = o.own;
  if (own?.isWinner) {
    const others = o.winners.filter((n) => n !== o.ownName);
    if (others.length > 0) return `🏆 Shared win with ${joinNames(others)} · ${res}`;
    if (own.distance === 0) return `🏆 Bullseye! ${res}`;
    return own.distance != null ? `🏆 You win! ${res} · ${formatNumber(own.distance)} off` : `🏆 You win! ${res}`;
  }
  if (o.winners.length === 0) return `${res} · Nobody wins this time.`;
  if (!own) return `${res} · ${winnersPhrase(o.winners)}.`;
  if (game.answerType === 'text') return `${res} · ${winnersPhrase(o.winners)} · Your answer doesn’t count`;
  return `${res} · ${winnersPhrase(o.winners)} · You: #${own.rank} (${formatNumber(own.distance ?? 0)} off)`;
}

export function resultMessage(game: GameLite & { result: TipValues }, o: Outcome & { badge?: number }): PushMessage {
  return message({
    kind: 'result', gameId: game.id, title: `Result: ${game.prompt}`, body: resultBody(game, o),
    url: gameUrl(game.id), tag: `game-${game.id}`, renotify: true, badge: o.badge,
  }, 7 * 24 * HOUR);
}

export function correctionMessage(game: GameLite, o: { before: TipValues | null; after: TipValues; winners: string[]; badge?: number }): PushMessage {
  const sentence = o.winners.length === 0 ? 'Nobody wins this time.' : `${winnersPhrase(o.winners)}.`;
  return message({
    kind: 'correction', gameId: game.id, title: `Correction: ${game.prompt}`,
    body: `New result ${formatAnswer(game, o.after)} (was ${formatAnswer(game, o.before)}). ${sentence}`,
    url: gameUrl(game.id), tag: `game-${game.id}`, renotify: true, badge: o.badge,
  }, 7 * 24 * HOUR);
}

export function creatorDueMessage(game: GameLite, o: { tipCount: number; badge?: number }): PushMessage {
  return message({
    kind: 'creator_due', gameId: game.id, title: `Closed: ${game.prompt}`,
    body: `${o.tipCount} ${o.tipCount === 1 ? 'guess' : 'guesses'} in. Enter the result once it’s official.`,
    url: resolveUrl(game.id), tag: `game-${game.id}`, renotify: true, badge: o.badge,
    actions: [{ action: 'resolve', title: 'Enter result' }],
  }, 7 * 24 * HOUR);
}

export function creatorOverdueMessage(game: GameLite, o: { badge?: number }): PushMessage {
  return message({
    kind: 'creator_overdue', gameId: game.id, title: `${game.prompt} needs a result`,
    body: 'Closed for 7 days. Everyone’s waiting for the reveal.', url: resolveUrl(game.id), tag: `game-${game.id}`,
    renotify: false, badge: o.badge, actions: [{ action: 'resolve', title: 'Enter result' }],
  }, 7 * 24 * HOUR);
}

export function testMessage(o: { badge?: number } = {}): PushMessage {
  return message({ kind: 'test', gameId: null, title: 'Push works.', body: 'You won’t miss a bet from now on.', url: '/', tag: 'test', renotify: false, badge: o.badge }, HOUR);
}

/** 413 vom Push-Dienst: body auf 80 Zeichen kürzen (§5.4). */
export const shortened = (p: PushPayload): PushPayload => ({ ...p, body: cut(p.body, 80) });

export type { PushKind };
