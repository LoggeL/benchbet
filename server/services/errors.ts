// Einheitliches Fehlerformat (SPEC §3.1, §3.5).
import type { FastifyError, FastifyInstance } from 'fastify';
import type { ErrorCode } from '../../shared/types.ts';
import { NAME_INVALID_MESSAGE } from '../../shared/names.ts';

export const MESSAGES = {
  NAME_REQUIRED: 'Who are you? Pick a name first.',
  NAME_INVALID: NAME_INVALID_MESSAGE,
  DEVICE_REQUIRED: 'Device ID missing. Reload the page and try again.',
  ADMIN_TOKEN: 'Admin token missing or wrong.',
  GAME_NOT_FOUND: 'This bet doesn’t exist anymore.',
  TIP_NOT_FOUND: 'This guess doesn’t exist anymore.',
  SUBSCRIPTION_NOT_FOUND: 'Push isn’t set up for this device.',
  NOT_FOUND: 'Nothing here.',
  TIP_EXISTS: 'You’ve already placed a guess on this one.',
  DEVICE_TIPPED: 'This device already placed a guess on this one.',
  GAME_CLOSED: 'Too late – this bet is closed.',
  GAME_OPEN: 'Close the bet first.',
  GAME_NOT_OPEN: 'This bet is already closed.',
  GAME_NOT_CLOSED: 'Only closed, unresolved bets can be reopened.',
  GAME_RESOLVED: 'This bet is already resolved.',
  GAME_NOT_RESOLVED: 'This bet isn’t resolved yet.',
  GAME_ARCHIVED: 'Only an admin can correct archived bets.',
  UNDO_EXPIRED: 'Too late to undo – your guess is locked in.',
  NOT_DELETED: 'This bet isn’t deleted.',
  IMPORT_NOT_EMPTY: 'The database already has bets. Use mode=replace to overwrite.',
  PAYLOAD_TOO_LARGE: 'That’s too much at once.',
  IMPORT_INVALID: 'The snapshot is invalid.',
  IMPORT_MISMATCH: 'Recomputed scores don’t match the legacy data.',
  RATE_LIMITED: 'Whoa, slow down. Take a breath and try again.',
  INTERNAL: 'Something went wrong. Please try again.',
  UNAVAILABLE: 'We’re a bit overloaded. Try again in a moment.',
  BAD_REQUEST: 'We couldn’t process that request.',
  TIP_PREVIEWED: 'You’ve already seen everyone’s guesses in the resolve preview, so you’re out on this one.',
  TIP_REMOVED: 'Your guess on this bet was removed. Ask whoever manages it to restore it.',
  TIP_STALE: 'The bet changed since this guess was placed, so it can’t come back.',
  OWN_TIP_MODERATION: 'That’s your own guess – use Undo right after placing it instead.',
} as const;

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  field: string | undefined;
  details: string[] | undefined;
  headers: Record<string, string> | undefined;
  constructor(status: number, code: ErrorCode, message: string, extra: { field?: string; details?: string[]; headers?: Record<string, string> } = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.field = extra.field;
    this.details = extra.details;
    this.headers = extra.headers;
  }
  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.field ? { field: this.field } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

const e = (status: number, code: ErrorCode, message: string, extra?: { field?: string; details?: string[] }) => new AppError(status, code, message, extra);

