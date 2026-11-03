import { useSyncExternalStore } from 'react';
import type { Asset } from '../components/ui/types';
import { lifecycleStatus, type StatusKey } from '../copy/status';
import { getCachedTokenMeta, type TokenMeta } from './tokenMeta';

const BCH_DECIMALS = 8;
const MAX_TOKEN_DECIMALS = 18;
const BCH: Asset = { kind: 'bch' };

/** The fields bounties and reward programs share for amounts, dates and status. */
export type CampaignRow = {
  status: string;
  token_type?: string | null;
  token_category?: string | null;
  token_decimals?: number | null;
  start_date?: number | null;
  end_date?: number | null;
};

/** How people type an amount for a row: in the token's own unit, or in its smallest unit. */
export type AmountEntry = { asset: Asset; unit: 'display' | 'base'; decimals: number };

function isBch(row: CampaignRow): boolean {
  return row.token_type === 'BCH' || !row.token_category;
}

function clampDecimals(value: number | null | undefined): number {
  const n = Math.trunc(Number(value ?? 0));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_TOKEN_DECIMALS, n)) : 0;
}

/**
 * The decimals the server uses to turn this row's stored amounts into on-chain units.
 * Rows made before token decimals were recorded carry 0, whatever the token's metadata says.
 */
export function storedDecimals(row: CampaignRow): number {
  return isBch(row) ? BCH_DECIMALS : clampDecimals(row.token_decimals);
}

/** The asset amounts are shown in. Token decimals come from metadata when it is known. */
export function campaignAsset(row: CampaignRow, meta?: TokenMeta | null): Asset {
  if (isBch(row) || !row.token_category) return BCH;
  const known = meta ?? getCachedTokenMeta(row.token_category);
  return {
    kind: 'token',
    tokenId: row.token_category,
    symbol: known?.symbol,
    decimals: clampDecimals(known?.decimals ?? row.token_decimals),
  };
}

/** A stored amount in on-chain units, rounded the way the server rounds it. */
export function storedUnits(value: number | null | undefined, row: CampaignRow): bigint {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 10 ** storedDecimals(row)));
}

/** On-chain units back to the number the server stores and converts. */
export function unitsToStored(units: bigint, row: CampaignRow): number {
  return Number(units) / 10 ** storedDecimals(row);
}

/**
 * Amounts are typed in the token's unit when the server converts with the same decimals the
 * page shows. Otherwise they are typed in smallest units, so what is typed is what moves.
 */
export function amountEntry(row: CampaignRow, asset: Asset): AmountEntry {
  const decimals = storedDecimals(row);
  if (asset.kind === 'bch') return { asset, unit: 'display', decimals: BCH_DECIMALS };
  if (asset.decimals === decimals) return { asset, unit: 'display', decimals };
  return { asset, unit: 'base', decimals: 0 };
}

export type ParsedAmount = { units: bigint } | { tooPrecise: true } | null;

/**
 * A typed amount in smallest units, given the decimals it may carry. Too many decimals is
 * reported rather than cut, so a review never shows a different amount than the one sent.
 */
export function parseAmount(text: string, decimals: number): ParsedAmount {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match || (match[1] === '' && (match[2] ?? '') === '')) return null;
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > decimals) return { tooPrecise: true };
  return { units: BigInt(`${match[1] || '0'}${fraction.padEnd(decimals, '0')}`) };
}

export function parsedUnits(parsed: ParsedAmount): bigint | null {
  return parsed && 'units' in parsed ? parsed.units : null;
}

/** Status for a row, reading an active item whose end date has passed as expired. */
export function campaignStatus(row: CampaignRow, now: number = Date.now()): StatusKey {
  const ended = Boolean(row.end_date && row.end_date > 0 && now > row.end_date * 1000);
  if (row.status === 'ACTIVE' && ended) return 'expired';
  return lifecycleStatus(row.status, { startsAt: row.start_date ? row.start_date * 1000 : null, now }) ?? 'notFunded';
}

const TABLE_QUERY = '(min-width: 768px)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(TABLE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * True while `List` draws a table, so list cells can carry their own words in the card layout,
 * where column headers aren't shown. Mirrors `List`'s breakpoint, for
 * cells whose words change by row, which a column's `mobileLabel` can't do.
 */
export function useTableLayout(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(TABLE_QUERY).matches,
    () => true,
  );
}
