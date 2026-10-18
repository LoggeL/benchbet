// Verlaufstexte, englisch (SPEC §1.4.2.4, §3.3 /activity, docs/BRANDING.md).
import type { Field, TipValues } from '../../shared/types.ts';
import { formatAnswer, formatDate, joinNames } from '../../shared/format.ts';
import type { EventRow } from '../db/repo.ts';

const REASONS: Record<string, string> = { duplicate: 'duplicate', troll: 'troll', request: 'on request' };

const FIELD_NAMES: Record<string, string> = {
  prompt: 'the question',
  description: 'the rules',
  infoUrl: 'the source',
  benchmark: 'the topic',
  closesAt: 'the deadline',
  template: 'the template',
  answerType: 'the answer type',
  fields: 'the number fields',
};

type GameLite = { fields: readonly Field[] };
type Opts = { now: number; timeZone: string };

const answer = (g: GameLite, v: unknown): string => formatAnswer(g, (v ?? null) as TipValues | null);
const date = (v: unknown, o: Opts): string => (typeof v === 'string' ? formatDate(v, { now: o.now, timeZone: o.timeZone }) : '–');

export function activityText(e: EventRow, game: GameLite, o: Opts): string {
  const who = e.actorName ?? 'System';
  const d = e.data ?? {};
  switch (e.type) {
    case 'game.created':
      return `${who} created the bet.`;
    case 'game.edited': {
      const changes = (d.changes ?? {}) as Record<string, [unknown, unknown]>;
      const keys = Object.keys(changes);
      if (keys.length === 0) return `${who} edited the bet.`;
      const parts = keys.map((k) => {
        if (k === 'closesAt') {
          const next = changes[k]?.[1];
          return next ? `the deadline (now ${date(next, o)})` : 'the deadline (now none)';
        }
        return FIELD_NAMES[k] ?? k;
      });
      const extra = d.ownTipReset ? ' Their own guess was reset.' : '';
      return `${who} changed ${joinNames(parts)}.${extra}`;
    }
    case 'game.closed': {
      if (d.auto) return 'Bet closed automatically (deadline reached).';
      const planned = typeof d.plannedClosesAt === 'string' && Date.parse(d.plannedClosesAt) > Date.parse(e.at)
        ? ` (planned for ${date(d.plannedClosesAt, o)})` : '';
      return `${who} closed the bet${planned}.`;
    }
    case 'game.reopened':
      return d.closesAt ? `${who} reopened the bet, new deadline ${date(d.closesAt, o)}.` : `${who} reopened the bet, no fixed deadline.`;
    case 'game.resolved':
      return `${who} entered the result: ${answer(game, d.result)}.`;
    case 'game.corrected': {
      const before = (d.before ?? {}) as { result?: unknown };
      const after = (d.after ?? {}) as { result?: unknown };
      const reason = typeof d.reason === 'string' && d.reason.trim() ? ` Reason: “${d.reason.trim()}”.` : '';
      return `${who} corrected the result: ${answer(game, after.result)} (was ${answer(game, before.result)}).${reason}`;
    }
    case 'game.deleted':
      return `${who} deleted the bet.`;
    case 'game.restored':
      return `${who} restored the bet.`;
    case 'game.purged':
      return 'Bet permanently deleted.';
    case 'game.imported':
      return 'Imported from the old app.';
    case 'tip.created':
      return `${String(d.playerName ?? who)} placed a guess.`;
    case 'tip.undone':
      return `${String(d.playerName ?? who)} took back their guess.`;
    case 'tip.removed':
      return `${who} removed ${String(d.playerName ?? '?')}’s guess · ${REASONS[String(d.reason)] ?? String(d.reason ?? '')}.`;
    case 'tip.restored':
      return `${who} restored ${String(d.playerName ?? '?')}’s guess.`;
    case 'game.previewed':
      return `${who} saw all guesses in the resolve preview without having guessed, so they can’t guess on this bet anymore.`;
    case 'player.updated':
      return `${who} updated a player.`;
    case 'import.completed':
      return 'Import finished.';
    default:
      return e.type;
  }
}
