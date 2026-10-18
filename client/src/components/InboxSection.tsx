import type { ReactNode } from 'react';

/** Sektion mit Mono-Label „TITEL · n“. */
export function InboxSection({ title, count, children, id }: { title: string; count?: number; children: ReactNode; id?: string }) {
  return (
    <section className="sec" aria-labelledby={id}>
      <h2 className="label" id={id}>
        {title}
        {count != null && <span className="label-n"> · {count}</span>}
      </h2>
      {children}
    </section>
  );
}
