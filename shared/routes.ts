// Routen der App (docs/BRANDING.md) und Weiterleitungen alter deutscher Pfade. Client und Server nutzen denselben Code.

export const paths = {
  inbox: '/',
  bet: (id: number) => `/bet/${id}`,
  resolve: (id: number) => `/bet/${id}/resolve`,
  edit: (id: number) => `/bet/${id}/edit`,
  create: '/new',
  results: '/results',
  leaderboard: '/leaderboard',
  player: (name: string) => `/leaderboard/${encodeURIComponent(name)}`,
  me: '/me',
  howItWorks: '/how-it-works',
} as const;

/**
 * App-Seiten, deren letzter Pfadteil einen Punkt enthalten darf (Spielernamen wie „Max.B“, „GPT4.5“).
 * Server und Service Worker liefern dafür die SPA statt 404 (Kopie der Regex in client/src/sw/sw.ts).
 */
export const APP_PATH_WITH_DOT = /^\/(?:bet|leaderboard|spiel|rangliste)\/[^/]+(?:\/[^/]*)?\/?$/;

/** Query-Marker für Starts über eine Notification. */
export const FROM_PUSH = 'from=push';
export const isFromPush = (search: string): boolean => /[?&](from|von)=push(&|$)/.test(search);

const LEGACY: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^\/spiel\/(\d+)\/aufloesen\/?$/, (m) => paths.resolve(Number(m[1]))],
  [/^\/spiel\/(\d+)\/bearbeiten\/?$/, (m) => paths.edit(Number(m[1]))],
  [/^\/spiel\/(\d+)\/?$/, (m) => paths.bet(Number(m[1]))],
  [/^\/neu\/?$/, () => paths.create],
  [/^\/ergebnisse\/?$/, () => paths.results],
  [/^\/rangliste\/?$/, () => paths.leaderboard],
  [/^\/rangliste\/([^/]+)\/?$/, (m) => `/leaderboard/${m[1]}`],
  [/^\/ich\/?$/, () => paths.me],
  [/^\/so-gehts\/?$/, () => paths.howItWorks],
];

/**
 * Neue Adresse für einen alten deutschen Pfad (inkl. `/#spiel-<id>`), sonst null.
 * `search` wird übernommen, `von=push` wird zu `from=push`.
 */
export function legacyRedirect(pathname: string, search = '', hash = ''): string | null {
  const h = /^#spiel-(\d+)$/.exec(hash);
  let to: string | null = h && (pathname === '/' || pathname === '') ? paths.bet(Number(h[1])) : null;
  if (!to) {
    for (const [re, fn] of LEGACY) {
      const m = re.exec(pathname);
      if (m) {
        to = fn(m);
        break;
      }
    }
  }
  if (!to) return null;
  const q = search.replace(/([?&])von=push(?=&|$)/, '$1from=push');
  return to + (q === '?' ? '' : q);
}
