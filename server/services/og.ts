// OG-Injection für geteilte Links (SPEC §3.3 „Static und SPA“).
import type { Game } from '../../shared/types.ts';
import { formatAnswer, formatDate } from '../../shared/format.ts';

export const DEFAULT_TITLE = 'BenchBet';
export const DEFAULT_DESCRIPTION = 'Place your bet on AI models';
/** Beschreibung der Startseite und unbekannter Seiten. */
export const SITE_DESCRIPTION = 'Bets on AI models, benchmarks and the next big release.';

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export type OgData = { title: string; description: string; url: string; image: string; pageTitle?: string };

/** og:description je nach Zustand der Wette. */
export function ogDescription(game: Pick<Game, 'resolvedAt' | 'result' | 'closesAt' | 'fields'>, tipCount: number, o: { now: number; timeZone: string }): string {
  if (game.resolvedAt && game.result != null) return `Result: ${formatAnswer(game, game.result)}`;
  const tips = `${tipCount} ${tipCount === 1 ? 'guess' : 'guesses'}`;
  if (game.closesAt) return `${tips} · closes ${formatDate(game.closesAt, { now: o.now, timeZone: o.timeZone })}`;
  return `${tips} · ${DEFAULT_DESCRIPTION}`;
}

/** Setzt OG-Tags vor `</head>` und ersetzt optional den `<title>`. */
export function injectOg(html: string, d: OgData): string {
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(DEFAULT_TITLE)}">`,
    `<meta property="og:title" content="${escapeHtml(d.title)}">`,
    `<meta property="og:description" content="${escapeHtml(d.description)}">`,
    `<meta property="og:image" content="${escapeHtml(d.image)}">`,
    `<meta property="og:url" content="${escapeHtml(d.url)}">`,
    `<meta property="og:locale" content="en_GB">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join('\n    ');
  let out = html;
  if (d.pageTitle) out = out.replace(/<title>[^<]*<\/title>/i, () => `<title>${escapeHtml(d.pageTitle!)}</title>`);
  return out.includes('</head>') ? out.replace('</head>', () => `    ${tags}\n  </head>`) : `${tags}\n${out}`;
}
