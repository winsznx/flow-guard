import { getCachedTokenMeta } from './tokenMeta';
import type { Asset } from '../components/ui/types';
import { LABELS } from '../copy/common';
import { formatAmount, formatShortId, type AmountPrecision } from '../copy/format';

export type TokenType = 'BCH' | 'CASHTOKENS' | 'FUNGIBLE_TOKEN' | string | null | undefined;

export interface FormatTokenAmountOptions {
  /** Most decimals to show. BCH at 4 or fewer uses the list form. A non-zero value never shows as 0. */
  decimals?: number;
  noSuffix?: boolean;
  /** Kept for existing callers. Amounts always use en-US thousands separators. */
  separator?: boolean;
}

const LIST_DECIMALS = 4;
const MAX_TOKEN_DECIMALS = 18;
const TOKENS_UNIT = 'tokens';

function isBchType(tokenType: TokenType): boolean {
  return tokenType === 'BCH' || tokenType === undefined || tokenType === null || tokenType === '';
}

function isTokenType(tokenType: TokenType): boolean {
  return tokenType === 'CASHTOKENS' || tokenType === 'FUNGIBLE_TOKEN';
}

function tokenAsset(tokenType: TokenType, tokenCategory: string | null | undefined, decimals: number | undefined): Asset {
  const meta = isTokenType(tokenType) ? getCachedTokenMeta(tokenCategory) : null;
  return {
    kind: 'token',
    tokenId: tokenCategory ?? '',
    symbol: meta?.symbol,
    decimals: decimals ?? meta?.decimals ?? MAX_TOKEN_DECIMALS,
  };
}

/**
 * String form of an amount for places that can't render the Amount component yet. Values are in
 * display units and are cut, never rounded up, by copy/format.ts. Missing values read "Not set".
 */
export function formatTokenAmount(
  amount: number | string | null | undefined,
  tokenType: TokenType,
  tokenCategory?: string | null,
  options: FormatTokenAmountOptions = {},
): string {
  const unit = !options.noSuffix;

  if (isBchType(tokenType)) {
    const precision: AmountPrecision =
      options.decimals !== undefined && options.decimals <= LIST_DECIMALS ? 'list' : 'record';
    return formatAmount(amount, { kind: 'bch' }, { precision, unit }) ?? LABELS.notSet;
  }

  const asset = tokenAsset(tokenType, tokenCategory, options.decimals);
  const text = formatAmount(amount, asset, { unit });
  if (text === null) return LABELS.notSet;
  if (!unit || asset.kind !== 'token' || asset.symbol || !tokenCategory) return text;
  return `${text} (${shortenCategory(tokenCategory)})`;
}

export function tokenSymbol(tokenType: TokenType, tokenCategory?: string | null): string {
  if (isBchType(tokenType)) return 'BCH';
  if (isTokenType(tokenType)) return getCachedTokenMeta(tokenCategory)?.symbol?.trim() || TOKENS_UNIT;
  return TOKENS_UNIT;
}

export function shortenCategory(category: string): string {
  return formatShortId(category);
}