/** Fabriken für alle Fehler aus §3.5. */
export const err = {
  validation: (message: string, field?: string) => e(400, 'VALIDATION', message, field ? { field } : {}),
  nameRequired: () => e(400, 'NAME_REQUIRED', MESSAGES.NAME_REQUIRED, { field: 'name' }),
  nameInvalid: () => e(400, 'NAME_INVALID', MESSAGES.NAME_INVALID, { field: 'name' }),
  deviceRequired: () => e(400, 'DEVICE_REQUIRED', MESSAGES.DEVICE_REQUIRED),
  adminToken: () => e(401, 'ADMIN_TOKEN', MESSAGES.ADMIN_TOKEN),
  forbidden: (who: string) => e(403, 'FORBIDDEN', `Only ${who} can do that.`),
  gameNotFound: () => e(404, 'GAME_NOT_FOUND', MESSAGES.GAME_NOT_FOUND),
  tipNotFound: () => e(404, 'TIP_NOT_FOUND', MESSAGES.TIP_NOT_FOUND),
  subscriptionNotFound: () => e(404, 'SUBSCRIPTION_NOT_FOUND', MESSAGES.SUBSCRIPTION_NOT_FOUND),
  notFound: () => e(404, 'NOT_FOUND', MESSAGES.NOT_FOUND),
  tipExists: () => e(409, 'TIP_EXISTS', MESSAGES.TIP_EXISTS),
  deviceTipped: () => e(409, 'DEVICE_TIPPED', MESSAGES.DEVICE_TIPPED),
  gameClosed: () => e(409, 'GAME_CLOSED', MESSAGES.GAME_CLOSED),
  gameOpen: () => e(409, 'GAME_OPEN', MESSAGES.GAME_OPEN),
  gameNotOpen: () => e(409, 'GAME_NOT_OPEN', MESSAGES.GAME_NOT_OPEN),
  gameNotClosed: () => e(409, 'GAME_NOT_CLOSED', MESSAGES.GAME_NOT_CLOSED),
  gameResolved: () => e(409, 'GAME_RESOLVED', MESSAGES.GAME_RESOLVED),
  gameNotResolved: () => e(409, 'GAME_NOT_RESOLVED', MESSAGES.GAME_NOT_RESOLVED),
  gameArchived: () => e(409, 'GAME_ARCHIVED', MESSAGES.GAME_ARCHIVED),
  fieldsLocked: (n: number) => e(409, 'FIELDS_LOCKED', `Locked – ${n} ${n === 1 ? 'person has' : 'people have'} already placed a guess. Changing it now wouldn’t be fair.`, { field: 'fields' }),
  tipPreviewed: () => e(409, 'TIP_BLOCKED', MESSAGES.TIP_PREVIEWED),
  tipRemoved: () => e(409, 'TIP_BLOCKED', MESSAGES.TIP_REMOVED),
  tipStale: () => e(409, 'TIP_STALE', MESSAGES.TIP_STALE),
  ownTipModeration: () => e(403, 'FORBIDDEN', MESSAGES.OWN_TIP_MODERATION),
  undoExpired: () => e(409, 'UNDO_EXPIRED', MESSAGES.UNDO_EXPIRED),
  notDeleted: () => e(409, 'NOT_DELETED', MESSAGES.NOT_DELETED),
  importNotEmpty: () => e(409, 'IMPORT_NOT_EMPTY', MESSAGES.IMPORT_NOT_EMPTY),
  payloadTooLarge: () => e(413, 'PAYLOAD_TOO_LARGE', MESSAGES.PAYLOAD_TOO_LARGE),
  importInvalid: (details: string[]) => e(422, 'IMPORT_INVALID', MESSAGES.IMPORT_INVALID, { details }),
  importMismatch: (details: string[]) => e(422, 'IMPORT_MISMATCH', MESSAGES.IMPORT_MISMATCH, { details }),
  rateLimited: (retryAfterS: number) => new AppError(429, 'RATE_LIMITED', MESSAGES.RATE_LIMITED, { headers: { 'retry-after': String(retryAfterS) } }),
  internal: () => e(500, 'INTERNAL', MESSAGES.INTERNAL),
  pushFailed: () => e(502, 'PUSH_FAILED', 'The push service didn’t accept the test push.'),
  unavailable: () => e(503, 'UNAVAILABLE', MESSAGES.UNAVAILABLE),
};

/** Fastify-Fehler (Parser, Body-Limit, Schema) und AppErrors ins Einheitsformat übersetzen. */
export function installErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      if (error.headers) reply.headers(error.headers);
      return reply.code(error.status).send(error.toJSON());
    }
    const fe = error as FastifyError;
    const status = typeof fe.statusCode === 'number' ? fe.statusCode : 500;
    if (fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE' || status === 413) {
      return reply.code(413).send(err.payloadTooLarge().toJSON());
    }
    if (fe.validation || fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || fe.code === 'FST_ERR_CTP_EMPTY_JSON_BODY' ||
        fe.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || (status >= 400 && status < 500)) {
      const code = status === 415 ? 415 : 400;
      return reply.code(code).send(new AppError(code, 'VALIDATION', MESSAGES.BAD_REQUEST).toJSON());
    }
    request.log.error({ err: error }, 'Unexpected error');
    return reply.code(500).send(err.internal().toJSON());
  });
}
