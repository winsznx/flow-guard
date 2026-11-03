import React from 'react';
import { cx } from './cx';
import { CHROME } from '../../copy/nav';

/** `pill` matches a medium StatusPill, so a status row keeps its height while it loads. */
export type SkeletonProps = { kind: 'text' | 'amount' | 'row' | 'tile' | 'pill'; lines?: number };

const BLOCK = 'block rounded-inline bg-sunken animate-pulse';

function count(lines: number | undefined, fallback: number): number {
  return Math.max(1, Math.trunc(lines ?? fallback));
}

function TextLines({ lines }: { lines: number }) {
  return (
    <span className="flex flex-col gap-2.5 py-1">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cx(BLOCK, 'h-4', i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full')} />
      ))}
    </span>
  );
}

function RowBlock() {
  return (
    <span className="flex min-h-row items-center gap-4 border-t border-line px-4 first:border-t-0">
      <span className="flex flex-1 flex-col gap-2">
        <span className={cx(BLOCK, 'h-4 w-1/3')} />
        <span className={cx(BLOCK, 'h-3 w-1/2')} />
      </span>
      <span className={cx(BLOCK, 'h-4 w-24')} />
    </span>
  );
}

function TileBlock() {
  return (
    <span className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <span className={cx(BLOCK, 'h-4 w-1/2')} />
      <span className={cx(BLOCK, 'h-8 w-3/4')} />
    </span>
  );
}

export const Skeleton: React.FC<SkeletonProps> = ({ kind, lines }) => {
  let content: React.ReactNode;
  switch (kind) {
    case 'text':
      content = <TextLines lines={count(lines, 1)} />;
      break;
    case 'amount':
      content = <span className={cx(BLOCK, 'h-8 w-32')} />;
      break;
    case 'row':
      content = Array.from({ length: count(lines, 1) }, (_, i) => <RowBlock key={i} />);
      break;
    case 'tile':
      content = <TileBlock />;
      break;
    case 'pill':
      content = <span className="block h-6 w-24 animate-pulse rounded-pill bg-sunken" />;
      break;
  }

  return (
    <span role="status" className={cx('block', (kind === 'amount' || kind === 'pill') && 'w-fit')}>
      <span className="sr-only">{CHROME.loading}</span>
      <span aria-hidden="true" className="block">
        {content}
      </span>
    </span>
  );
};

type LegacyLayout = { className?: string };

export const SkeletonText: React.FC<LegacyLayout & { lines?: number }> = ({ lines = 3, className }) => (
  <div className={className}>
    <Skeleton kind="text" lines={lines} />
  </div>
);

export const SkeletonCard: React.FC<LegacyLayout & { lines?: number }> = ({ lines = 3, className }) => (
  <div className={cx('rounded-card border border-line bg-surface p-4 sm:p-5', className)}>
    <div aria-hidden="true" className="mb-4 flex items-center gap-3">
      <span className={cx(BLOCK, 'size-9')} />
      <span className={cx(BLOCK, 'h-4 w-1/3')} />
    </div>
    <Skeleton kind="text" lines={lines} />
  </div>
);

export const SkeletonTable: React.FC<LegacyLayout & { rows?: number; columns?: number }> = ({
  rows = 5,
  className,
}) => (
  <div className={cx('overflow-hidden rounded-card border border-line bg-surface', className)}>
    <div aria-hidden="true" className="flex h-control-md items-center bg-sunken px-4">
      <span className="block h-3 w-1/4 rounded-inline bg-line" />
    </div>
    <Skeleton kind="row" lines={rows} />
  </div>
);

export const SkeletonStats: React.FC<LegacyLayout & { count?: number }> = ({ count: tiles = 4, className }) => (
  <div className={cx('grid grid-cols-2 gap-4 lg:grid-cols-4', className)}>
    {Array.from({ length: Math.max(1, tiles) }, (_, i) => (
      <Skeleton key={i} kind="tile" />
    ))}
  </div>
);
