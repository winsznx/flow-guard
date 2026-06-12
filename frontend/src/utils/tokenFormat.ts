/**
 * Single canonical formatter for any on-chain amount in the FlowGuard UI.
 *
 * Today every detail page reinvents its own formatter (formatBch /
 * formatAssetAmount / formatBountyAmount / inline `toFixed(4) + ' BCH'`).
 * That's why AirdropDetailPage + PaymentDetailPage silently relabel
 * CashToken amounts as BCH while other detail pages get it right.
 *
 * Use this everywhere. Pages should pass the parent entity's token_type
 * (and token_category when known); the function decides the symbol and
 * the number of decimal places.
 *
 * BCH: 4 decimals, suffix " BCH"
 * Fungible CashToken: integer, suffix " <CT · 7a1b…3f>" if category known, else " tokens"
 * Unknown / null: render with no suffix and a "?" marker so it's obvious the
 *   backend didn't supply token_type — better than silently lying with "BCH".
 */

export type TokenType = 'BCH' | 'CASHTOKENS' | 'FUNGIBLE_TOKEN' | string | null | undefined;

export interface FormatTokenAmountOptions {
  /** Override decimals. BCH defaults to 4, CashToken integers to 0. */
  decimals?: number;
  /** When true, force the suffix to be omitted (use for input placeholders). */
  noSuffix?: boolean;
  /** When true, include thousands separator on the integer portion. */
  separator?: boolean;
}

export function formatTokenAmount(
  amount: number | string | null | undefined,
  tokenType: TokenType,
  tokenCategory?: string | null,
  options: FormatTokenAmountOptions = {},
): string {
  const numeric = typeof amount === 'string' ? Number(amount) : amount;
  if (numeric === null || numeric === undefined || Number.isNaN(numeric)) {
    return '—';
  }

  const isBch = tokenType === 'BCH' || tokenType === undefined || tokenType === null;
  const isToken = tokenType === 'CASHTOKENS' || tokenType === 'FUNGIBLE_TOKEN';

  if (isBch) {
    const decimals = options.decimals ?? 4;
    const value = options.separator ? formatWithSep(numeric, decimals) : numeric.toFixed(decimals);
    return options.noSuffix ? value : `${value} BCH`;
  }

  if (isToken) {
    const decimals = options.decimals ?? 0;
    const value = options.separator ? formatWithSep(numeric, decimals) : numeric.toFixed(decimals);
    const suffix = options.noSuffix
      ? ''
      : tokenCategory
        ? ` · CT ${shortenCategory(tokenCategory)}`
        : ' tokens';
    return `${value}${suffix}`;
  }

  // Unknown / unsupported token type. Surface visibly rather than defaulting to BCH.
  const decimals = options.decimals ?? 4;
  const value = options.separator ? formatWithSep(numeric, decimals) : numeric.toFixed(decimals);
  return options.noSuffix ? value : `${value} ?`;
}

/**
 * Just the symbol, without an amount. For column headers, badges, etc.
 */
export function tokenSymbol(tokenType: TokenType, tokenCategory?: string | null): string {
  if (tokenType === 'BCH' || !tokenType) return 'BCH';
  if (tokenType === 'CASHTOKENS' || tokenType === 'FUNGIBLE_TOKEN') {
    return tokenCategory ? `CT ${shortenCategory(tokenCategory)}` : 'tokens';
  }
  return tokenType;
}

function shortenCategory(category: string): string {
  if (category.length <= 8) return category;
  return `${category.slice(0, 4)}…${category.slice(-3)}`;
}

function formatWithSep(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  const [whole, frac] = fixed.split('.');
  const sep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${sep}.${frac}` : sep;
}
