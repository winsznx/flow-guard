import React from 'react';
import { cx } from './cx';

export type CardProps = {
  as?: 'div' | 'section' | 'article' | 'li';
  padding?: 'none' | 'md';
  /** Outlines the card, for the item a link points at. */
  highlighted?: boolean;
  children: React.ReactNode;
  className?: string;
  id?: string;
};

type LegacyCardProps = {
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  children: React.ReactNode;
  className?: string;
};

export const CARD_SURFACE = 'bg-surface border border-line rounded-card';

export const CARD_PADDING = 'p-4 sm:p-5';

export function Card(props: CardProps | LegacyCardProps) {
  const { padding = 'md', children, className } = props;
  const Element = 'as' in props && props.as ? props.as : 'div';
  const id = 'id' in props ? props.id : undefined;
  const hover = 'hover' in props && props.hover;
  const highlighted = 'highlighted' in props && props.highlighted;

  return (
    <Element
      id={id}
      className={cx(
        CARD_SURFACE,
        padding !== 'none' && CARD_PADDING,
        hover && 'transition-colors duration-(--duration-fast) hover:border-line-strong',
        highlighted && 'outline-2 outline-offset-2 outline-focus outline-solid',
        className,
      )}
    >
      {children}
    </Element>
  );
}
