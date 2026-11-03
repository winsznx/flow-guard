import type { Asset } from '../components/ui/types';

const THIN_SPACE = '\u2009';
/** Keeps an amount and its unit on one line, so a title never wraps between "0.005" and "BCH". */
const AMOUNT_UNIT_SPACE = '\u202F';
const ELLIPSIS = '…';
const BCH_DECIMALS = 8;
const LIST_DECIMALS = 4;
const BCH_MIN_DECIMALS = 2;
const SHORT_HEAD = 6;
const SHORT_TAIL = 6;
const ADDRESS_GROUP = 4;

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const RELATIVE_LIMIT_MS = 7 * DAY * 1000;
const UNIX_SECONDS_LIMIT = 1e12;

export type AmountValue = string | number | bigint | null | undefined;
export type AmountPrecision = 'record' | 'list';
export type DateValue = string | number | Date | null | undefined;

export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function formatCount(n: number, one: string, many: string): string {
  return `${groupThousands(String(Math.trunc(Math.abs(n))))} ${plural(n, one, many)}`;
}

export function assetDecimals(asset: Asset): number {
  if (asset.kind === 'bch') return BCH_DECIMALS;
  return Math.max(0, Math.min(18, Math.trunc(asset.decimals)));
}

export function assetUnit(asset: Asset): string {
  if (asset.kind === 'bch') return 'BCH';
  return asset.symbol?.trim() || 'tokens';
}

type DecimalParts = { negative: boolean; whole: string; fraction: string };

function toDecimalParts(value: AmountValue, decimals: number): DecimalParts | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') {
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
    return {
      negative,
      whole: digits.slice(0, digits.length - decimals),
      fraction: digits.slice(digits.length - decimals),
    };
  }

  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    text = value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });
  } else {
    text = value.trim().replace(/,/g, '');
  }

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) return null;

  return {
    negative: match[1] === '-',
    whole: match[2].replace(/^0+(?=\d)/, '') || '0',
    fraction: match[3] ?? '',
  };
}

