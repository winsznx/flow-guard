import { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Icon } from './Icon';
import {
  BUTTON_BASE,
  BUTTON_ICON_SIZE,
  BUTTON_INACTIVE,
  BUTTON_LINK_BASE,
  BUTTON_LINK_INACTIVE,
  BUTTON_REASON,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonProps,
} from './Button';
import { cx } from './cx';

/**
 * `to` is a route in the app. `href` with `external` opens another site in a new tab. `href` without
 * `external` stays in the same tab with no arrow, for `mailto:` links and other plain URLs.
 */
export type ButtonLinkProps = Omit<ButtonProps, 'onClick' | 'type' | 'form' | 'busy' | 'busyLabel'> & {
  'aria-label'?: string;
} & ({ to: string; external?: false; href?: never } | { href: string; external: true; to?: never } | { href: string; external?: false; to?: never });

/** An icon is a block svg, so a link that carries one lays out as a row to keep the icon on the label's line. */
const LINK_WITH_ICON_BASE = BUTTON_LINK_BASE.replace(/^inline /, 'inline-flex items-center gap-1 ');

export function ButtonLink(props: ButtonLinkProps) {
  const reasonId = useId();
  const {
    variant = 'secondary',
    size = 'md',
    leadingIcon,
    trailingIcon,
    fullWidth,
    children,
    className,
    disabled = false,
    disabledReason,
    standalone = false,
  } = props;
  const isLink = variant === 'link';
  const iconSize = BUTTON_ICON_SIZE[size];
  const trailing = trailingIcon ?? (props.external ? ArrowUpRight : undefined);
  const showReason = disabled && Boolean(disabledReason);
  const describedBy = [props['aria-describedby'], showReason ? reasonId : undefined].filter(Boolean).join(' ') || undefined;

  const look = isLink
    ? cx(leadingIcon || trailing || standalone ? LINK_WITH_ICON_BASE : BUTTON_LINK_BASE, disabled ? BUTTON_LINK_INACTIVE : BUTTON_VARIANTS.link)
    : cx(BUTTON_BASE, BUTTON_SIZES[size], disabled ? BUTTON_INACTIVE : BUTTON_VARIANTS[variant]);
  const linkClassName = cx(look, fullWidth && 'w-full', !disabledReason && className);

  const content = (
    <>
      {leadingIcon ? <Icon icon={leadingIcon} size={iconSize} /> : null}
      {children}
      {trailing ? <Icon icon={trailing} size={iconSize} /> : null}
      {props.external ? <span className="sr-only">, opens in a new tab</span> : null}
    </>
  );

  const shared = {
    className: linkClassName,
    'aria-label': props['aria-label'],
    'aria-expanded': props['aria-expanded'],
    'aria-controls': props['aria-controls'],
    'aria-haspopup': props['aria-haspopup'],
    'aria-pressed': props['aria-pressed'],
    'aria-describedby': describedBy,
    'data-inline': (isLink && !standalone) || undefined,
    'data-control': isLink && !standalone ? undefined : true,
  };

  const link = disabled ? (
    <a {...shared} role="link" aria-disabled="true" tabIndex={0}>
      {content}
    </a>
  ) : props.external ? (
    <a {...shared} href={props.href} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : props.to !== undefined ? (
    <Link {...shared} to={props.to}>
      {content}
    </Link>
  ) : (
    <a {...shared} href={props.href}>
      {content}
    </a>
  );

  if (!disabledReason) return link;

  return (
    <span className={cx('inline-flex flex-col items-start gap-1.5', fullWidth && 'w-full', className)}>
      {link}
      {showReason ? (
        <span id={reasonId} className={BUTTON_REASON}>
          {disabledReason}
        </span>
      ) : null}
    </span>
  );
}
