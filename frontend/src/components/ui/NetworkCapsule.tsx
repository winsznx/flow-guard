import { Link } from 'react-router-dom';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import { NETWORK_HINT, NETWORK_LABEL } from '../../copy/network';

export type NetworkCapsuleProps = { network: 'mainnet' | 'chipnet'; to?: string };

const LOOK = {
  mainnet: { pill: 'border-line bg-surface text-ink-secondary', dot: 'bg-success-dot' },
  chipnet: { pill: 'border-transparent bg-warning-tint text-warning-ink', dot: 'bg-warning-dot' },
} as const;

const BASE =
  'inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-caption';

export function NetworkCapsule({ network, to }: NetworkCapsuleProps) {
  const look = LOOK[network];
  const content = (
    <>
      <span aria-hidden="true" className={cx('size-1.5 rounded-pill', look.dot)} />
      {NETWORK_LABEL[network]}
      <span className="sr-only">. {NETWORK_HINT[network]}</span>
    </>
  );

  return (
    <Tooltip content={NETWORK_HINT[network]}>
      {to ? (
        <Link
          to={to}
          data-control
          className={cx(BASE, look.pill, 'transition-colors duration-(--duration-fast) ease-standard hover:border-line-control')}
        >
          {content}
        </Link>
      ) : (
        <span className={cx(BASE, look.pill)}>
          {content}
        </span>
      )}
    </Tooltip>
  );
}
