import { DashedCard } from './DashedCard';
import { cx } from './cx';
import { STATUS } from '../../copy/status';
import { formatDate } from '../../copy/format';
import { MOMENTS } from '../../copy/common';

export type UptimeStripProps = { days: { date: string; state: 'good' | 'slow' | 'down' | 'none'; note?: string }[] };

type DayState = UptimeStripProps['days'][number]['state'];

const BLOCK: Record<DayState, string> = {
  good: 'h-full bg-success-dot',
  slow: 'h-2/3 bg-warning-dot',
  down: 'h-1/3 bg-danger-dot',
  none: 'h-full border border-dashed border-line-control',
};

const WORD: Record<DayState, string> = {
  good: STATUS.running.word,
  slow: STATUS.slow.word,
  down: STATUS.down.word,
  none: STATUS.notChecked.word,
};

const LEGEND_SWATCH: Record<DayState, string> = {
  good: 'bg-success-dot',
  slow: 'bg-warning-dot',
  down: 'bg-danger-dot',
  none: 'border border-dashed border-line-control',
};

const STATES: DayState[] = ['good', 'slow', 'down', 'none'];
const STRIP_LABEL = 'Daily uptime';

export function UptimeStrip({ days }: UptimeStripProps) {
  const measured = days.some((day) => day.state !== 'none');
  if (!measured) {
    return (
      <DashedCard>
        <p className="text-small text-ink-secondary">{MOMENTS.uptimeNotRecorded}</p>
      </DashedCard>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={STRIP_LABEL} className="flex h-8 items-end gap-0.5">
        {days.map((day) => {
          const when = formatDate(day.date) ?? day.date;
          return (
            <li key={day.date} className="flex h-full min-w-0 flex-1 items-end">
              <span aria-hidden="true" className={cx('block w-full rounded-inline', BLOCK[day.state])} />
              <span className="sr-only">
                {when}: {day.note ?? WORD[day.state]}
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-secondary">
        {STATES.map((state) => (
          <li key={state} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block size-2.5 shrink-0 rounded-inline', LEGEND_SWATCH[state])} />
            {WORD[state]}
          </li>
        ))}
      </ul>
    </div>
  );
}
