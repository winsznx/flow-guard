import React from 'react';
import { cx } from '../ui/cx';

export type PageContainerProps = {
  width?: 'page' | 'reading' | 'narrow';
  children: React.ReactNode;
  className?: string;
};

const WIDTH = {
  page: 'max-w-page',
  reading: 'max-w-reading',
  narrow: 'max-w-narrow',
} as const;

export function PageContainer({ width = 'page', children, className }: PageContainerProps) {
  return (
    <div className={cx('mx-auto w-full min-w-0 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8', WIDTH[width], className)}>
      {children}
    </div>
  );
}
