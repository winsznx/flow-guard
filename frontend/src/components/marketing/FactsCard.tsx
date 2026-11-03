import React, { useId } from 'react';
import { DetailList } from '../ui/DetailList';
import { Eyebrow } from '../ui/Eyebrow';
import { cx } from '../ui/cx';

export type FactsCardProps = {
  eyebrow: string;
  /** Leave out when every card on the page is on the same network. */
  network?: string;
  rows: { label: string; value: React.ReactNode }[];
  footer?: React.ReactNode;
  className?: string;
  /** Render the eyebrow as a heading so the card shows up when moving by headings. */
  eyebrowAs?: 'p' | 'h2' | 'h3';
  /** `stacked` puts each label above a left-aligned value, for answers written as sentences. */
  layout?: 'split' | 'stacked';
};

export function FactsCard({ eyebrow, network, rows, footer, className, eyebrowAs = 'p', layout = 'split' }: FactsCardProps) {
  const headingId = useId();
  const isHeading = eyebrowAs !== 'p';

  return (
    <section
      aria-label={isHeading ? undefined : eyebrow}
      aria-labelledby={isHeading ? headingId : undefined}
      className={cx('overflow-hidden rounded-panel border border-line bg-surface', className)}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line bg-sunken px-6 py-3">
        <Eyebrow as={eyebrowAs} id={isHeading ? headingId : undefined}>
          {eyebrow}
        </Eyebrow>
        {network ? <span className="shrink-0 whitespace-nowrap text-caption text-ink-muted">{network}</span> : null}
      </div>
      <div className="px-6 py-2">
        <DetailList items={rows} layout={layout} />
      </div>
      {footer ? <div className="border-t border-line px-6 py-4 text-small text-ink-secondary">{footer}</div> : null}
    </section>
  );
}
