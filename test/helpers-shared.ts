// Test-Hilfen ohne Server-Abhängigkeit: öffentliche Fixture laden und in einen v2-Snapshot umbauen (SPEC §6.6).
import { readFileSync } from 'node:fs';
import type { AnswerType, Field, Phase, Snapshot, SnapshotGame, TipValues } from '../shared/types.ts';

export const LEGACY_SOURCE = 'https://ki-score-tippspiel.logge.chatgpt.site';

/** Form der anonymen Antwort von GET /api/games der alten App. */
export type LegacyApiTip = {
  id: number; playerName: string; isOwn: boolean;
  values: TipValues | null; distance: number | null; rank: number | null; isWinner: boolean;
};
export type LegacyApiGame = {
  id: number; prompt: string; description: string; infoUrl: string | null; benchmark: string;
  answerType: AnswerType; fields: Field[]; phase: Phase; createdBy: string; createdAt: string;
  resolvedAt: string | null; closesAt: string | null; archiveAt: string | null; result: TipValues | null;
  canManage?: boolean; tipCount?: number; hasTipped?: boolean; answersRevealed?: boolean; viewerTip?: unknown;
  tips: LegacyApiTip[];
};
export type LegacyApiResponse = { games: LegacyApiGame[]; serverTime: string };

export const FIXTURE_PATH = new URL('./fixtures/legacy-public.json', import.meta.url);

export function loadFixture(): LegacyApiResponse {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as LegacyApiResponse;
}

/** Platzhalter für verdeckte Werte offener Wetten: number → field.min je Feld, text → "x". */
const placeholder = (g: LegacyApiGame): TipValues => (g.answerType === 'text' ? 'x' : g.fields.map((f) => f.min));

/**
 * Baut aus der anonymen Fixture einen v2-Snapshot. Fehlende Werte offener Wetten werden mit Platzhaltern gefüllt
 * (beeinflusst die Statistik nicht). `expected` kommt bei aufgelösten Wetten aus der Fixture.
 */
export function toSnapshot(fixture: LegacyApiResponse = loadFixture()): Snapshot {
  const games: SnapshotGame[] = fixture.games.map((g) => {
    const resolved = !!g.resolvedAt;
    return {
      id: g.id,
      prompt: g.prompt,
      description: g.description,
      infoUrl: g.infoUrl,
      benchmark: g.benchmark,
      answerType: g.answerType,
      fields: g.fields.map((f) => ({ ...f })),
      phase: g.phase,
      createdBy: g.createdBy,
      createdAt: g.createdAt,
      resolvedAt: g.resolvedAt,
      closesAt: g.closesAt,
      archiveAt: g.archiveAt,
      result: g.result,
      tips: g.tips.map((t) => ({
        gameId: g.id,
        id: t.id,
        playerName: t.playerName,
        values: t.values ?? placeholder(g),
        ...(resolved ? { expected: { distance: t.distance, rank: t.rank, isWinner: t.isWinner } } : {}),
      })),
    };
  });
  return {
    format: 'tipplab-legacy-snapshot@2',
    source: LEGACY_SOURCE,
    fetchedAt: fixture.serverTime,
    capturedAs: [''],
    games,
  };
}

/** Leck-Schutz: Wetten ohne Auflösung, die in der Fixture trotzdem einen Wert/eine Wertung tragen. */
export function fixtureLeaks(fixture: LegacyApiResponse): string[] {
  const out: string[] = [];
  for (const g of fixture.games) {
    if (g.resolvedAt) continue;
    if (g.result !== null) out.push(`${g.id}: result`);
    if (g.viewerTip != null) out.push(`${g.id}: viewerTip`);
    for (const t of g.tips) {
      if (t.values !== null || t.distance !== null || t.rank !== null || t.isWinner) out.push(`${g.id}/${t.id}`);
    }
  }
  return out;
}
