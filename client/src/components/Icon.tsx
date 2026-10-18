// Inline-SVG-Icons (24er Raster, Kontur). Immer aria-hidden – Bedeutung steht im Text/Label.
const P = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5a3 3 0 0 0 3 4 M16 6h3a3 3 0 0 1-3 4 M12 13v4 M9 20h6 M10 17h4',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 2',
  share: 'M12 3v12 M8 7l4-4 4 4 M5 12v8h14v-8',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  back: 'M15 5l-7 7 7 7',
  plus: 'M12 5v14 M5 12h14',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  bellOff: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0 M3 3l18 18',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z M20 20l-4-4',
  chevron: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  user: 'M12 4a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M4 21a8 8 0 0 1 16 0',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  wifiOff: 'M3 3l18 18 M8.5 16.5a5 5 0 0 1 7 0 M5 12.5a10 10 0 0 1 4-2.3 M19 12.5a10 10 0 0 0-3-2 M2 8.8a15 15 0 0 1 5-3 M22 8.8A15 15 0 0 0 12 5 M12 20h.01',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  inbox: 'M4 13l2.5-8h11L20 13v6H4z M4 13h5l1 2h4l1-2h5',
  podium: 'M4 20v-8h5v8 M9 20V6h6v14 M15 20v-6h5v6 M3 20h18',
  x: 'M6 6l12 12 M18 6L6 18',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
} as const;

export type IconName = keyof typeof P;

export function Icon({ n, size = 20, className }: { n: IconName; size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" className={className ? `ic ${className}` : 'ic'}>
      <path d={P[n]} />
    </svg>
  );
}
