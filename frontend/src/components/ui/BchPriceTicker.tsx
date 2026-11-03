import { Card } from './Card';
import { Globe, Icon, ShieldCheck, TriangleAlert, type LucideIcon } from './Icon';
import { Tooltip } from './Tooltip';
import { cx } from './cx';
import { formatRelative, formatUsd } from '../../copy/format';
import { useBchPrice } from '../../utils/usePrice';

export interface BchPriceTickerProps {
  variant?: 'inline' | 'card';
  className?: string;
}

const PAIR = 'BCH/USD';
const NOT_AVAILABLE = 'Not available';
const LOADING_PRICE = 'Loading price';
const PRICE_UNAVAILABLE = 'Price unavailable';
const MAY_BE_OUT_OF_DATE = 'may be out of date';

const SOURCE = {
  oracle: {
    tag: 'Signed price',
    line: 'Signed by General Protocols. Anyone can check it.',
    hint: 'BCH price signed by General Protocols',
    icon: ShieldCheck,
  },
  coingecko: {
    tag: 'From CoinGecko',
    line: 'From CoinGecko',
    hint: 'BCH price from CoinGecko',
    icon: Globe,
  },
} as const satisfies Record<string, { tag: string; line: string; hint: string; icon: LucideIcon }>;

const DEFAULT_HINT = 'BCH price';

function PriceValue({ price, isLoading }: { price: number | null; isLoading: boolean }) {
  return <>{formatUsd(price) ?? (isLoading ? LOADING_PRICE : NOT_AVAILABLE)}</>;
}

export function BchPriceTicker({ variant = 'inline', className }: BchPriceTickerProps) {
  const { price, source, isLoading, isStale, error, reading } = useBchPrice();
  const sourceCopy = source ? SOURCE[source] : null;

  if (variant === 'card') {
    const updated = reading ? formatRelative(reading.updatedAt) : null;
    const tag = sourceCopy ? { label: sourceCopy.tag, icon: sourceCopy.icon } : error ? { label: PRICE_UNAVAILABLE, icon: TriangleAlert } : null;
    const detail = reading
      ? [updated ? `Updated ${updated}` : null, sourceCopy?.line, isStale ? MAY_BE_OUT_OF_DATE : null]
          .filter(Boolean)
          .join(' · ')
      : isLoading
        ? LOADING_PRICE
        : PRICE_UNAVAILABLE;

    return (
      <Card className={className}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-label text-ink-secondary">{PAIR}</p>
            <p className="text-amount-lg text-ink">
              <PriceValue price={price} isLoading={isLoading} />
            </p>
          </div>
          {tag ? (
            <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-sunken px-2.5 text-caption text-ink-secondary">
              <Icon icon={tag.icon} size={16} />
              {tag.label}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-small text-ink-muted">{detail}</p>
      </Card>
    );
  }

  const hint = sourceCopy?.hint ?? DEFAULT_HINT;

  return (
    <Tooltip content={hint}>
      <span
        tabIndex={0}
        className={cx(
          'inline-flex h-7 items-center gap-2 rounded-pill border border-line bg-surface px-3 text-caption text-ink-secondary',
          className,
        )}
      >
        <span aria-hidden="true" className={cx('size-1.5 rounded-pill', source === 'oracle' ? 'bg-success-dot' : 'bg-line-strong')} />
        <span>
          {PAIR} <PriceValue price={price} isLoading={isLoading} />
        </span>
        <span className="sr-only">. {hint}</span>
      </span>
    </Tooltip>
  );
}
