import { AssetIcon } from './AssetIcon';
import { Code } from './Code';
import { CopyButton } from './CopyButton';
import type { Asset } from './types';
import { ACTIONS, LABELS } from '../../copy/common';
import { formatShortId } from '../../copy/format';
import { useTokenMeta } from '../../hooks/useTokenMeta';

export type AssetNameProps = { asset: Asset };

/** Which coin something is paid in: its logo and name, and for a token the ID to copy. */
export function AssetName({ asset }: AssetNameProps) {
  const meta = useTokenMeta(asset.kind === 'token' ? asset.tokenId : null);

  if (asset.kind === 'bch') {
    return (
      <span className="inline-flex items-center gap-2">
        <AssetIcon asset={asset} size="md" />
        <span className="text-ink">BCH</span>
        <span className="text-small text-ink-muted">{LABELS.bitcoinCash}</span>
      </span>
    );
  }

  const symbol = asset.symbol?.trim() || meta?.symbol?.trim();
  const name = meta?.name?.trim();

  return (
    <span className="inline-flex flex-col items-start gap-1 sm:items-end">
      <span className="inline-flex items-center gap-2">
        <AssetIcon asset={asset} size="md" />
        <span className="text-ink">{symbol || LABELS.unnamedToken}</span>
        {name && name !== symbol ? <span className="text-small text-ink-muted">{name}</span> : null}
      </span>
      <span className="inline-flex items-center gap-1 text-small text-ink-muted">
        {LABELS.tokenId} <Code>{formatShortId(asset.tokenId)}</Code>
        <CopyButton value={asset.tokenId} label={ACTIONS.copyTokenId} />
      </span>
    </span>
  );
}
