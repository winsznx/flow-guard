import { SITE_NAME } from '../../copy/nav';
import { cx } from '../ui/cx';

export type LogoProps = { variant?: 'full' | 'mark'; className?: string };

const FULL_SOURCE = '/assets/flow-green.png';
const MARK_SOURCE = '/assets/flow-logo.png';

const SIZE = {
  full: 'h-7 w-auto',
  mark: 'h-8 w-auto',
} as const;

export function Logo({ variant = 'full', className }: LogoProps) {
  return <img src={variant === 'full' ? FULL_SOURCE : MARK_SOURCE} alt={SITE_NAME} className={cx('block shrink-0 object-contain', SIZE[variant], className)} />;
}
