import React, { useEffect, useRef, useState } from 'react';
import { Address } from './Address';
import { Amount } from './Amount';
import { Button } from './Button';
import { DetailList } from './DetailList';
import { Dialog } from './Dialog';
import { CircleAlert, CircleCheck, Icon } from './Icon';
import { InsetBlock } from './InsetBlock';
import { Notice } from './Notice';
import { TxLink } from './TxLink';
import { TxProgress, type TxStep } from './TxProgress';
import { cx } from './cx';
import type { Asset } from './types';
import { ACTIONS, BUSY, LABELS, MOMENTS, REVIEW } from '../../copy/common';
import { ERROR_CATALOG, asFlowError, type ErrorCode, type FlowError } from '../../copy/errors';
import { NETWORK_LABEL } from '../../copy/network';
import { holdTransactionNotices } from '../../utils/txNotice';

export type { TxStep } from './TxProgress';

type Money = { amount: string; asset: Asset };

type Party = { address: string; name?: string };

/** Where money goes when there's no single address yet, such as one new contract per person. */
type Destination = { label: string };

export type ReviewSummary = (
  | {
      direction: 'out';
      leavesWallet: Money;
      goesTo: Party | Destination;
      /**
       * `contract` is money paid out of a contract (a milestone release, a bounty payout), not out of
       * the viewer's wallet. `leavesLabel` names the contract when that reads better ("Leaves this bounty").
       */
      source?: 'wallet' | 'contract';
      leavesLabel?: string;
    }
  | { direction: 'in'; youReceive: Money; from?: Party }
  | { direction: 'returns'; comesBack: Money | Destination; recipientKeeps?: Money }
  | { direction: 'fee-only' }
) & { feeEstimate?: string | null; whoCanStop?: string; network: 'mainnet' | 'chipnet' };

const DECLINED_CODES: ReadonlySet<ErrorCode> = new Set(['WALLET_REJECTED', 'SIGN_IN_REJECTED', 'PAIRING_CANCELLED']);

function isDestination(value: Party | Destination | Money): value is Destination {
  return 'label' in value;
}

export type TransactionReviewProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  plan?: React.ReactNode;
  consequence?: { tone: 'danger' | 'warning' | 'info'; body: React.ReactNode };
  confirmLabel?: string;
  keepLabel?: string;
  summary: ReviewSummary;
  checks?: { label: string; ok: boolean; fix?: string }[];
  steps?: number;
  run: (report: (s: TxStep) => void) => Promise<{ txid?: string }>;
  next?: React.ReactNode;
};

type Phase =
  | { kind: 'review' }
  | { kind: 'running' }
  | { kind: 'finished'; txid?: string; confirmed: boolean }
  | { kind: 'failed'; error: FlowError };

function initialSteps(walletSteps: number): TxStep[] {
  const of = Math.max(1, Math.trunc(walletSteps));
  const wallet: TxStep[] = Array.from({ length: of }, (_, i) => ({
    step: 'wallet',
    index: i + 1,
    of,
    status: 'pending',
  }));
  return [...wallet, { step: 'network', status: 'pending' }, { step: 'confirmed', status: 'pending' }];
}

function sameStep(a: TxStep, b: TxStep): boolean {
  if (!('step' in a) || !('step' in b) || a.step !== b.step) return false;
  if (a.step === 'wallet' && b.step === 'wallet') return a.index === b.index;
  return true;
}

function applyReport(current: TxStep[], report: TxStep): TxStep[] {
  if ('error' in report) {
    let marked = false;
    return current.map((step) => {
      if (!marked && 'step' in step && step.status === 'pending') {
        marked = true;
        return { ...step, status: 'failed' };
      }
      return step;
    });
  }
  const known = current.some((step) => sameStep(step, report));
  if (!known) return [...current, report];
  return current.map((step) => (sameStep(step, report) ? report : step));
}

function settleSteps(current: TxStep[]): TxStep[] {
  return current.map((step) =>
    'step' in step && step.step !== 'confirmed' && step.status === 'pending' ? { ...step, status: 'done' } : step,
  );
}

function isConfirmed(steps: TxStep[]): boolean {
  return steps.some((step) => 'step' in step && step.step === 'confirmed' && step.status === 'done');
}

type LeadRow = { label: string; money: Money | null; text?: string };

function leavesLabel(summary: Extract<ReviewSummary, { direction: 'out' }>): string {
  if (summary.leavesLabel) return summary.leavesLabel;
  return summary.source === 'contract' ? REVIEW.leavesContract : REVIEW.leavesWallet;
}

