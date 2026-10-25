import type { ReactNode } from 'react';

export function Panel({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="panel">
      {title && <h2 className="panel__title">{title}</h2>}
      {children}
    </section>
  );
}

export function Tag({ tone = 'amber', children }: { tone?: 'amber' | 'cyan'; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}
