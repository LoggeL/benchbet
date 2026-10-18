// Legacy-Import (SPEC §6.2–§6.4): Strukturprüfung, Abbildung, Wertungsabgleich – alles in einer Transaktion.
// Berichte und Fehlermeldungen nennen nie Tippwerte (nur IDs, Namen, Anzahlen).
import type { AnswerType, Field, Game, Phase, Score, SnapshotGame, TipValues } from '../../shared/types.ts';
import { cleanName, nameKey, validateName } from '../../shared/names.ts';
import { archiveAt, phaseOf } from '../../shared/phase.ts';
import { normalizeUrl, onStep } from '../../shared/parse.ts';
import { scoreGame } from '../../shared/scoring.ts';
import { statsTable } from '../../shared/stats.ts';
import type { StatsRow } from '../../shared/stats.ts';
import { charLength } from '../../shared/names.ts';
import type { Repo } from '../db/repo.ts';
import type { Clock } from '../clock.ts';
import { iso } from '../clock.ts';
import type { Audit } from './audit.ts';
import { loadWorld, statsOf } from './dto.ts';
import { err } from './errors.ts';


// The old app was German; translate its built-in field words for the English UI.
const LEGACY_WORDS: Record<string, string> = { Punkte: 'points', Wert: 'Value' };
export type ImportMode = 'empty' | 'replace';
export type ImportOptions = { mode: ImportMode; dryRun: boolean; force: boolean };

export type ScoringMismatch = { gameId: number; tipId: number; field: 'distance' | 'rank' | 'isWinner'; expected: unknown; actual: unknown };

export type ImportReport = {
  ok: true;
  dryRun: boolean;
  mode: ImportMode;
  format: string;
  imported: { games: number; tips: number; players: number };
  sequence: { games: number; tips: number };
  checks: {
    phases: { ok: number; changed: { id: number; legacy: Phase; now: Phase; note: string }[]; warnings: { id: number; legacy: Phase; now: Phase }[] };
    archiveAt: { ok: number; mismatches: { id: number; legacy: string; computed: string | null }[] };
    scoring: { compared: number; mismatches: ScoringMismatch[] };
    stats: { gameCount: number; resolvedCount: number; playerCount: number; tipCount: number; table: StatsRow[] };
  };
  warnings: string[];
};

type NTip = { id: number; gameId: number; playerName: string; values: TipValues; expected: Score | null };
type NGame = Omit<SnapshotGame, 'tips' | 'createdAt' | 'resolvedAt' | 'closesAt' | 'archiveAt'> & {
  createdAt: string; resolvedAt: string | null; closesAt: string | null; archiveAt: string | null; tips: NTip[];
};
type NSnapshot = { format: string; source: string; fetchedAt: string; games: NGame[] };

