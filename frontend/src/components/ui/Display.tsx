import React from 'react';
import { cx } from './cx';

export type DisplayProps = {
  size: 'display' | 'headline';
  as?: 'h1' | 'h2';
  id?: string;
  children: React.ReactNode;
  accent?: string;
  onInverse?: boolean;
  className?: string;
};

const SIZE = {
  display: 'text-display',
  headline: 'text-headline',
} as const;

const TAG = {
  display: 'h1',
  headline: 'h2',
} as const;

export function Display({ size, as, id, children, accent, onInverse = false, className }: DisplayProps) {
  const Tag = as ?? TAG[size];
  return (
    <Tag
      id={id}
      className={cx('font-display text-balance', SIZE[size], onInverse ? 'text-ink-inverse' : 'text-ink', className)}
    >
      {children}
      {accent ? (
        <>
          {' '}
          <em className={cx('italic', onInverse ? 'text-marker' : 'text-brand')}>{accent}</em>
        </>
      ) : null}
    </Tag>
  );
}
