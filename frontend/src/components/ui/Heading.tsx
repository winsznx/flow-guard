import React from 'react';
import { cx } from './cx';

export type HeadingProps = {
  level: 'page' | 'section' | 'item';
  as?: 'h1' | 'h2' | 'h3' | 'h4';
  id?: string;
  children: React.ReactNode;
  className?: string;
};

const TAG = {
  page: 'h1',
  section: 'h2',
  item: 'h3',
} as const;

const LOOK = {
  page: 'text-title-page text-ink',
  section: 'text-title-section text-ink',
  item: 'text-title-item text-ink',
} as const;

export function Heading({ level, as, id, children, className }: HeadingProps) {
  const Tag = as ?? TAG[level];
  return (
    <Tag id={id} className={cx(LOOK[level], 'text-balance', className)}>
      {children}
    </Tag>
  );
}