const PHASES = new Set(['open', 'closed', 'resolved', 'archived']);
const KNOWN_ROOT = new Set(['format', 'source', 'fetchedAt', 'capturedAs', 'games']);
const KNOWN_GAME = new Set(['id', 'prompt', 'description', 'infoUrl', 'benchmark', 'answerType', 'fields', 'phase', 'createdBy', 'createdAt', 'resolvedAt', 'closesAt', 'archiveAt', 'result', 'tips']);
const KNOWN_TIP = new Set(['gameId', 'id', 'playerName', 'values', 'expected']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** 'YYYY-MM-DD HH:MM:SS' (UTC ohne Zone, SQLite) oder ISO → ISO mit `.000Z`. undefined = ungültig. */
export function legacyTime(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const s = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(v.trim()) ? v.trim().replace(' ', 'T') + 'Z' : v.trim();
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

/** Strukturprüfung (§6.4). Liefert normalisierten Snapshot oder alle Befunde. */
export function checkSnapshot(input: unknown): { ok: true; snap: NSnapshot; warnings: string[] } | { ok: false; details: string[] } {
  const details: string[] = [];
  const warnings: string[] = [];
  const unknown = new Set<string>();
  if (!isObj(input)) return { ok: false, details: ['The snapshot must be a JSON object.'] };
  for (const k of Object.keys(input)) if (!KNOWN_ROOT.has(k)) unknown.add(k);
  if (typeof input.source !== 'string' || !input.source.trim()) details.push('source is missing.');
  const fetchedAt = legacyTime(input.fetchedAt);
  if (!fetchedAt) details.push('fetchedAt is missing or not a valid time.');
  if (input.format !== undefined && input.format !== 'tipplab-legacy-snapshot@2') details.push(`Unknown format: ${String(input.format)}.`);
  if (!Array.isArray(input.games)) return { ok: false, details: [...details, 'games is missing or not a list.'] };

  const gameIds = new Set<number>();
  const tipIds = new Set<number>();
  const games: NGame[] = [];
  input.games.forEach((raw, i) => {
    const where = `games[${i}]`;
    if (!isObj(raw)) return void details.push(`${where}: not an object.`);
    for (const k of Object.keys(raw)) if (!KNOWN_GAME.has(k)) unknown.add(`games[].${k}`);
    const id = raw.id;
    const label = isInt(id) ? `Bet ${id}` : where;
    if (!isInt(id)) details.push(`${where}: id must be a positive integer.`);
    else if (gameIds.has(id)) details.push(`${label}: duplicate id.`);
    else gameIds.add(id);
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    if (!prompt || charLength(prompt) > 160) details.push(`${label}: prompt is missing or longer than 160 characters.`);
    const description = raw.description == null ? '' : raw.description;
    if (typeof description !== 'string' || charLength(description) > 2000) details.push(`${label}: invalid description.`);
    // Nur http/https (§3.6) – sonst landete z. B. javascript: im href
    const infoUrl = normalizeUrl(raw.infoUrl);
    if (infoUrl === undefined) details.push(`${label}: invalid infoUrl (http/https only).`);
    const benchmark = raw.benchmark == null ? '' : raw.benchmark;
    if (typeof benchmark !== 'string' || charLength(benchmark) > 80) details.push(`${label}: invalid benchmark.`);
    const answerType = raw.answerType;
    if (answerType !== 'number' && answerType !== 'text') details.push(`${label}: answerType must be number or text.`);
    let fields: Field[] = [];
    if (!Array.isArray(raw.fields)) details.push(`${label}: fields is missing.`);
    else if (answerType === 'text' && raw.fields.length !== 0) details.push(`${label}: text bets have no fields.`);
    else if (answerType === 'number') {
      if (raw.fields.length < 1 || raw.fields.length > 4) details.push(`${label}: expected 1 to 4 fields.`);
      fields = raw.fields.map((f: unknown, j: number) => {
        const o = isObj(f) ? f : {};
        const fl = { label: LEGACY_WORDS[String(o.label ?? '')] ?? String(o.label ?? ''), unit: LEGACY_WORDS[String(o.unit ?? '')] ?? String(o.unit ?? ''), min: Number(o.min), max: Number(o.max), step: Number(o.step) };
        if (!fl.label || ![fl.min, fl.max, fl.step].every(Number.isFinite) || !(fl.min < fl.max) || !(fl.step > 0)) {
          details.push(`${label}: invalid fields[${j}].`);
        }
        return fl;
      });
    }
    const phase = raw.phase;
    if (typeof phase !== 'string' || !PHASES.has(phase)) details.push(`${label}: invalid phase.`);
    const creator = validateName(raw.createdBy);
    if (!creator.ok) details.push(`${label}: invalid createdBy.`);
    const createdAt = legacyTime(raw.createdAt);
    if (!createdAt) details.push(`${label}: createdAt is missing or invalid.`);
    const resolvedAt = legacyTime(raw.resolvedAt);
    if (resolvedAt === undefined) details.push(`${label}: invalid resolvedAt.`);
    const closesAt = legacyTime(raw.closesAt);
    if (closesAt === undefined) details.push(`${label}: invalid closesAt.`);
    const archive = legacyTime(raw.archiveAt);
    if (archive === undefined) details.push(`${label}: invalid archiveAt.`);
    const valueOk = (v: unknown): v is TipValues =>
      answerType === 'text'
        ? typeof v === 'string' && charLength(v.trim()) >= 1 && charLength(v.trim()) <= 160
        : Array.isArray(v) && v.length === fields.length && v.every(finite);
    const result = raw.result ?? null;
    if (result !== null && !valueOk(result)) details.push(`${label}: result doesn’t match the type.`);
    if (resolvedAt && result === null) details.push(`${label}: resolved, but no result.`);
    if (!resolvedAt && result !== null) warnings.push(`${label}: result without resolvedAt is ignored.`);

    const tips: NTip[] = [];
    const keys = new Set<string>();
    if (!Array.isArray(raw.tips)) details.push(`${label}: tips is missing.`);
    else raw.tips.forEach((rt: unknown, j: number) => {
      const tw = `${label}, tips[${j}]`;
      if (!isObj(rt)) return void details.push(`${tw}: not an object.`);
      for (const k of Object.keys(rt)) if (!KNOWN_TIP.has(k)) unknown.add(`tips[].${k}`);
      const tid = rt.id;
      const tl = isInt(tid) ? `${label}, guess ${tid}` : tw;
      if (!isInt(tid)) details.push(`${tw}: id must be a positive integer.`);
      else if (tipIds.has(tid)) details.push(`${tl}: id doppelt.`);
      else tipIds.add(tid);
      if (rt.gameId !== id) details.push(`${tl}: gameId doesn’t match the bet.`);
      const pn = validateName(rt.playerName);
      if (!pn.ok) details.push(`${tl}: invalid playerName.`);
      else if (keys.has(pn.key)) details.push(`${tl}: more than one guess from ${pn.name}.`);
      else keys.add(pn.key);
      if (rt.values == null) details.push(`${tl}: values missing (hidden value not captured?).`);
      else if (!valueOk(rt.values)) details.push(`${tl}: values don’t match the type.`);
      else if (answerType === 'number') {
        const vs = rt.values as number[];
        if (vs.some((v, k) => v < fields[k]!.min || v > fields[k]!.max)) warnings.push(`${tl}: value out of range (imported anyway).`);
        else if (vs.some((v, k) => !onStep(v, fields[k]!.min, fields[k]!.step))) warnings.push(`${tl}: value off the step grid (imported anyway).`);
      }
      let expected: Score | null = null;
      if (rt.expected != null) {
        const ex = rt.expected;
        if (!isObj(ex) || !(ex.distance === null || finite(ex.distance)) || !(ex.rank === null || Number.isInteger(ex.rank)) || typeof ex.isWinner !== 'boolean') {
          details.push(`${tl}: invalid expected.`);
        } else expected = { distance: ex.distance as number | null, rank: ex.rank as number | null, isWinner: ex.isWinner };
      }
      tips.push({
        id: tid as number,
        gameId: id as number,
        playerName: pn.ok ? cleanName(String(rt.playerName)) : '',
        values: (answerType === 'number' && Array.isArray(rt.values) ? (rt.values as unknown[]).map(Number) : rt.values) as TipValues,
        expected,
      });
    });

    games.push({
      id: id as number, prompt, description: String(description ?? ''), infoUrl: infoUrl as string | null, benchmark: String(benchmark ?? '').trim(),
      answerType: answerType as AnswerType, fields, phase: phase as Phase, createdBy: creator.ok ? creator.name : '',
      createdAt: createdAt ?? '', resolvedAt: resolvedAt ?? null, closesAt: closesAt ?? null, archiveAt: archive ?? null,
      result: resolvedAt ? (result as TipValues | null) : null, tips,
    });
  });
  if (unknown.size > 0) warnings.unshift(`Unbekannte Felder ignoriert: ${[...unknown].sort().join(', ')}`);
  if (details.length > 0) return { ok: false, details };
  return {
    ok: true,
    snap: { format: typeof input.format === 'string' ? input.format : 'tipplab-legacy-snapshot@1', source: String(input.source).trim(), fetchedAt: fetchedAt!, games },
    warnings,
  };
}

/** Spieler aus allen createdBy + playerName: häufigste Schreibweise, Farbe nach erstem Auftreten (§6.3). */
function derivePlayers(games: NGame[]): { key: string; name: string; firstAt: string }[] {
  type Occ = { key: string; name: string; t: number; order: number };
  const occ: Occ[] = [];
  for (const g of games) {
    const t = Date.parse(g.createdAt);
    occ.push({ key: nameKey(g.createdBy), name: g.createdBy, t, order: -1 });
    for (const tip of g.tips) occ.push({ key: nameKey(tip.playerName), name: tip.playerName, t, order: tip.id });
  }
  occ.sort((a, b) => a.t - b.t || a.order - b.order);
  const byKey = new Map<string, { firstAt: number; spellings: Map<string, { count: number; first: number }> }>();
  occ.forEach((o, i) => {
    let p = byKey.get(o.key);
    if (!p) {
      p = { firstAt: o.t, spellings: new Map() };
      byKey.set(o.key, p);
    }
    const sp = p.spellings.get(o.name) ?? { count: 0, first: i };
    sp.count++;
    p.spellings.set(o.name, sp);
  });
  return [...byKey.entries()].map(([key, p]) => {
    const best = [...p.spellings.entries()].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)[0]!;
    return { key, name: best[0], firstAt: new Date(p.firstAt).toISOString() };
  });
}

const sameDistance = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-9);

