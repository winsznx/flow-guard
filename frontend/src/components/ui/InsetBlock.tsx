import React from 'react';
import { cx } from './cx';

export type BlockProps = { children: React.ReactNode; className?: string };

export function InsetBlock({ children, className }: BlockProps) {
  return <div className={cx('bg-sunken rounded-card p-4', className)}>{children}</div>;
}