function isZero(digits: string): boolean {
  return /^0*$/.test(digits);
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export type FormatAmountOptions = {
  precision?: AmountPrecision;
  unit?: boolean;
};

/**
 * Display-unit values come as strings or numbers ("0.70"). A bigint is read as
 * smallest units (satoshis, or the token's base unit) and shifted by the asset's decimals.
 * Values are cut, never rounded up, and a non-zero value never prints as zero.
 * Returns null for a missing or unreadable value so the caller shows its own fallback.
 */
export function formatAmount(
  value: AmountValue,
  asset: Asset,
  { precision = 'record', unit = true }: FormatAmountOptions = {},
): string | null {
  const decimals = assetDecimals(asset);
  const parts = toDecimalParts(value, decimals);
  if (!parts) return null;

  const minDecimals = asset.kind === 'bch' ? BCH_MIN_DECIMALS : 0;
  const maxDecimals = precision === 'list' ? Math.min(decimals, LIST_DECIMALS) : decimals;
  const nonZero = !isZero(parts.whole) || !isZero(parts.fraction);

  let fraction = parts.fraction.slice(0, maxDecimals);
  if (nonZero && isZero(parts.whole) && isZero(fraction)) {
    fraction = parts.fraction.slice(0, decimals);
    if (isZero(fraction)) fraction = parts.fraction;
  }

  fraction = fraction.replace(/0+$/, '');
  const shownMin = Math.min(minDecimals, decimals);
  if (fraction.length < shownMin) fraction = fraction.padEnd(shownMin, '0');

  const sign = parts.negative && nonZero ? '-' : '';
  const number = `${sign}${groupThousands(parts.whole)}${fraction ? `.${fraction}` : ''}`;
  return unit ? `${number}${AMOUNT_UNIT_SPACE}${assetUnit(asset)}` : number;
}

function toBaseUnits(value: AmountValue, decimals: number): bigint | null {
  if (typeof value === 'bigint') return value;
  const parts = toDecimalParts(value, decimals);
  if (!parts) return null;
  const units = BigInt(parts.whole) * 10n ** BigInt(decimals) + BigInt(parts.fraction.slice(0, decimals).padEnd(decimals, '0') || '0');
  return parts.negative ? -units : units;
}

/**
 * Adds amounts without float error. Takes the same values as formatAmount (display-unit strings or
 * numbers, or bigint smallest units) and returns smallest units, which formatAmount reads back.
 */
export function sumAmounts(values: AmountValue[], asset: Asset): bigint | null {
  const decimals = assetDecimals(asset);
  let total = 0n;
  for (const value of values) {
    const units = toBaseUnits(value, decimals);
    if (units === null) return null;
    total += units;
  }
  return total;
}

export function formatUsd(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value > 0 && value < 0.01) return 'less than $0.01';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function stripPrefix(value: string): string {
  const colon = value.indexOf(':');
  return colon === -1 ? value : value.slice(colon + 1);
}

export function formatShortId(value: string): string {
  const id = value.trim();
  if (id.length <= SHORT_HEAD + SHORT_TAIL + 1) return id;
  return `${id.slice(0, SHORT_HEAD)}${ELLIPSIS}${id.slice(-SHORT_TAIL)}`;
}

export type AddressVariant = 'short' | 'full';

export function formatAddress(value: string, variant: AddressVariant = 'short'): string {
  const address = value.trim();
  if (variant === 'short') return formatShortId(stripPrefix(address));

  const colon = address.indexOf(':');
  const prefix = colon === -1 ? '' : address.slice(0, colon + 1);
  const payload = colon === -1 ? address : address.slice(colon + 1);
  const groups = payload.match(new RegExp(`.{1,${ADDRESS_GROUP}}`, 'g')) ?? [];
  return `${prefix}${groups.join(THIN_SPACE)}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_ONLY = /^(\d{4})-(\d{2})$/;

/**
 * Numbers below 1e12 are unix seconds, larger ones milliseconds, because the API sends both.
 * "YYYY-MM-DD" strings are read as that calendar day in local time, never shifted by time zone.
 */
export function toDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return new Date(value < UNIX_SECONDS_LIMIT ? value * 1000 : value);
  }

  const dateOnly = DATE_ONLY.exec(value.trim());
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type FormatDateOptions = {
  dropSameYear?: boolean;
  now?: number;
};

export function formatDate(value: DateValue, { dropSameYear = false, now = Date.now() }: FormatDateOptions = {}): string | null {
  const date = toDate(value);
  if (!date) return null;
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: dropSameYear && sameYear ? undefined : 'numeric',
  });
}

/** For values known only to the month ("2026-03" reads "March 2026"). Full dates fall back to formatDate. */
export function formatMonth(value: DateValue): string | null {
  if (typeof value === 'string') {
    const month = MONTH_ONLY.exec(value.trim());
    if (month) {
      const monthIndex = Number(month[2]) - 1;
      if (monthIndex < 0 || monthIndex > 11) return null;
      return new Date(Number(month[1]), monthIndex, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
  }
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export type FormatDateTimeOptions = {
  withZone?: boolean;
};

export function formatDateTime(value: DateValue, { withZone = false }: FormatDateTimeOptions = {}): string | null {
  const date = toDate(value);
  if (!date) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: withZone ? 'short' : undefined,
  });
}

export function formatRelative(value: DateValue, now: number = Date.now()): string | null {
  const date = toDate(value);
  if (!date) return null;

  const diffMs = date.getTime() - now;
  if (Math.abs(diffMs) >= RELATIVE_LIMIT_MS) return formatDate(date, { now });

  const seconds = Math.floor(Math.abs(diffMs) / 1000);
  const future = diffMs > 0;

  if (seconds < MINUTE) return future ? 'in under a minute' : 'just now';

  let amount: string;
  if (seconds < HOUR) {
    amount = `${Math.floor(seconds / MINUTE)} min`;
  } else if (seconds < DAY) {
    const hours = Math.floor(seconds / HOUR);
    amount = formatCount(hours, 'hour', 'hours');
  } else {
    const days = Math.floor(seconds / DAY);
    amount = formatCount(days, 'day', 'days');
  }

  return future ? `in ${amount}` : `${amount} ago`;
}

const DURATION_UNITS: { seconds: number; one: string; many: string }[] = [
  { seconds: WEEK, one: 'week', many: 'weeks' },
  { seconds: DAY, one: 'day', many: 'days' },
  { seconds: HOUR, one: 'hour', many: 'hours' },
  { seconds: MINUTE, one: 'minute', many: 'minutes' },
  { seconds: SECOND, one: 'second', many: 'seconds' },
];

/**
 * Durations in words from seconds. Months and years are never used, since every
 * interval FlowGuard stores is a fixed number of days. Weeks are used only when exact.
 */
export function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds === null || totalSeconds === undefined || !Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return null;
  }

  let remaining = Math.floor(totalSeconds);
  if (remaining === 0) return '0 minutes';

  const units = remaining % WEEK === 0 ? DURATION_UNITS : DURATION_UNITS.slice(1);
  const parts: string[] = [];
  for (const unit of units) {
    if (parts.length === 2) break;
    const count = Math.floor(remaining / unit.seconds);
    if (count === 0) {
      if (parts.length > 0) break;
      continue;
    }
    parts.push(formatCount(count, unit.one, unit.many));
    remaining -= count * unit.seconds;
  }
  return parts.join(' ');
}

export function formatInterval(totalSeconds: number | null | undefined): string | null {
  const duration = formatDuration(totalSeconds);
  if (!duration) return null;
  const single = /^1 (\w+)$/.exec(duration);
  return single ? `every ${single[1]}` : `every ${duration}`;
}

export function formatIntervalDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined || !Number.isFinite(days) || days <= 0) return null;
  return formatInterval(days * DAY);
}