export function importSnapshot(
  deps: { repo: Repo; audit: Audit; clock: Clock },
  input: unknown,
  opts: ImportOptions,
): { report: ImportReport; completedEventId: number | null } {
  const { repo, audit, clock } = deps;
  const checked = checkSnapshot(input);
  if (!checked.ok) throw err.importInvalid(checked.details);
  const { snap, warnings } = checked;
  if (opts.mode === 'empty' && repo.countGames() > 0) throw err.importNotEmpty();

  const now = clock.now();
  const at = iso(now);
  const db = repo.db;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (opts.mode === 'replace') {
      db.exec('DELETE FROM result_seen; DELETE FROM tips; DELETE FROM events; DELETE FROM games;');
    }
    // Spieler
    const derived = derivePlayers(snap.games);
    let base = repo.countPlayers();
    for (const p of derived) {
      const existing = repo.getPlayer(p.key);
      if (existing) repo.updatePlayer(p.key, { name: p.name });
      else repo.insertPlayer({ key: p.key, name: p.name, color: base++ % 8, hidden: false, createdAt: p.firstAt });
    }
    // Wetten + Tipps
    const domain: Game[] = [];
    let tipCount = 0;
    for (const g of snap.games) {
      let closedAt: string | null = null;
      if (g.resolvedAt) closedAt = g.closesAt && Date.parse(g.closesAt) <= Date.parse(g.resolvedAt) ? g.closesAt : g.resolvedAt;
      else if (g.phase === 'closed') closedAt = g.closesAt ?? snap.fetchedAt;
      const game: Game = {
        id: g.id, prompt: g.prompt, description: g.description, infoUrl: g.infoUrl, benchmark: g.benchmark, template: 'legacy',
        answerType: g.answerType, fields: g.fields, createdByKey: nameKey(g.createdBy), createdBy: g.createdBy, createdAt: g.createdAt,
        closesAt: g.closesAt, closedAt, closedBy: null, resolvedAt: g.resolvedAt, resolvedBy: g.resolvedAt ? g.createdBy : null,
        result: g.result, winnerTipIds: null, correctedAt: null, editedAt: null, deletedAt: null, deletedBy: null,
        pushNewSentAt: at, creatorDueSentAt: at, creatorOverdueSentAt: at,
      };
      repo.insertGame(game);
      domain.push(game);
      for (const t of g.tips) {
        repo.insertTip({ id: t.id, gameId: g.id, playerKey: nameKey(t.playerName), playerName: t.playerName, values: t.values, createdAt: null, deviceId: null });
        tipCount++;
      }
      audit.recordEvent({ type: 'game.imported', gameId: g.id, actor: null, data: { source: snap.source, fetchedAt: snap.fetchedAt }, broadcast: false });
    }
    // Kein Reveal-Schwall: alle Spieler × alle aufgelösten Wetten als gesehen markieren
    const players = repo.listPlayers();
    for (const g of domain) if (g.resolvedAt) for (const p of players) repo.markSeen(p.key, g.id, at);
    repo.setMeta('imported_at', at);
    repo.setMeta('imported_source', snap.source);
    const seqGames = repo.maxId('games');
    const seqTips = repo.maxId('tips');
    repo.setSequence('games', seqGames);
    repo.setSequence('tips', seqTips);

    // Prüfungen nach dem Einfügen
    const phases: ImportReport['checks']['phases'] = { ok: 0, changed: [], warnings: [] };
    const archive: ImportReport['checks']['archiveAt'] = { ok: 0, mismatches: [] };
    const scoring: ImportReport['checks']['scoring'] = { compared: 0, mismatches: [] };
    for (const g of snap.games) {
      const game = domain.find((d) => d.id === g.id)!;
      const p = phaseOf(game, now);
      if (p === g.phase) phases.ok++;
      else if (g.phase === 'resolved' && p === 'archived') {
        phases.ok++;
        phases.changed.push({ id: g.id, legacy: g.phase, now: p, note: '7-Tage-Frist abgelaufen' });
      } else phases.warnings.push({ id: g.id, legacy: g.phase, now: p });
      if (g.archiveAt) {
        const computed = archiveAt(game);
        if (computed && Date.parse(computed) === Date.parse(g.archiveAt)) archive.ok++;
        else archive.mismatches.push({ id: g.id, legacy: g.archiveAt, computed });
      }
      if (!game.resolvedAt) continue;
      const scored = scoreGame(game, g.tips.map((t) => ({ id: t.id, values: t.values })));
      for (const t of g.tips) {
        if (!t.expected) continue;
        scoring.compared++;
        const s = scored.find((x) => x.id === t.id)!;
        if (!sameDistance(s.distance, t.expected.distance)) scoring.mismatches.push({ gameId: g.id, tipId: t.id, field: 'distance', expected: t.expected.distance, actual: s.distance });
        if (s.rank !== t.expected.rank) scoring.mismatches.push({ gameId: g.id, tipId: t.id, field: 'rank', expected: t.expected.rank, actual: s.rank });
        if (s.isWinner !== t.expected.isWinner) scoring.mismatches.push({ gameId: g.id, tipId: t.id, field: 'isWinner', expected: t.expected.isWinner, actual: s.isWinner });
      }
    }
    const stats = statsOf(loadWorld(repo));
    const report: ImportReport = {
      ok: true,
      dryRun: opts.dryRun,
      mode: opts.mode,
      format: snap.format,
      imported: { games: snap.games.length, tips: tipCount, players: derived.length },
      sequence: { games: seqGames, tips: seqTips },
      checks: {
        phases,
        archiveAt: archive,
        scoring,
        stats: { gameCount: stats.gameCount, resolvedCount: stats.resolvedCount, playerCount: stats.playerCount, tipCount: stats.tipCount, table: statsTable(stats) },
      },
      warnings,
    };
    if (scoring.mismatches.length > 0 && !opts.force) {
      db.exec('ROLLBACK');
      throw err.importMismatch(scoring.mismatches.map((m) => `Bet ${m.gameId}, guess ${m.tipId}: ${m.field} expected ${String(m.expected)}, computed ${String(m.actual)}`));
    }
    const completedEventId = audit.recordEvent({
      type: 'import.completed', actor: null, data: { games: snap.games.length, tips: tipCount, mode: opts.mode }, broadcast: false,
    });
    if (opts.dryRun) {
      db.exec('ROLLBACK');
      return { report, completedEventId: null };
    }
    db.exec('COMMIT');
    return { report, completedEventId };
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw e;
  }
}
