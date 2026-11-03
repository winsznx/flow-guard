import { SEGMENT } from './ReleaseBar';
import { cx } from './cx';
import type { Asset } from './types';
import { LABELS } from '../../copy/common';
import { formatAmount, formatDate, formatDuration, plural, sumAmounts, toDate } from '../../copy/format';

type BlockState = 'claimed' | 'ready' | 'later' | 'waiting';

/**
 * `record` is a schedule that exists: claimed counts, the next release and a Today marker.
 * `preview` is a plan that doesn't exist yet (create flows, examples): no claimed count and no
 * Today marker.
 */
export type ScheduleTimelineVariant = 'record' | 'preview';

export type ScheduleTimelineProps = {
  asset: Asset;
  blocks: { at: number; amount: string; state: BlockState }[];
  /** Defaults to the current time. Ignored by `preview`. */
  now?: number;
  variant?: ScheduleTimelineVariant;
  /**
   * Released every second and drawn as approximate blocks, so the summary gives amounts and the
   * block length instead of release events that don't exist.
   */
  continuous?: boolean;
  /** The schedule is on hold, so the dates still to come move later and no next date is promised. */
  paused?: boolean;
};

const PAUSED_LINE = 'Paused. The dates still to come move later by the time it stays paused.';
const CURRENT_LABEL_EDGE = 0.15;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const BLOCK: Record<BlockState, string> = {
  claimed: SEGMENT.claimed,
  ready: SEGMENT.ready,
  later: SEGMENT.later,
  waiting: 'bg-surface bg-(image:--pattern-hatch) border border-line-control',
};

const WORD: Record<BlockState, string> = {
  claimed: 'claimed',
  ready: 'ready to claim',
  later: LABELS.stillToCome,
  waiting: 'waiting period',
};

const LEGEND: { state: BlockState; label: string }[] = [
  { state: 'claimed', label: 'Claimed' },
  { state: 'ready', label: 'Ready to claim' },
  { state: 'later', label: `${LABELS.stillToCome.charAt(0).toUpperCase()}${LABELS.stillToCome.slice(1)}` },
  { state: 'waiting', label: LABELS.waitingPeriod },
];

function ms(value: number): number {
  return toDate(value)?.getTime() ?? 0;
}

type Blocks = ScheduleTimelineProps['blocks'];

/** "1 week" reads "a week", so the block length sounds like speech. */
function aboutDuration(gapMs: number): string | null {
  const step = gapMs >= DAY_MS ? DAY_MS : gapMs >= HOUR_MS ? HOUR_MS : MINUTE_MS;
  const rounded = Math.max(step, Math.round(gapMs / step) * step);
  const duration = formatDuration(rounded / 1000);
  if (!duration) return null;
  const single = /^1 (\w+)$/.exec(duration);
  if (!single) return duration;
  return single[1] === 'hour' ? 'an hour' : `a ${single[1]}`;
}

function previewSummary(blocks: Blocks, asset: Asset): string {
  const releases = blocks.filter((block) => block.state !== 'waiting');
  const counted = `${releases.length} ${plural(releases.length, 'release', 'releases')}`;
  const first = releases[0];
  const firstAmount = first ? formatAmount(first.amount, asset) : null;
  const firstDate = first ? formatDate(first.at) : null;
  if (!firstAmount || !firstDate) return counted;
  return releases.length === 1 ? `${counted} · ${firstAmount} on ${firstDate}` : `${counted} · first ${firstAmount} on ${firstDate}`;
}

function continuousSummary(blocks: Blocks, asset: Asset, isPreview: boolean): string {
  const releases = blocks.filter((block) => block.state !== 'waiting');
  const span = releases.length > 1 ? ms(releases[releases.length - 1].at) - ms(releases[0].at) : 0;
  const blockLength = span > 0 ? aboutDuration(span / (releases.length - 1)) : null;
  const lengthLine = blockLength ? `Each block is about ${blockLength}` : null;
  if (isPreview) return lengthLine ?? '';
  const total = formatAmount(sumAmounts(releases.map((block) => block.amount), asset), asset);
  const claimed = formatAmount(
    sumAmounts(releases.filter((block) => block.state === 'claimed').map((block) => block.amount), asset),
    asset,
  );
  return [lengthLine, claimed && total ? `${claimed} claimed of ${total}` : null].filter(Boolean).join(' · ');
}

