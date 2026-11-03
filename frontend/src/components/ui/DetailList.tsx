import React from 'react';
import { LABELS } from '../../copy/common';

export type DetailListProps = {
  items: { label: string; value: React.ReactNode }[];
  /** `split` puts the value on the right from `sm` up. `stacked` keeps the label above a left-aligned value, for sentence answers. */
  layout?: 'split' | 'stacked';
};

const ROW = {
  split: 'flex flex-col gap-1 border-t border-line py-3 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
  stacked: 'flex flex-col gap-1 border-t border-line py-3 first:border-t-0',
} as const;

const VALUE = {
  split: 'min-w-0 text-body text-ink sm:text-right',
  stacked: 'min-w-0 text-body text-ink',
} as const;

function isEmpty(value: React.ReactNode): boolean {
  return value === null || value === undefined || value === false || (typeof value === 'string' && value.trim() === '');
}

export function DetailList({ items, layout = 'split' }: DetailListProps) {
  return (
    <dl className="flex flex-col">
      {items.map((item) => (
        <div key={item.label} className={ROW[layout]}>
          <dt className="shrink-0 text-small text-ink-muted">{item.label}</dt>
          <dd className={VALUE[layout]}>
            {isEmpty(item.value) ? <span className="text-ink-muted">{LABELS.notSet}</span> : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
