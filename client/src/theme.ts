// Hell/Dunkel-Override (§1.10): data-theme + passendes theme-color.
import { lsGet, lsSet } from './storage.ts';

export type Theme = 'system' | 'light' | 'dark';
const COLORS = { light: '#f6f7f2', dark: '#101211' } as const;

export const getTheme = (): Theme => {
  const t = lsGet('benchbet.theme');
  return t === 'light' || t === 'dark' ? t : 'system';
};

export function applyTheme(t: Theme): void {
  lsSet('benchbet.theme', t === 'system' ? null : t);
  const root = document.documentElement;
  if (t === 'system') delete root.dataset.theme;
  else root.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  const add = (content: string, media?: string) => {
    const m = document.createElement('meta');
    m.name = 'theme-color';
    m.content = content;
    if (media) m.media = media;
    document.head.appendChild(m);
  };
  if (t === 'system') {
    add(COLORS.light, '(prefers-color-scheme: light)');
    add(COLORS.dark, '(prefers-color-scheme: dark)');
  } else add(COLORS[t]);
}
