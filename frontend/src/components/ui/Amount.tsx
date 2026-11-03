import { AssetIcon } from './AssetIcon';
import { Code } from './Code';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import type { Asset } from './types';
import { LABELS } from '../../copy/common';
import { formatAmount, formatRelative, formatShortId, formatUsd } from '../../copy/format';
import { useTokenMeta } from '../../hooks/useTokenMeta';

export type AmountProps = {
  value: string | number | bigint | null | undefined;
  asset: Asset;
  size?: 'md' | 'lg' | 'xl';
  precision?: 'record' | 'list';
  fiat?: { usd: number; source: string; at: number } | null;
  /** Leave off the coin logo, for amounts that sit inside a sentence. */
  plain?: boolean;
};

const SIZE = {
  md: 'text-amount',
  lg: 'text-amount-lg',
  xl: 'text-amount-xl',
} as const;

const ICON_SIZE = { md: 'sm', lg: 'lg', xl: 'xl' } as const;

function fiatSource(fiat: NonNullable<AmountProps['fiat']>): string {
  const when = formatRelative(fiat.at);
  return when ? `Price from ${fiat.source}, ${when}` : `Price from ${fiat.source}`;
}

/** Fills in the token's symbol from the registry, but only when its decimals match, so the amount never rescales. */
function useNamedAsset(asset: Asset): Asset {
  const meta = useTokenMeta(asset.kind === 'token' && !asset.symbol?.trim() ? asset.tokenId : null);
  if (asset.kind !== 'token' || asset.symbol?.trim() || !meta?.symbol?.trim() || meta.decimals !== asset.decimals) return asset;
  return { ...asset, symbol: meta.symbol.trim() };
}

export function Amount({ value, asset: given, size = 'md', precision = 'record', fiat, plain = false }: AmountProps) {
  const asset = useNamedAsset(given);
  const text = formatAmount(value, asset, { precision });
  const fiatText = fiat && size !== 'md' ? formatUsd(fiat.usd) : null;
  const unnamedToken = precision === 'record' && asset.kind === 'token' && !asset.symbol?.trim() ? asset.tokenId : null;

  if (!text) {
    return <span className="text-body text-ink-muted">{LABELS.notSet}</span>;
  }

  return (
    <span className="inline-flex flex-col">
      <span className={cx('inline-flex items-center', size === 'md' ? 'gap-1.5' : 'gap-2.5')}>
        {plain ? null : <AssetIcon asset={asset} size={ICON_SIZE[size]} />}
        <span className={cx('whitespace-nowrap text-ink', SIZE[size])}>{text}</span>
      </span>
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
