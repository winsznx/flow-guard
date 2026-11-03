import { CopyButton } from './CopyButton';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import { ACTIONS, LABELS } from '../../copy/common';
import { formatAddress } from '../../copy/format';

export type AddressProps = { value: string; variant?: 'short' | 'full'; name?: string; isYou?: boolean; copy?: boolean };

export function Address({ value, variant = 'short', name, isYou = false, copy = true }: AddressProps) {
  const address = value.trim();
  const label = name ?? (isYou ? LABELS.yourWallet : undefined);
  const shown = formatAddress(address, variant);
  const ink = label ? 'text-ink-muted' : 'text-ink';

  const machine =
    variant === 'full' ? (
      <span className={cx('font-mono text-mono break-words', ink)}>{shown}</span>
    ) : (
      <Tooltip content={address}>
        <span className={cx('whitespace-nowrap font-mono text-mono', ink)}>
          <span aria-hidden="true">{shown}</span>
          <span className="sr-only">{address}</span>
        </span>
      </Tooltip>
    );

  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {label ? (
        <span className="flex min-w-0 flex-col">
          <span className="text-body text-ink">{label}</span>
          {machine}
        </span>
      ) : (
        machine
      )}
      {copy && address ? <CopyButton value={address} label={ACTIONS.copyAddress} size="sm" /> : null}
    </span>
  );
}
