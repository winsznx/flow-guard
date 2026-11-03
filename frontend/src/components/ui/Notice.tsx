import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from './IconButton';
import { CircleAlert, CircleCheck, Icon, Info, TriangleAlert, X } from './Icon';
import { cx } from './cx';
import type { Tone } from './types';
import { ACTIONS } from '../../copy/common';

export type NoticeProps = {
  tone: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  live?: 'polite' | 'assertive';
};

const TONE: Record<Tone, { surface: string; icon: string; glyph: LucideIcon }> = {
  success: { surface: 'bg-success-tint', icon: 'text-success-dot', glyph: CircleCheck },
  warning: { surface: 'bg-warning-tint', icon: 'text-warning-dot', glyph: TriangleAlert },
  danger: { surface: 'bg-danger-tint', icon: 'text-danger-dot', glyph: CircleAlert },
  info: { surface: 'bg-info-tint', icon: 'text-info-dot', glyph: Info },
  neutral: { surface: 'bg-neutral-tint', icon: 'text-neutral-dot', glyph: Info },
};

const LIVE_ROLE = { polite: 'status', assertive: 'alert' } as const;

export function Notice({ tone, title, children, action, onDismiss, live }: NoticeProps) {
  const look = TONE[tone];

  return (
    <div role={live ? LIVE_ROLE[live] : undefined} className={cx('flex gap-3 rounded-card p-4', look.surface)}>
      <span className={cx('mt-0.5 inline-flex shrink-0', look.icon)}>
        <Icon icon={look.glyph} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-title-item text-ink">{title}</p>
        {children ? <div className="text-small text-ink-secondary">{children}</div> : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton icon={X} label={ACTIONS.dismiss} size="sm" onClick={onDismiss} className="-mr-1 -mt-1 shrink-0" />
      ) : null}
    </div>
  );
}
