// try/catch-Wrapper für localStorage/sessionStorage (privater Modus, blockierte Site-Daten).

function probe(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    const s = window[kind];
    s.setItem('benchbet.probe', '1');
    s.removeItem('benchbet.probe');
    return s;
  } catch {
    return null;
  }
}

const ls = probe('localStorage');
const ss = probe('sessionStorage');

/** false = Browser merkt sich nichts (Banner „Speicher blockiert“). */
export const storageOk = ls !== null;

function get(s: Storage | null, k: string): string | null {
  try {
    return s ? s.getItem(k) : null;
  } catch {
    return null;
  }
}
function put(s: Storage | null, k: string, v: string | null): void {
  try {
    if (!s) return;
    if (v == null) s.removeItem(k);
    else s.setItem(k, v);
  } catch {
    /* voll oder blockiert – egal */
  }
}
function json<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const lsGet = (k: string) => get(ls, k);
export const lsSet = (k: string, v: string | null) => put(ls, k, v);
export const lsJson = <T>(k: string, fallback: T): T => json(get(ls, k), fallback);
export const lsSetJson = (k: string, v: unknown) => put(ls, k, v == null ? null : JSON.stringify(v));
export const ssGet = (k: string) => get(ss, k);
export const ssSet = (k: string, v: string | null) => put(ss, k, v);
export const ssJson = <T>(k: string, fallback: T): T => json(get(ss, k), fallback);

/** Alle sessionStorage-Schlüssel mit Präfix (für Tipp-Entwürfe). */
export function ssKeys(prefix: string): string[] {
  const out: string[] = [];
  try {
    if (ss) for (let i = 0; i < ss.length; i++) {
      const k = ss.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
  } catch {
    /* ignore */
  }
  return out;
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6]! & 0x0f) | 0x40;
    b[8] = (b[8]! & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
}

/** Gerätekennung (§2.1): einmal erzeugt, bei blockiertem Speicher pro Seitenaufruf neu. */
export const deviceId: string = (() => {
  const have = lsGet('benchbet.device');
  if (have) return have;
  const id = uuid();
  lsSet('benchbet.device', id);
  return id;
})();

/** „Gerät a3f9c1“ = erste 6 Hex von sha256(deviceId). */
export async function deviceTag(): Promise<string> {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId));
    return [...new Uint8Array(d)].slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    return '––––––';
  }
}
