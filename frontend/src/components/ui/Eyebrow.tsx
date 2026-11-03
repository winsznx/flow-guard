import { cx } from './cx';

export type EyebrowProps = {
  children: string;
  className?: string;
  /** Render as a heading when the eyebrow names a section, such as an FAQ group. */
  as?: 'p' | 'h2' | 'h3';
  id?: string;
} & (
  | { number?: string; onInverse?: false }
  | { number?: never; onInverse: true }
);

export function Eyebrow({ children, number, onInverse = false, className, as: Tag = 'p', id }: EyebrowProps) {
  return (
    <Tag
      id={id}
      className={cx(
        'font-mono text-eyebrow uppercase',
        onInverse ? 'text-ink-inverse-muted' : 'text-ink-muted',
        className,
      )}
    >
      {number ? (
        <>
          <span className="text-brand">{number}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">. </span>
        </>
      ) : null}
      {children}
    </Tag>
  );
}
