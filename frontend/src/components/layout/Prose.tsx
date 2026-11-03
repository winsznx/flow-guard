import React from 'react';
import { cx } from '../ui/cx';

export type ProseProps = { children: React.ReactNode; className?: string };

export function Prose({ children, className }: ProseProps) {
  return <div className={cx('reading min-w-0', className)}>{children}</div>;
}
