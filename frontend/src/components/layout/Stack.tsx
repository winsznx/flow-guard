import React from 'react';
import { cx } from '../ui/cx';

export type StackProps = { gap?: 4 | 6; children: React.ReactNode; className?: string };

const GAP = {
  4: 'gap-4',
  6: 'gap-6',
} as const;

export function Stack({ gap = 6, children, className }: StackProps) {
  return <div className={cx('flex min-w-0 flex-col', GAP[gap], className)}>{children}</div>;
}
