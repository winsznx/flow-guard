import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, LoaderCircle } from './Icon';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import type { ActionState } from './types';

type AriaPassthrough = Pick<
  React.AriaAttributes,
  'aria-expanded' | 'aria-controls' | 'aria-haspopup' | 'aria-pressed' | 'aria-describedby'
>;

export type IconButtonProps = {
  icon: LucideIcon;
  label: string;
  size?: 'sm' | 'md';
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
} & AriaPassthrough &
  ActionState;

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-pill transition-colors duration-(--duration-fast) ease-standard pointer-coarse:min-w-touch pointer-coarse:min-h-touch';

const LOOK = {
  rest: 'text-ink-secondary hover:bg-sunken hover:text-ink active:bg-sunken',
  inactive: 'bg-sunken text-ink-muted border border-line cursor-not-allowed',
} as const;

const DIMENSIONS = {
  sm: 'size-control-sm',
  md: 'size-control-md',
} as const;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    label,
    size = 'md',
    onClick,
    className,
    disabled = false,
    disabledReason,
    busy = false,
    busyLabel,
    'aria-describedby': ariaDescribedBy,
    ...aria
  },
  ref,
) {
  const reasonId = useId();
  const blocked = disabled || busy;
  const showReason = disabled && Boolean(disabledReason);
  const describedBy = [ariaDescribedBy, showReason ? reasonId : undefined].filter(Boolean).join(' ') || undefined;
  const tooltip = showReason ? `${label}. ${disabledReason}` : label;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (blocked) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <>
      <Tooltip content={tooltip}>
        <button
          {...aria}
          ref={ref}
          type="button"
          aria-label={busy && busyLabel ? busyLabel : label}
          aria-disabled={disabled || undefined}
          aria-busy={busy || undefined}
          aria-describedby={describedBy}
          className={cx(BASE, DIMENSIONS[size], disabled ? LOOK.inactive : LOOK.rest, busy && 'cursor-progress', className)}
          onClick={handleClick}
        >
          {busy ? (
            <span className="inline-flex size-4 animate-spin">
              <Icon icon={LoaderCircle} size={16} />
            </span>
          ) : (
            <Icon icon={icon} size={size === 'sm' ? 16 : 20} />
          )}
        </button>
      </Tooltip>
      {showReason ? (
        <span id={reasonId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
});
