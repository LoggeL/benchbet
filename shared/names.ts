// Spielernamen: Schlüssel, Validierung, Ähnlichkeit (SPEC §2.1, §1.4.2.2).

export const NAME_MAX = 40;
export const NAME_INVALID_MESSAGE = 'Names need 1 to 40 characters, with at least one letter or digit.';

/** Normalschlüssel: gleicher Schlüssel = gleiche Person ("NÖL" == "Nöl", aber "Noel" ≠ "Nöl"). */
export const nameKey = (name: string): string =>
  name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE');

/** Anzeigeform: NFC, getrimmt, Whitespace zusammengefasst. */
export const cleanName = (name: string): string => name.normalize('NFC').trim().replace(/\s+/g, ' ');

/** Länge in Zeichen (Code Points), passend zu SQLite `length()`. */
export const charLength = (s: string): number => [...s].length;

export type NameCheck = { ok: true; name: string; key: string } | { ok: false; message: string };

/** gültig: 1–40 Zeichen nach cleanName, mind. ein \p{L} oder \p{N}, keine \p{Cc}. */
export function validateName(input: unknown): NameCheck {
  if (typeof input !== 'string') return { ok: false, message: NAME_INVALID_MESSAGE };
  const name = cleanName(input);
  const len = charLength(name);
  if (len < 1 || len > NAME_MAX || !/[\p{L}\p{N}]/u.test(name) || /\p{Cc}/u.test(name)) {
    return { ok: false, message: NAME_INVALID_MESSAGE };
  }
  return { ok: true, name, key: nameKey(name) };
}

export const isValidName = (input: unknown): boolean => validateName(input).ok;

/**
 * Faltschlüssel für die Ähnlichkeitswarnung: Umlaute falten (ö→oe, ä→ae, ü→ue, ß→ss),
 * Diakritika und alles Nicht-Alphanumerische entfernen. "Nöl" → "noel", "Lo-gge" → "logge".
 */
export function foldKey(s: string): string {
  return s
    .normalize('NFC')
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Levenshtein-Distanz über Code Points. */
export function levenshtein(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = cur;
  }
  return prev[t.length]!;
}

type NamedPlayer = string | { name: string; key?: string };
const nameOf = (p: NamedPlayer): string => (typeof p === 'string' ? p : p.name);

/** Exakter Treffer über den Normalschlüssel (= derselbe Spieler, keine Rückfrage). */
export function findPlayer<P extends NamedPlayer>(input: string, players: readonly P[]): P | null {
  const key = nameKey(input);
  return players.find((p) => (typeof p === 'string' ? nameKey(p) : (p.key ?? nameKey(p.name))) === key) ?? null;
}

/**
 * Ähnlicher bekannter Spieler für „Meinst du {Name}?“, sonst null.
 * Treffer: gleicher Faltschlüssel, oder Levenshtein ≤ 1 der Faltschlüssel (beide ≥ 4 Zeichen).
 * Bei exakt gleichem Normalschlüssel gibt es keine Rückfrage → null.
 * Reihenfolge der Liste entscheidet bei mehreren Kandidaten (gleicher Faltschlüssel geht vor).
 */
export function similarPlayer(input: string, players: readonly NamedPlayer[]): string | null {
  if (!cleanName(input)) return null;
  if (findPlayer(input, players)) return null;
  const f = foldKey(input);
  if (!f) return null;
  const same = players.find((p) => foldKey(nameOf(p)) === f);
  if (same) return nameOf(same);
  if (charLength(f) < 4) return null;
  const near = players.find((p) => {
    const g = foldKey(nameOf(p));
    return charLength(g) >= 4 && levenshtein(f, g) <= 1;
  });
  return near ? nameOf(near) : null;
}

/** Initialen für den Avatar: "Nöl" → "NÖ", "Big Dick" → "BD", "LZH" → "LZ". */
export function initials(name: string): string {
  const words = cleanName(name).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const chars = (w: string) => [...w].filter((c) => /[\p{L}\p{N}]/u.test(c));
  const out = words.length >= 2 ? [chars(words[0]!)[0], chars(words[1]!)[0]] : chars(words[0]!).slice(0, 2);
  return out.filter(Boolean).join('').toLocaleUpperCase('de-DE');
}

/** Admin-Schlüssel aus der Komma-Liste ADMIN_NAMES. */
export const adminKeys = (list: string): Set<string> =>
  new Set(list.split(',').map((s) => nameKey(s)).filter((k) => k.length > 0));
