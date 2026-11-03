import { cx } from './cx';
import type { BlockProps } from './InsetBlock';

export function DashedCard({ children, className }: BlockProps) {
  return <div className={cx('border border-dashed border-line-strong rounded-card p-4 sm:p-5', className)}>{children}</div>;
}
