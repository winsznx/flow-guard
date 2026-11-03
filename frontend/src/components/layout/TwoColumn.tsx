import React from 'react';
import { cx } from '../ui/cx';

export type TwoColumnProps = {
  main: React.ReactNode;
  side: React.ReactNode;
  sideFirstOnMobile?: boolean;
  className?: string;
};

export function TwoColumn({ main, side, sideFirstOnMobile = false, className }: TwoColumnProps) {
  return (
    <div className={cx('grid min-w-0 gap-6 lg:grid-cols-3', className)}>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">{main}</div>
      <aside className={cx('flex min-w-0 flex-col gap-6 lg:col-span-1', sideFirstOnMobile && 'order-first lg:order-none')}>
        {side}
      </aside>
    </div>
  );
}
