import type { ReactNode } from 'react';

export function EmptyState({ title, text, children, big }: { title?: string; text: string; children?: ReactNode; big?: boolean }) {
  return (
    <div className={big ? 'empty big' : 'empty'}>
      {big && <div className="empty-art" aria-hidden="true"><span>/</span><i /></div>}
      {title && <h2 className="empty-title">{title}</h2>}
      <p>{text}</p>
      {children && <div className="empty-actions">{children}</div>}
    </div>
  );
}
