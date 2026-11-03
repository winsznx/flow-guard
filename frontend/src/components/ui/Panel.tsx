import React from 'react';
import { Heading } from './Heading';
import { cx } from './cx';

export type PanelProps = {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  padding?: 'none' | 'md';
  children: React.ReactNode;
  className?: string;
};

export function Panel({ title, description, action, padding = 'md', children, className }: PanelProps) {
  const padded = padding === 'md';
  const hasHeader = Boolean(title || action);

  return (
    <section
      aria-label={title}
      className={cx('bg-surface border border-line rounded-panel', padded ? 'p-4 sm:p-6' : 'overflow-hidden', className)}
    >
      {hasHeader ? (
        <div
          className={cx(
            'flex flex-col items-start gap-3 border-b border-line sm:flex-row sm:justify-between sm:gap-4',
            padded ? 'pb-4 mb-4' : 'px-4 py-4 sm:px-6',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {title ? <Heading level="section">{title}</Heading> : null}
            {description ? <p className="text-small text-ink-secondary">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
