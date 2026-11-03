import { cx } from './cx';
import type { Asset } from './types';
import { LABELS } from '../../copy/common';
import { formatAmount } from '../../copy/format';

export type ReleaseBarProps = { asset: Asset; claimed: string; ready: string; later: string };

export const SEGMENT = {
  claimed: 'bg-brand',
  ready: 'bg-success-dot bg-(image:--pattern-ready)',
  later: 'bg-sunken bg-(image:--pattern-hatch) border border-line-control',
} as const;

const WORD = { claimed: 'claimed', ready: 'ready to claim', later: LABELS.stillToCome } as const;

type Part = keyof typeof SEGMENT;

const ORDER: Part[] = ['claimed', 'ready', 'later'];

function weight(value: string): number {
  const n = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function ReleaseBar({ asset, claimed, ready, later }: ReleaseBarProps) {
  const values: Record<Part, string> = { claimed, ready, later };
  const total = ORDER.reduce((acc, part) => acc + weight(values[part]), 0);
  const shown = ORDER.filter((part) => weight(values[part]) > 0);
  const legend = shown.length > 0 ? shown : ORDER;

  return (
    <div className="flex flex-col gap-2">
      <div aria-hidden="true" className="flex h-2 gap-0.5 overflow-hidden rounded-pill bg-sunken">
        {total > 0
          ? shown.map((part) => (
              <span
                key={part}
                className={cx('h-full', SEGMENT[part])}
                style={{ width: `${(weight(values[part]) / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-secondary">
        {legend.map((part) => (
          <li key={part} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block size-2.5 shrink-0 rounded-pill', SEGMENT[part])} />
            <span>
              {formatAmount(values[part], asset) ?? LABELS.notSet} {WORD[part]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
