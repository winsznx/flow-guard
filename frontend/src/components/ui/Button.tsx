import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon, LoaderCircle } from './Icon';
import {
  BUTTON_BASE,
  BUTTON_ICON_SIZE,
  BUTTON_INACTIVE,
  BUTTON_LINK_BASE,
  BUTTON_LINK_INACTIVE,
  BUTTON_REASON,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
} from './classes';
import { cx } from './cx';

export {
  BUTTON_BASE,
  BUTTON_ICON_SIZE,
  BUTTON_INACTIVE,
  BUTTON_LINK_BASE,
  BUTTON_LINK_INACTIVE,
  BUTTON_REASON,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
} from './classes';
import type { ActionState, Size } from './types';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'danger-quiet'
  | 'on-inverse'
  | 'on-inverse-secondary'
  | 'link';

type AriaPassthrough = Pick<
  React.AriaAttributes,
  'aria-expanded' | 'aria-controls' | 'aria-haspopup' | 'aria-pressed' | 'aria-describedby'
>;

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: Size;
  leadingIcon?: LucideIcon;
  trailingIcon?: LucideIcon;
  fullWidth?: boolean;
  /** For `variant="link"` on its own line, not inside running text: it then gets a full touch target on phones. */
  standalone?: boolean;
  type?: 'button' | 'submit';
  form?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
} & AriaPassthrough &
  ActionState;

type LegacyButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  variant?: ButtonVariant | 'outline';
  size?: Size;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
  children: React.ReactNode;
};

/** A link-style action on its own line lays out as a row, so the touch-target min-height applies. */
const STANDALONE_LINK_BASE = BUTTON_LINK_BASE.replace(/^inline /, 'inline-flex items-center gap-1 ');

const LEGACY_BASE = cx(BUTTON_BASE.replace(' whitespace-nowrap', ''), 'text-center');

const LEGACY_SIZES = {
  sm: 'min-h-control-sm px-3 py-1.5 text-label',
  md: 'min-h-control-md px-4 py-2 text-label',
  lg: 'min-h-control-lg px-6 py-2.5 text-body font-medium',
} as const;

function joinIds(...ids: (string | undefined | false)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ');
  return joined || undefined;
}

function isLegacy(props: ButtonProps | LegacyButtonProps): props is LegacyButtonProps {
  return props.variant === 'outline' || 'loading' in props;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps | LegacyButtonProps>(
  function Button(props, ref) {
    const reasonId = useId();
    const legacy = isLegacy(props);
    // Unmigrated pages leave out the variant and expect the old filled button that wraps its label (PLAN 1.1).
    const legacyLook = legacy || props.variant === undefined;
    const {
      variant: rawVariant = 'primary',
      size = 'md',
      type = 'button',
      children,
      className,
      onClick,
      disabled = false,
    } = props;
    const variant: ButtonVariant = rawVariant === 'outline' ? 'secondary' : rawVariant;

    const leadingIcon = legacy ? undefined : props.leadingIcon;
    const trailingIcon = legacy ? undefined : props.trailingIcon;
    const fullWidth = legacy ? false : props.fullWidth;
    const standalone = legacy ? false : Boolean(props.standalone);
    const busy = legacy ? Boolean(props.loading) : Boolean(props.busy);
    const busyLabel = legacy ? undefined : props.busyLabel;
    const disabledReason = 'disabledReason' in props ? props.disabledReason : undefined;

    const nativeRest = nativeButtonAttributes(props);

    const inactive = Boolean(disabled);
    const blocked = inactive || busy;
    const showReason = inactive && Boolean(disabledReason);
    const isLink = variant === 'link';
    const iconSize = BUTTON_ICON_SIZE[size];

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (blocked) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    const leading = busy ? (
      <span className="inline-flex size-4 animate-spin">
        <Icon icon={LoaderCircle} size={16} />
      </span>
    ) : leadingIcon ? (
      <Icon icon={leadingIcon} size={iconSize} />
    ) : null;
    const trailing = trailingIcon ? <Icon icon={trailingIcon} size={iconSize} /> : null;

    const content =
      busy && busyLabel ? (
        <span className="grid">
          <span className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2" aria-hidden="true">
            {leadingIcon ? <Icon icon={leadingIcon} size={iconSize} /> : null}
            {children}
            {trailing}
          </span>
          <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-2">
            {leading}
            {busyLabel}
          </span>
        </span>
      ) : (
        <>
          {leading}
          {children}
          {trailing}
        </>
      );

    const look = isLink
      ? cx(standalone ? STANDALONE_LINK_BASE : BUTTON_LINK_BASE, inactive ? BUTTON_LINK_INACTIVE : BUTTON_VARIANTS.link)
      : cx(legacyLook ? LEGACY_BASE : BUTTON_BASE, (legacyLook ? LEGACY_SIZES : BUTTON_SIZES)[size], inactive ? BUTTON_INACTIVE : BUTTON_VARIANTS[variant], busy && 'cursor-progress');

    const button = (
      <button
        {...nativeRest}
        ref={ref}
        type={type}
        className={cx(look, fullWidth && 'w-full', !disabledReason && className)}
        aria-disabled={inactive || undefined}
        aria-busy={busy || undefined}
        aria-describedby={joinIds(props['aria-describedby'], showReason && reasonId)}
        data-inline={(isLink && !standalone) || undefined}
        onClick={handleClick}
      >
        {content}
      </button>
    );

    if (!disabledReason) return button;

    return (
      <span className={cx('inline-flex flex-col items-start gap-1.5', fullWidth && 'w-full', className)}>
        {button}
        {showReason ? (
          <span id={reasonId} className={BUTTON_REASON}>
            {disabledReason}
          </span>
        ) : null}
      </span>
    );
  },
);

const OWN_PROPS = new Set([
  'variant',
  'size',
  'type',
  'children',
  'className',
  'onClick',
  'disabled',
  'leadingIcon',
  'trailingIcon',
  'fullWidth',
  'standalone',
  'busy',
  'busyLabel',
  'disabledReason',
  'loading',
  'aria-describedby',
]);

function nativeButtonAttributes(props: object): Record<string, unknown> {
  const native: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (!OWN_PROPS.has(key)) native[key] = value;
  }
  return native;
}
