import { Code } from './Code';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import type { Asset } from './types';
import { LABELS } from '../../copy/common';
import { formatAmount, formatRelative, formatShortId, formatUsd } from '../../copy/format';

export type AmountProps = {
  value: string | number | bigint | null | undefined;
  asset: Asset;
  size?: 'md' | 'lg' | 'xl';
  precision?: 'record' | 'list';
  fiat?: { usd: number; source: string; at: number } | null;
};

const SIZE = {
  md: 'text-amount',
  lg: 'text-amount-lg',
  xl: 'text-amount-xl',
} as const;

function fiatSource(fiat: NonNullable<AmountProps['fiat']>): string {
  const when = formatRelative(fiat.at);
  return when ? `Price from ${fiat.source}, ${when}` : `Price from ${fiat.source}`;
}

export function Amount({ value, asset, size = 'md', precision = 'record', fiat }: AmountProps) {
  const text = formatAmount(value, asset, { precision });
  const fiatText = fiat && size !== 'md' ? formatUsd(fiat.usd) : null;
  const unnamedToken = asset.kind === 'token' && !asset.symbol?.trim() ? asset.tokenId : null;

  if (!text) {
    return <span className="text-body text-ink-muted">{LABELS.notSet}</span>;
  }

  return (
    <span className="inline-flex flex-col">
      <span className={cx('whitespace-nowrap text-ink', SIZE[size])}>{text}</span>
      {unnamedToken ? (
        <span className="text-small text-ink-muted">
          {LABELS.tokenId} <Code>{formatShortId(unnamedToken)}</Code>
        </span>
      ) : null}
      {fiat && fiatText ? (
        <Tooltip content={fiatSource(fiat)}>
          <span className="w-fit text-small text-ink-muted">
            about {fiatText}
            <span className="sr-only">. {fiatSource(fiat)}</span>
          </span>
        </Tooltip>
      ) : null}
    </span>
  );
}
