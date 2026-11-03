import { CircleCheck, CircleX, Icon, LoaderCircle } from './Icon';
import { cx } from './cx';
import { ACTIONS, MOMENTS, REVIEW, stepOf } from '../../copy/common';
import type { FlowError } from '../../copy/errors';

export type TxStepStatus = 'pending' | 'done' | 'failed';

export type TxStep =
  | { step: 'wallet'; index: number; of: number; status: TxStepStatus }
  | { step: 'network' | 'confirmed'; status: TxStepStatus }
  | { error: FlowError };

export type TxProgressProps = { steps: TxStep[] };

type StatusStep = Exclude<TxStep, { error: FlowError }>;

const LABEL = {
  network: REVIEW.sendToNetwork,
  confirmed: REVIEW.confirmed,
} as const;

const STATUS_WORD: Record<TxStepStatus, string> = {
  pending: 'in progress',
  done: 'done',
  failed: 'failed',
};

const WAITING_WORD = 'not started';

function stepLabel(step: StatusStep): string {
  if (step.step === 'wallet') return ACTIONS.approveInWallet;
  return LABEL[step.step];
}

function stepKey(step: StatusStep): string {
  return step.step === 'wallet' ? `wallet-${step.index}` : step.step;
}

function isStatusStep(step: TxStep): step is StatusStep {
  return 'step' in step;
}

export function TxProgress({ steps }: TxProgressProps) {
  const rows = steps.filter(isStatusStep);
  const activeIndex = rows.findIndex((row) => row.status !== 'done');

  return (
    <ol className="flex flex-col gap-3">
      {rows.map((row, position) => {
        const waiting = row.status === 'pending' && position !== activeIndex;
        const status = waiting ? WAITING_WORD : STATUS_WORD[row.status];
        const next = rows[position + 1];
        const showStepOneDone =
          row.step === 'wallet' &&
          row.of === 2 &&
          row.index === 1 &&
          row.status === 'done' &&
          next?.step === 'wallet' &&
          next.status === 'pending';

        return (
          <li key={stepKey(row)} aria-current={position === activeIndex ? 'step' : undefined} className="flex gap-3">
            <span
              aria-hidden="true"
              className={cx(
                'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center',
                row.status === 'done' && 'text-success-dot',
                row.status === 'failed' && 'text-danger-dot',
                row.status === 'pending' && 'text-ink-muted',
              )}
            >
              {row.status === 'done' ? (
                <Icon icon={CircleCheck} size={20} />
              ) : row.status === 'failed' ? (
                <Icon icon={CircleX} size={20} />
              ) : waiting ? (
                <span className="size-2 rounded-pill border border-line-control" />
              ) : (
                <span className="inline-flex animate-spin">
                  <Icon icon={LoaderCircle} size={20} />
                </span>
              )}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className={cx('text-body', waiting ? 'text-ink-muted' : 'text-ink')}>
                {stepLabel(row)}
                <span className="sr-only">, {status}</span>
              </span>
              {row.step === 'wallet' && row.of > 1 ? (
                <span className="text-small text-ink-muted">
                  {stepOf(row.index, row.of)}
                </span>
              ) : null}
              {showStepOneDone ? <span className="text-small text-ink-secondary">{MOMENTS.stepOneDone}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
