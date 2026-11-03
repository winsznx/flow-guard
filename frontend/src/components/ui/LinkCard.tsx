import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CARD_PADDING, CARD_SURFACE } from './Card';
import { ArrowUpRight, ChevronRight, Icon } from './Icon';
import { cx } from './cx';

type SelectTarget = {
  onSelect: () => void;
  /** Rendered as aria-disabled so the row keeps focus while its action is in progress. */
  disabled?: boolean;
};

type LinkTarget = { to: string } | { href: string; external: true } | SelectTarget;

export type LinkCardProps = LinkTarget & {
  icon?: LucideIcon;
  title: string;
  description: string;
  meta?: React.ReactNode;
  className?: string;
};

const ROOT = cx(
  CARD_SURFACE,
  CARD_PADDING,
  'relative flex items-start gap-4 transition-colors duration-(--duration-fast) ease-standard hover:border-line-strong',
);

const STRETCH = 'after:absolute after:inset-0 after:rounded-card';

export function LinkCard(props: LinkCardProps) {
  const { icon, title, description, meta, className } = props;
  const external = 'href' in props;

  const body = (
    <>
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-sunken text-ink-secondary">
          <Icon icon={icon} size={20} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <TitleSlot {...props}>{title}</TitleSlot>
        <span className="text-small text-ink-secondary">{description}</span>
        {meta ? <span className="text-small text-ink-muted">{meta}</span> : null}
      </span>
      <span className="mt-1 shrink-0 text-ink-muted">
        <Icon icon={external ? ArrowUpRight : ChevronRight} size={16} />
      </span>
    </>
  );

  if ('onSelect' in props) {
    return (
      <button
        type="button"
        onClick={props.disabled ? undefined : props.onSelect}
        aria-disabled={props.disabled || undefined}
        className={cx(
          ROOT,
          'w-full text-left aria-disabled:cursor-not-allowed aria-disabled:bg-sunken aria-disabled:hover:border-line',
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={cx(ROOT, className)}>{body}</div>;
}

function TitleSlot(props: LinkCardProps & { children: string }) {
  const titleClass = 'text-title-item text-ink';
  if ('to' in props) {
    return (
      <Link to={props.to} className={cx(titleClass, STRETCH)}>
        {props.children}
      </Link>
    );
  }
  if ('href' in props) {
    return (
      <a href={props.href} target="_blank" rel="noopener noreferrer" className={cx(titleClass, STRETCH)}>
        {props.children}
        <span className="sr-only">, opens in a new tab</span>
      </a>
    );
  }
  return <span className={titleClass}>{props.children}</span>;
}
