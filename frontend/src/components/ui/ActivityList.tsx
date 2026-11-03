import type { LucideIcon } from 'lucide-react';
import { ButtonLink } from './ButtonLink';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Award,
  CircleCheck,
  CircleX,
  Icon,
  Milestone,
  Pause,
  Pencil,
  Play,
  Plus,
} from './Icon';
import type { ListState } from './List';
import { Skeleton } from './Skeleton';
import { TxLink } from './TxLink';
import type { ActivityEvent, ActivityEventKind } from '../../copy/events';
import { describeEvent } from '../../copy/events';
import { formatDateTime, formatRelative, toDate } from '../../copy/format';
import { ACTIONS, MOMENTS } from '../../copy/common';

export type ActivityListProps = {
  events: ActivityEvent[];
  state: ListState;
  network: 'mainnet' | 'chipnet';
  seeAllHref?: string;
};

const EVENT_ICON: Record<ActivityEventKind, LucideIcon> = {
  created: Plus,
  funded: ArrowUpFromLine,
  claimed: ArrowDownToLine,
  paused: Pause,
  resumed: Play,
  cancelled: CircleX,
  fundsAdded: ArrowUpFromLine,
  recipientChanged: ArrowLeftRight,
  milestoneReleased: Milestone,
  rewardSent: Award,
  winnerPaid: Award,
  finished: CircleCheck,
  updated: Pencil,
};

const COPY = {
  label: 'Activity',
  empty: MOMENTS.noActivity,
  failed: MOMENTS.activityFailed,
  seeAll: ACTIONS.seeAllActivity,
} as const;

const LOADING_ROWS = 3;

function Message({ children }: { children: string }) {
  return <p className="py-6 text-center text-small text-ink-secondary">{children}</p>;
}

export function ActivityList({ events, state, network, seeAllHref }: ActivityListProps) {
  if (state === 'loading') return <Skeleton kind="row" lines={LOADING_ROWS} />;
  if (state === 'error') return <Message>{COPY.failed}</Message>;
  if (state !== 'ready' || events.length === 0) return <Message>{COPY.empty}</Message>;

  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={COPY.label} className="flex flex-col">
        {events.map((event) => {
          const date = toDate(event.at);
          return (
            <li key={event.id} className="flex items-start gap-3 border-t border-line py-3 first:border-t-0">
              <span
                aria-hidden="true"
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill bg-sunken text-ink-secondary"
              >
                <Icon icon={EVENT_ICON[event.kind]} size={16} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-body text-ink">{describeEvent(event)}</p>
                  {event.txid ? <TxLink txid={event.txid} network={network} context={describeEvent(event)} /> : null}
                </div>
                {date ? (
                  <time
                    dateTime={date.toISOString()}
                    title={formatDateTime(date) ?? undefined}
                    className="shrink-0 text-small text-ink-muted"
                  >
                    {formatRelative(date)}
                  </time>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {seeAllHref ? (
        <div>
          <ButtonLink variant="link" standalone to={seeAllHref}>
            {COPY.seeAll}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
