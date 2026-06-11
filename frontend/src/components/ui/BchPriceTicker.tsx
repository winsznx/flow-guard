/**
 * BchPriceTicker - compact display of the live BCH/USD reading.
 *
 * Variants:
 *   - "inline" (default): minimal pill suitable for footers and status bars.
 *   - "card": surface-style card with explicit source attribution, for the
 *     Status page or marketing hero.
 */

import { useBchPrice } from '../../utils/usePrice';
import { ShieldCheck, Globe, AlertCircle } from 'lucide-react';

export interface BchPriceTickerProps {
  variant?: 'inline' | 'card';
  className?: string;
}

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n < 10 ? 4 : 2,
  });
}

function formatRelativeTime(unixMs: number): string {
  const deltaSec = Math.max(0, Math.round((Date.now() - unixMs) / 1000));
  if (deltaSec < 60) return `${deltaSec}s ago`;
  if (deltaSec < 3600) return `${Math.round(deltaSec / 60)} min ago`;
  return `${Math.round(deltaSec / 3600)} h ago`;
}

export function BchPriceTicker({ variant = 'inline', className = '' }: BchPriceTickerProps) {
  const { price, source, isLoading, isStale, error, reading } = useBchPrice();

  if (variant === 'card') {
    return (
      <div className={`rounded-2xl border border-border bg-surface p-5 sm:p-6 ${className}`.trim()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-mono uppercase tracking-wider text-textMuted">BCH / USD</p>
            <p className="mt-2 font-display text-3xl text-textPrimary">
              {price !== null ? formatUsd(price) : isLoading ? '…' : ' - '}
            </p>
          </div>
          <div className="text-right">
            {source === 'oracle' && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-primarySoft px-3 py-1 text-xs font-medium text-primary"
                title={`Signed by oracle ${reading?.oraclePubkey?.slice(0, 14) ?? ''}…`}
              >
                <ShieldCheck className="h-3.5 w-3.5" /> On-chain oracle
              </span>
            )}
            {source === 'coingecko' && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surfaceAlt px-3 py-1 text-xs font-medium text-textSecondary">
                <Globe className="h-3.5 w-3.5" /> CoinGecko fallback
              </span>
            )}
            {error && !source && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surfaceAlt px-3 py-1 text-xs font-medium text-textSecondary">
                <AlertCircle className="h-3.5 w-3.5" /> Feed unavailable
              </span>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-textMuted">
          {reading
            ? `Updated ${formatRelativeTime(reading.updatedAt)} · ${
                source === 'oracle'
                  ? 'General Protocols USD/BCH oracle, verifiable on-chain'
                  : 'Public price API'
              }`
            : isLoading
              ? 'Fetching latest reading…'
              : 'No reading available'}
          {isStale && reading ? ' · stale' : ''}
        </p>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 font-mono text-xs text-textSecondary ${className}`.trim()}
      title={
        source === 'oracle'
          ? 'BCH/USD signed by the General Protocols oracle (on-chain verifiable)'
          : source === 'coingecko'
            ? 'BCH/USD via CoinGecko fallback'
            : 'BCH/USD price feed'
      }
    >
      <span className={`h-1.5 w-1.5 rounded-full ${source === 'oracle' ? 'bg-primary' : 'bg-textMuted'}`} />
      <span>BCH/USD {price !== null ? formatUsd(price) : isLoading ? '…' : ' - '}</span>
    </span>
  );
}