function firstRow(summary: ReviewSummary): LeadRow {
  switch (summary.direction) {
    case 'out':
      return { label: leavesLabel(summary), money: summary.leavesWallet };
    case 'in':
      return { label: REVIEW.youReceive, money: summary.youReceive };
    case 'returns':
      return isDestination(summary.comesBack)
        ? { label: REVIEW.comesBack, money: null, text: summary.comesBack.label }
        : { label: REVIEW.comesBack, money: summary.comesBack };
    case 'fee-only':
      return { label: REVIEW.feeOnly, money: null };
  }
}

function failedTitle(code: ErrorCode): string {
  if (DECLINED_CODES.has(code)) return REVIEW.declined;
  if (code === 'SENT_NOT_SYNCED') return REVIEW.sent;
  if (code === 'SEND_UNCONFIRMED') return REVIEW.checkWallet;
  if (code === 'STEP_PENDING') return REVIEW.firstStepDone;
  return ERROR_CATALOG[code].tone === 'danger' ? REVIEW.didNotGoThrough : REVIEW.notSent;
}

function summaryItems(summary: ReviewSummary): { label: string; value: React.ReactNode }[] {
  const lead = firstRow(summary);
  const hasEstimate = Boolean(summary.feeEstimate);
  const items: { label: string; value: React.ReactNode }[] = [];

  if (lead.text) {
    items.push({ label: lead.label, value: lead.text });
    items.push({ label: LABELS.networkFee, value: summary.feeEstimate || REVIEW.smallFee });
  } else if (lead.money) {
    items.push({
      label: lead.label,
      value: (
        <span className="inline-flex flex-col items-start sm:items-end">
          <Amount value={lead.money.amount} asset={lead.money.asset} />
          {hasEstimate ? null : <span className="text-small text-ink-muted">{REVIEW.plusNetworkFee}</span>}
        </span>
      ),
    });
    if (hasEstimate) items.push({ label: LABELS.networkFee, value: summary.feeEstimate });
  } else {
    items.push({ label: lead.label, value: summary.feeEstimate || REVIEW.smallFee });
  }

  if (summary.direction === 'out') {
    const { goesTo } = summary;
    items.push({
      label: REVIEW.goesTo,
      value: isDestination(goesTo) ? goesTo.label : <Address value={goesTo.address} name={goesTo.name} variant="full" />,
    });
  }
  if (summary.direction === 'in' && summary.from) {
    items.push({ label: REVIEW.from, value: <Address value={summary.from.address} name={summary.from.name} variant="full" /> });
  }
  if (summary.direction === 'returns' && summary.recipientKeeps) {
    items.push({
      label: REVIEW.recipientKeeps,
      value: <Amount value={summary.recipientKeeps.amount} asset={summary.recipientKeeps.asset} />,
    });
  }
  if (summary.whoCanStop) items.push({ label: REVIEW.whoCanStop, value: summary.whoCanStop });
  items.push({ label: LABELS.network, value: NETWORK_LABEL[summary.network] });
  return items;
}

