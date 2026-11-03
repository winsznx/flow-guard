import { Check, Icon, X } from './Icon';
import { cx } from './cx';
import type { Tone } from './types';
import { STATUS, type StatusKey } from '../../copy/status';

/**
 * `status` reads its word and tone from the status catalog. `label` with `tone` is for words that aren't
 * a record state, such as changelog groups (Added, Fixed) or roadmap stages.
 */
export type StatusPillProps = { since?: string; size?: 'sm' | 'md' } & (
  | { status: StatusKey; label?: never; tone?: never }
  | { label: string; tone: Tone; status?: never }
);

const TONE: Record<Tone, { pill: string; mark: string; icon: string }> = {
  success: { pill: 'bg-success-tint text-success-ink', mark: 'bg-success-dot', icon: 'text-success-dot' },
  warning: { pill: 'bg-warning-tint text-warning-ink', mark: 'bg-warning-dot', icon: 'text-warning-dot' },
  danger: { pill: 'bg-danger-tint text-danger-ink', mark: 'bg-danger-dot', icon: 'text-danger-dot' },
  info: { pill: 'bg-info-tint text-info-ink', mark: 'bg-info-dot', icon: 'text-info-dot' },
  neutral: { pill: 'bg-neutral-tint text-neutral-ink', mark: 'bg-neutral-dot', icon: 'text-neutral-dot' },
};

const SIZE = {
  sm: 'h-5 px-2',
  md: 'h-6 px-2.5',
} as const;

function pillWord(props: StatusPillProps): { word: string; tone: Tone; icon?: 'check' | 'x' } {
  if (props.status !== undefined) return STATUS[props.status];
  return { word: props.label, tone: props.tone };
}

export function StatusPill(props: StatusPillProps) {
  const { since, size = 'md' } = props;
  const { word, tone, icon } = pillWord(props);
  const look = TONE[tone];

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill text-caption',
        SIZE[size],
        look.pill,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className={cx('inline-flex size-3 *:size-3', look.icon)}>
          <Icon icon={icon === 'check' ? Check : X} size={16} />
        </span>
      ) : (
        <span aria-hidden="true" className={cx('size-1.5 rounded-pill', look.mark)} />
      )}
      {since ? `${word} · since ${since}` : word}
    </span>
  );
}
