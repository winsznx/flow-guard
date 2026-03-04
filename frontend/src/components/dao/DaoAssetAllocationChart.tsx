import { Card } from '../ui/Card';
import { formatUsd, type DaoWorkspaceAsset } from '../../stores/useDaoWorkspace';

interface DaoAssetAllocationChartProps {
  assets: DaoWorkspaceAsset[];
}

const categoryTone = {
  BCH: 'bg-primary',
  STABLECOIN: 'bg-accent',
  GOVERNANCE: 'bg-secondary',
  NFT: 'bg-textMuted',
} as const;

export function DaoAssetAllocationChart({ assets }: DaoAssetAllocationChartProps) {
  const total = assets.reduce((sum, asset) => sum + asset.valueUsdNumber, 0);

  return (
    <Card padding="lg" className="border-border/40">
      <div className="mb-5">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Treasury Mix</p>
        <h2 className="mt-2 font-display text-2xl text-textPrimary">Asset allocation</h2>
        <p className="mt-2 text-sm leading-6 text-textSecondary">
          Track how BCH, stablecoins, governance tokens, and treasury receipts are distributed across the organization.
        </p>
      </div>

      <div className="mb-5 h-4 overflow-hidden rounded-full bg-primarySoft/60">
        <div className="flex h-full">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className={categoryTone[asset.category]}
              style={{ width: `${asset.allocation}%` }}
              title={`${asset.symbol}: ${asset.allocation}%`}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-2xl border border-border/30 bg-surfaceAlt p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-3 w-3 rounded-full ${categoryTone[asset.category]}`} />
                  <h3 className="font-display text-lg text-textPrimary">{asset.symbol}</h3>
                </div>
                <p className="mt-1 text-sm text-textSecondary">{asset.name}</p>
              </div>
              <div className="text-right">
                <p className="font-display text-lg text-textPrimary">{asset.valueUsd}</p>
                <p className="text-xs font-mono text-textMuted">{asset.balance}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-mono text-textMuted">
              <span className="rounded-full bg-surface px-2 py-1">{asset.allocation}% of treasury</span>
              <span className="rounded-full bg-surface px-2 py-1">{asset.vaults} vaults</span>
              <span className="rounded-full bg-surface px-2 py-1">{asset.executionLane}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-2xl bg-surfaceAlt p-4">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Total tracked value</p>
        <p className="mt-2 font-display text-3xl text-textPrimary">{formatUsd(total)}</p>
      </div>
    </Card>
  );
}