function Checklist({ checks }: { checks: NonNullable<TransactionReviewProps['checks']> }) {
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((check) => (
        <li
          key={check.label}
          className={cx('flex gap-2 rounded-control px-3 py-2 text-small', check.ok ? 'text-ink' : 'bg-danger-tint text-ink')}
        >
          <span className={cx('inline-flex shrink-0', check.ok ? 'text-success-dot' : 'text-danger-dot')}>
            <Icon icon={check.ok ? CircleCheck : CircleAlert} size={16} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span>{check.label}</span>
            {!check.ok && check.fix ? <span className="text-danger-ink">{check.fix}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Outcome({ phase, network, next }: { phase: Phase; network: ReviewSummary['network']; next?: React.ReactNode }) {
  if (phase.kind === 'finished') {
    const link = phase.txid ? <TxLink txid={phase.txid} network={network} /> : null;
    if (phase.confirmed) {
      return (
        <Notice tone="success" title={REVIEW.done} action={link}>
          {next}
        </Notice>
      );
    }
    return (
      <Notice tone="info" title={REVIEW.sent} action={link}>
        <p>{MOMENTS.sentPending}</p>
        {next ? <div className="mt-2">{next}</div> : null}
      </Notice>
    );
  }

  if (phase.kind === 'failed') {
    const { error } = phase;
    const tone = ERROR_CATALOG[error.code].tone ?? 'neutral';
    const link = error.txid ? <TxLink txid={error.txid} network={network} /> : null;
    const title = failedTitle(error.code);
    return (
      <Notice tone={tone} title={title} action={link}>
        <p>{error.message}</p>
        {error.details ? (
          <details className="mt-2">
            <summary className="cursor-pointer text-ink-secondary">{ACTIONS.details}</summary>
            <p className="mt-1 break-words text-ink-muted">{error.details}</p>
          </details>
        ) : null}
      </Notice>
    );
  }

  return null;
}

/** The outcome line read out by the dialog's live regions, which stay mounted so the change is announced. */
function outcomeAnnouncement(phase: Phase): { polite: string; assertive: string } {
  if (phase.kind === 'finished') return { polite: phase.confirmed ? REVIEW.done : REVIEW.sent, assertive: '' };
  if (phase.kind === 'failed') {
    const tone = ERROR_CATALOG[phase.error.code].tone ?? 'neutral';
    const line = `${failedTitle(phase.error.code)}. ${phase.error.message}`;
    return tone === 'danger' ? { polite: '', assertive: line } : { polite: line, assertive: '' };
  }
  return { polite: '', assertive: '' };
}

export function TransactionReview({
  open,
  onClose,
  title = REVIEW.title,
  plan,
  consequence,
  confirmLabel = ACTIONS.approveInWallet,
  keepLabel = ACTIONS.back,
  summary,
  checks = [],
  steps = 1,
  run,
  next,
}: TransactionReviewProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [progress, setProgress] = useState<TxStep[]>(() => initialSteps(steps));
  const mounted = useRef(true);
  const outcomeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const settled = phase.kind === 'finished' || phase.kind === 'failed';
  useEffect(() => {
    if (settled) outcomeRef.current?.focus();
  }, [settled]);

  const failing = checks.find((check) => !check.ok);
  const running = phase.kind === 'running';
  const tone = consequence?.tone === 'danger' ? 'danger' : 'primary';

  const reset = () => {
    setPhase({ kind: 'review' });
    setProgress(initialSteps(steps));
  };

  const close = () => {
    if (running) return;
    onClose();
    reset();
  };

  const approve = async () => {
    setProgress(initialSteps(steps));
    setPhase({ kind: 'running' });
    const reported: { error: FlowError | null } = { error: null };
    let latest = initialSteps(steps);

    const report = (step: TxStep) => {
      if (!mounted.current) return;
      if ('error' in step) reported.error = step.error;
      latest = applyReport(latest, step);
      setProgress(latest);
    };

    const releaseNotices = holdTransactionNotices();
    try {
      const result = await run(report);
      if (!mounted.current) return;
      if (reported.error) {
        setPhase({ kind: 'failed', error: reported.error });
        return;
      }
      latest = settleSteps(latest);
      setProgress(latest);
      setPhase({ kind: 'finished', txid: result.txid, confirmed: isConfirmed(latest) });
    } catch (caught) {
      if (!mounted.current) return;
      const error = asFlowError(caught);
      latest = applyReport(latest, { error });
      setProgress(latest);
      setPhase({ kind: 'failed', error });
    } finally {
      releaseNotices();
    }
  };

  const announcement = outcomeAnnouncement(phase);
  const retryable = phase.kind === 'failed' && ERROR_CATALOG[phase.error.code].action === ACTIONS.tryAgain;

  const footer =
    phase.kind === 'review' ? (
      <>
        <Button key="keep" variant="secondary" onClick={close}>
          {keepLabel}
        </Button>
        {failing ? (
          <Button key="confirm" variant={tone} disabled disabledReason={failing.fix ?? failing.label}>
            {confirmLabel}
          </Button>
        ) : (
          <Button key="confirm" variant={tone} onClick={() => void approve()}>
            {confirmLabel}
          </Button>
        )}
      </>
    ) : running ? (
      <>
        <Button key="confirm" variant={tone} busy busyLabel={BUSY.waitingForWallet}>
          {confirmLabel}
        </Button>
      </>
    ) : retryable ? (
      <>
        <Button variant="secondary" onClick={close}>
          {ACTIONS.close}
        </Button>
        <Button variant="primary" onClick={reset}>
          {ACTIONS.tryAgain}
        </Button>
      </>
    ) : (
      <Button variant="primary" onClick={close}>
        {ACTIONS.close}
      </Button>
    );

  return (
    <Dialog open={open} onClose={close} title={title} size="lg" dismissible={!running} footer={footer}>
      <p aria-live="polite" className="sr-only">
        {announcement.polite}
      </p>
      <p role="alert" className="sr-only">
        {announcement.assertive}
      </p>
      {phase.kind === 'review' ? (
        <div className="flex flex-col gap-4">
          {plan}
          {consequence ? (
            <Notice tone={consequence.tone} title={REVIEW.beforeYouApprove}>
              {consequence.body}
            </Notice>
          ) : null}
          <InsetBlock>
            <DetailList items={summaryItems(summary)} />
          </InsetBlock>
          {checks.length > 0 ? <Checklist checks={checks} /> : null}
          <p className="text-small text-ink-secondary">{MOMENTS.walletWillOpen}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <TxProgress steps={progress} />
          <div ref={outcomeRef} tabIndex={-1} className="focus:outline-none">
            <Outcome phase={phase} network={summary.network} next={next} />
          </div>
        </div>
      )}
    </Dialog>
  );
}
