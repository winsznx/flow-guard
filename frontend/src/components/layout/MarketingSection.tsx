import React from 'react';
import { cx } from '../ui/cx';

export type MarketingSectionProps = {
  id?: string;
  labelledBy?: string;
  tone?: 'canvas' | 'surface';
  children: React.ReactNode;
  className?: string;
};

const TONE = {
  canvas: 'bg-canvas',
  surface: 'bg-surface',
} as const;

export function MarketingSection({ id, labelledBy, tone = 'canvas', children, className }: MarketingSectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cx('scroll-mt-header py-16 lg:py-24', TONE[tone], className)}>
      <div className="mx-auto w-full min-w-0 max-w-page px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}