function recordSummary(blocks: Blocks, asset: Asset, paused: boolean): string {
  const releases = blocks.filter((block) => block.state !== 'waiting');
  const claimed = releases.filter((block) => block.state === 'claimed').length;
  const ready = releases.filter((block) => block.state === 'ready').length;
  const claimedLine = `${claimed} of ${releases.length} ${plural(releases.length, 'release', 'releases')} claimed`;
  const counted = ready > 0 ? `${claimedLine} · ${ready} ${WORD.ready}` : claimedLine;
  if (paused) return counted;
  const next = releases.find((block) => block.state === 'later');
  const nextAmount = next ? formatAmount(next.amount, asset) : null;
  const nextDate = next ? formatDate(next.at) : null;
  return nextAmount && nextDate ? `${counted} · next ${nextAmount} on ${nextDate}` : counted;
}

function summary(blocks: Blocks, asset: Asset, isPreview: boolean, continuous: boolean, paused: boolean): string {
  if (continuous) return continuousSummary(blocks, asset, isPreview);
  if (isPreview) return previewSummary(blocks, asset);
  return recordSummary(blocks, asset, paused);
}

/** A plan that doesn't exist yet has nothing claimed or ready, whatever the sample data says. */
function asPlanned(block: Blocks[number]): Blocks[number] {
  return block.state === 'waiting' ? block : { ...block, state: 'later' };
}

export function ScheduleTimeline({
  asset,
  blocks,
  now,
  variant = 'record',
  continuous = false,
  paused = false,
}: ScheduleTimelineProps) {
  const isPreview = variant === 'preview';
  const ordered = [...blocks].sort((a, b) => ms(a.at) - ms(b.at)).map((block) => (isPreview ? asPlanned(block) : block));
  const count = ordered.length;
  if (count === 0) return null;

  const nowMs = now === undefined ? Date.now() : ms(now);
  const upcoming = ordered.findIndex((block) => ms(block.at) > nowMs);
  const todayIndex = upcoming === -1 ? count : upcoming;
  const todayPercent = (todayIndex / count) * 100;
  const currentIndex = Math.min(Math.max(todayIndex, 0), count - 1);
  const currentPosition = (currentIndex + 0.5) / count;
  const showCurrent =
    !isPreview &&
    currentIndex > 0 &&
    currentIndex < count - 1 &&
    currentPosition > CURRENT_LABEL_EDGE &&
    currentPosition < 1 - CURRENT_LABEL_EDGE;
  const used = LEGEND.filter((entry) => ordered.some((block) => block.state === entry.state));
  const summaryLine = summary(ordered, asset, isPreview, continuous, paused);

  return (
    <div className="@container flex flex-col gap-3">
      {summaryLine ? <p className="text-small text-ink-secondary">{summaryLine}</p> : null}
      {paused ? <p className="text-small text-ink-secondary">{PAUSED_LINE}</p> : null}
      <div className={cx('relative', !isPreview && 'pt-5')}>
        {isPreview ? null : (
          <>
            <span
              aria-hidden="true"
              className="absolute top-0 -translate-x-1/2 text-caption text-ink-muted"
              style={{ left: `${Math.min(Math.max(todayPercent, 4), 96)}%` }}
            >
              {LABELS.today}
            </span>
            <span
              aria-hidden="true"
              className="absolute bottom-0 top-4 border-l border-dashed border-line-control"
              style={{ left: `${todayPercent}%` }}
            />
          </>
        )}
        <div aria-hidden="true" className="flex h-8 gap-0.5">
          {ordered.map((block, index) => (
            <span key={`${block.at}-${index}`} className={cx('h-full min-w-0 flex-1 rounded-inline', BLOCK[block.state])} />
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="relative flex justify-between text-caption text-ink-muted">
        <span>{formatDate(ordered[0].at)}</span>
        {showCurrent ? (
          <span
            className="absolute top-0 hidden -translate-x-1/2 @narrow:block"
            style={{ left: `${currentPosition * 100}%` }}
          >
            {formatDate(ordered[currentIndex].at)}
          </span>
        ) : null}
        {count > 1 ? <span>{formatDate(ordered[count - 1].at)}</span> : null}
      </div>
      <ul className="sr-only">
        {ordered.map((block, index) => (
          <li key={`${block.at}-${index}`}>
            {formatDate(block.at)}: {formatAmount(block.amount, asset) ?? LABELS.notSet}, {WORD[block.state]}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-ink-secondary">
        {used.map((entry) => (
          <li key={entry.state} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx('inline-block size-2.5 shrink-0 rounded-inline', BLOCK[entry.state])} />
            {entry.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
