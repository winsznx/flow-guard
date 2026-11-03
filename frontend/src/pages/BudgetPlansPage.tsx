import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ListToolbar } from '../components/layout/ListToolbar';
import { Stack } from '../components/layout/Stack';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { DetailList } from '../components/ui/DetailList';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { CalendarClock, Plus } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Notice } from '../components/ui/Notice';
import { PlanSentence } from '../components/ui/PlanSentence';
import { ReleaseBar } from '../components/ui/ReleaseBar';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { TransactionReview, type ReviewSummary } from '../components/ui/TransactionReview';
import type { Asset } from '../components/ui/types';
import { BUDGET_CREATE, BUDGETS_TAB, PLAN_DIALOG, PLAN_REVIEWS } from '../copy/budgets';
import { ACTIONS } from '../copy/common';
import { asFlowError, errorMessage } from '../copy/errors';
import { formatAddress, formatAmount, formatDate } from '../copy/format';
import { glossaryHelp } from '../copy/glossary';
import { STATUS, lifecycleStatus, type StatusKey } from '../copy/status';
import { everyDays, reachedNetwork, sameAddress } from '../copy/vaults';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { fetchBudgetPlans, fetchVaults } from '../utils/api';
import {
  cancelBudgetPlanOnChain,
  fundBudgetPlan,
  setPausedOnChain,
  releaseMilestone,
} from '../utils/blockchain';

type Segment = 'yours' | 'public';
type StatusFilter = 'ACTIVE' | 'PENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
type Action = 'fund' | 'claim' | 'pause' | 'resume' | 'cancel';

type BudgetPlan = {
  id: string;
  creator: string;
  controller: string;
  vaultId: string;
  vaultName: string | null;
  recipient: string;
  recipientName: string | null;
  contractAddress: string | null;
  perPayment: number;
  intervalSeconds: number;
  totalAmount: number;
  totalReleased: number;
  status: string;
  isBch: boolean;
  asset: Asset;
  startsAt: number | null;
};

const BCH: Asset = { kind: 'bch' };

const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'yours', label: BUDGETS_TAB.segments.yours },
  { value: 'public', label: BUDGETS_TAB.segments.public },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'ACTIVE', label: STATUS.active.word },
  { value: 'PENDING', label: STATUS.notFunded.word },
  { value: 'PAUSED', label: STATUS.paused.word },
  { value: 'COMPLETED', label: STATUS.finished.word },
  { value: 'CANCELLED', label: STATUS.cancelled.word },
];

function readStartTime(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  try {
    const params: unknown = JSON.parse(raw);
    if (!Array.isArray(params)) return null;
    const entry: unknown = params[4];
    const value =
      entry && typeof entry === 'object' && 'value' in entry ? Number(entry.value) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function toPlan(raw: Record<string, unknown>): BudgetPlan {
  const tokenType = typeof raw.token_type === 'string' ? raw.token_type : 'BCH';
  const tokenId = typeof raw.token_category === 'string' ? raw.token_category : '';
  const isBch = tokenType === 'BCH' || !tokenId;
  const creator = String(raw.creator ?? '');
  return {
    id: String(raw.id ?? ''),
    creator,
    controller:
      typeof raw.controllerAddress === 'string' && raw.controllerAddress
        ? raw.controllerAddress
        : creator,
    vaultId: String(raw.vaultId ?? raw.vault_id ?? ''),
    vaultName: typeof raw.vaultName === 'string' ? raw.vaultName : null,
    recipient: String(raw.recipient ?? ''),
    recipientName:
      typeof raw.recipientLabel === 'string' && raw.recipientLabel.trim()
        ? raw.recipientLabel
        : null,
    contractAddress: typeof raw.contract_address === 'string' ? raw.contract_address : null,
    perPayment: Number(raw.amountPerInterval) || 0,
    intervalSeconds: Number(raw.intervalSeconds) || 0,
    totalAmount: Number(raw.totalAmount) || 0,
    totalReleased: Number(raw.totalReleased) || 0,
    status: String(raw.status ?? ''),
    isBch,
    asset: isBch ? BCH : { kind: 'token', tokenId, decimals: 0 },
    startsAt: readStartTime(raw.constructor_params),
  };
}

function money(value: number, plan: BudgetPlan): string {
  return formatAmount(value, plan.asset) ?? String(value);
}

/** Released payments not yet paid out, and when the next one comes, from the plan's own schedule. */
function schedule(plan: BudgetPlan, now: number): { ready: number; nextAt: number | null } {
  if (!plan.startsAt || plan.intervalSeconds <= 0 || plan.perPayment <= 0)
    return { ready: 0, nextAt: null };
  const totalSteps = Math.ceil(plan.totalAmount / plan.perPayment);
  const paidSteps = Math.round(plan.totalReleased / plan.perPayment);
  const dueSteps = Math.min(
    totalSteps,
    Math.max(0, Math.floor((now / 1000 - plan.startsAt) / plan.intervalSeconds))
  );
  const ready = Math.min(
    plan.totalAmount - plan.totalReleased,
    Math.max(0, dueSteps - paidSteps) * plan.perPayment
  );
  const nextAt =
    dueSteps < totalSteps ? (plan.startsAt + (dueSteps + 1) * plan.intervalSeconds) * 1000 : null;
  return { ready: Math.max(0, ready), nextAt };
}

function statusOf(plan: BudgetPlan): StatusKey | null {
  return lifecycleStatus(plan.status);
}

function recipientLabel(plan: BudgetPlan): string {
  return plan.recipientName ?? formatAddress(plan.recipient);
}

export default function BudgetPlansTab() {
  const wallet = useWallet();
  const network = useNetwork();
  const [segment, setSegment] = useState<Segment>('yours');
  const [filter, setFilter] = useState<StatusFilter[]>([]);
  const [plans, setPlans] = useState<BudgetPlan[] | null>(null);
  const [vaultNames, setVaultNames] = useState<Map<string, string>>(new Map());
  const [visibleVaults, setVisibleVaults] = useState<Set<string>>(new Set());
  const [failure, setFailure] = useState<string | null>(null);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [review, setReview] = useState<{ action: Action; planId: string } | null>(null);
  const now = Date.now();

  const load = useCallback(async () => {
    setFailure(null);
    try {
      const rows = await fetchBudgetPlans();
      setPlans(rows.map(toPlan));
    } catch (error) {
      setPlans(null);
      setFailure(asFlowError(error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetchVaults(wallet.address || undefined)
      .then((response) => {
        if (cancelled) return;
        const names = new Map<string, string>();
        const visible = new Set<string>();
        for (const vault of response.all) {
          const keys = [vault.vaultId, vault.id].filter(Boolean).map(String);
          for (const key of keys) {
            visible.add(key);
            if (typeof vault.name === 'string' && vault.name.trim()) names.set(key, vault.name);
          }
        }
        setVaultNames(names);
        setVisibleVaults(visible);
      })
      .catch((error: unknown) => {
        console.warn('Vault names for budget plans did not load', error);
      });
    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  const isMine = useCallback(
    (plan: BudgetPlan) =>
      sameAddress(plan.creator, wallet.address) || sameAddress(plan.recipient, wallet.address),
    [wallet.address]
  );

  const segmentRows = useMemo(
    () =>
      (plans ?? []).filter(
        (plan) => isMine(plan) || (segment === 'public' && visibleVaults.has(plan.vaultId))
      ),
    [plans, segment, isMine, visibleVaults]
  );
  const rows = segmentRows.filter(
    (plan) => filter.length === 0 || filter.includes(plan.status as StatusFilter)
  );
  const state: ListState = failure
    ? 'error'
    : !plans
      ? 'loading'
      : segmentRows.length === 0
        ? 'empty'
        : rows.length === 0
          ? 'no-results'
          : 'ready';

  const bchRows = segmentRows.filter((plan) => plan.isBch);
  const released = bchRows.reduce((sum, plan) => sum + plan.totalReleased, 0);
  const toCome = bchRows
    .filter((plan) => plan.status === 'ACTIVE' || plan.status === 'PAUSED')
    .reduce((sum, plan) => sum + Math.max(0, plan.totalAmount - plan.totalReleased), 0);
  const notFunded = bchRows
    .filter((plan) => plan.status === 'PENDING')
    .reduce((sum, plan) => sum + plan.totalAmount, 0);
  const active = segmentRows.filter((plan) => plan.status === 'ACTIVE').length;
  const hasTokens = bchRows.length < segmentRows.length;

  const vaultNameOf = (plan: BudgetPlan) => plan.vaultName ?? vaultNames.get(plan.vaultId) ?? null;
  const openPlan = plans?.find((plan) => plan.id === openPlanId) ?? null;
  const reviewPlan = plans?.find((plan) => plan.id === review?.planId) ?? null;

  const columns: Column<BudgetPlan>[] = [
    {
      key: 'recipient',
      header: BUDGETS_TAB.columns.recipient,
      primary: true,
      cell: (plan) =>
        plan.recipientName ? plan.recipientName : <Address value={plan.recipient} copy={false} />,
    },
    {
      key: 'vault',
      header: BUDGETS_TAB.columns.vault,
      mobile: 'hidden',
      cell: (plan) =>
        vaultNameOf(plan) ?? <span className="text-ink-muted">{BUDGETS_TAB.noVault}</span>,
    },
    {
      key: 'schedule',
      header: BUDGETS_TAB.columns.schedule,
      mobile: 'bottom-start',
      cell: (plan) =>
        BUDGETS_TAB.scheduleValue(
          money(plan.perPayment, plan),
          everyDays(plan.intervalSeconds) ?? ''
        ),
    },
    {
      key: 'released',
      header: BUDGETS_TAB.columns.released,
      align: 'end',
      mobile: 'bottom-end',
      cell: (plan) => (
        <span className="flex flex-col items-end gap-0.5">
          <Amount value={plan.totalReleased} asset={plan.asset} precision="list" />
          <span className="text-small text-ink-muted">
            {BUDGETS_TAB.ofTotal(money(plan.totalAmount, plan))}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: BUDGETS_TAB.columns.status,
      mobile: 'top',
      cell: (plan) => {
        const status = statusOf(plan);
        return status ? <StatusPill status={status} size="sm" /> : null;
      },
    },
  ];

  const help = glossaryHelp('budgetPlan');
  const empty =
    segment === 'yours' ? (
      <EmptyState
        icon={CalendarClock}
        title={BUDGETS_TAB.empty.yoursTitle}
        description={BUDGETS_TAB.empty.yoursLine}
        example={BUDGETS_TAB.empty.yoursExample}
        action={
          <ButtonLink to="/budgets/create" variant="primary" leadingIcon={Plus}>
            {BUDGETS_TAB.create}
          </ButtonLink>
        }
        learnMore={help ? { label: help.label, to: help.path } : undefined}
      />
    ) : (
      <EmptyState
        icon={CalendarClock}
        title={BUDGETS_TAB.empty.publicTitle}
        description={BUDGETS_TAB.empty.publicLine}
      />
    );

  const startReview = (action: Action, plan: BudgetPlan) => {
    setOpenPlanId(null);
    setReview({ action, planId: plan.id });
  };

  return (
    <Stack>
      <ListToolbar
        segments={
          <div className="flex flex-col items-start gap-2">
            <SegmentedControl
              label={BUDGETS_TAB.segmentLabel}
              options={SEGMENT_OPTIONS}
              value={segment}
              onChange={setSegment}
            />
            {segment === 'public' ? (
              <p className="text-small text-ink-secondary">{BUDGETS_TAB.publicLine}</p>
            ) : null}
          </div>
        }
        chips={
          state === 'ready' || state === 'no-results' ? (
            <FilterChips
              label={BUDGETS_TAB.filterLabel}
              options={FILTERS}
              selected={filter}
              onChange={setFilter}
              showAll
            />
          ) : null
        }
        stats={
          state === 'ready' || state === 'no-results' ? (
            <StatRow>
              <StatTile label={BUDGETS_TAB.stats.active} value={String(active)} />
              <StatTile
                label={BUDGETS_TAB.stats.released}
                value={<Amount value={released} asset={BCH} size="lg" precision="list" />}
                sub={hasTokens ? BUDGETS_TAB.stats.bchOnly : undefined}
              />
              <StatTile
                label={BUDGETS_TAB.stats.toCome}
                value={<Amount value={toCome} asset={BCH} size="lg" precision="list" />}
                sub={hasTokens ? BUDGETS_TAB.stats.bchOnly : BUDGETS_TAB.stats.toComeSub}
              />
              <StatTile
                label={BUDGETS_TAB.stats.notFunded}
                value={<Amount value={notFunded} asset={BCH} size="lg" precision="list" />}
                sub={hasTokens ? BUDGETS_TAB.stats.bchOnly : undefined}
              />
            </StatRow>
          ) : null
        }
      />
      <List
        label={BUDGETS_TAB.listLabel}
        columns={columns}
        rows={rows}
        rowKey={(plan) => plan.id}
        onRowOpen={(plan) => setOpenPlanId(plan.id)}
        state={state}
        empty={empty}
        noResults={<NoResults thing={BUDGETS_TAB.noResultsThing} onClear={() => setFilter([])} />}
        error={
          <ErrorState
            title={BUDGETS_TAB.loadFailedTitle}
            reason={failure ?? errorMessage('LOAD_FAILED', { things: 'Budget plans' })}
            onRetry={load}
          />
        }
      />

      {openPlan ? (
        <PlanDialog
          plan={openPlan}
          vaultName={vaultNameOf(openPlan)}
          viewer={wallet.address}
          now={now}
          onClose={() => setOpenPlanId(null)}
          onAction={(action) => startReview(action, openPlan)}
        />
      ) : null}

      {reviewPlan && review ? (
        <PlanReview
          plan={reviewPlan}
          action={review.action}
          vaultName={vaultNameOf(reviewPlan)}
          readyAmount={schedule(reviewPlan, now).ready}
          network={network}
          onClose={() => setReview(null)}
          run={async () => {
            let txid: string;
            try {
              txid = await runAction(review.action, reviewPlan.id);
            } catch (error) {
              if (reachedNetwork(error)) void load();
              throw error;
            }
            void load();
            return { txid };
          }}
        />
      ) : null}
    </Stack>
  );

  function runAction(action: Action, planId: string): Promise<string> {
    switch (action) {
      case 'fund':
        return fundBudgetPlan(wallet, planId);
      case 'claim':
        return releaseMilestone(wallet, planId);
      case 'pause':
      case 'resume':
        return setPausedOnChain(wallet, 'budget-plans', planId, action);
      case 'cancel':
        return cancelBudgetPlanOnChain(wallet, planId);
    }
  }
}

type PlanDialogProps = {
  plan: BudgetPlan;
  vaultName: string | null;
  viewer: string | null;
  now: number;
  onClose: () => void;
  onAction: (action: Action) => void;
};

function PlanDialog({ plan, vaultName, viewer, now, onClose, onAction }: PlanDialogProps) {
  const status = statusOf(plan);
  const isController = sameAddress(plan.controller, viewer);
  const isSender = sameAddress(plan.creator, viewer);
  const isRecipient = sameAddress(plan.recipient, viewer);
  const { ready, nextAt } = schedule(plan, now);
  const toCome = Math.max(0, plan.totalAmount - plan.totalReleased - ready);
  const nextDate = nextAt ? formatDate(nextAt) : null;

  const actions: ReactNode[] = [];
  const canFund = plan.status === 'PENDING' && isSender && Boolean(plan.contractAddress);
  if (canFund) {
    actions.push(
      <Button key="fund" variant="primary" onClick={() => onAction('fund')}>
        {PLAN_DIALOG.fund(money(plan.totalAmount, plan))}
      </Button>
    );
  }
  if (plan.status === 'ACTIVE' && isRecipient && ready > 0) {
    actions.push(
      <Button key="claim" variant="primary" onClick={() => onAction('claim')}>
        {PLAN_DIALOG.claim(money(ready, plan))}
      </Button>
    );
  }
  if (plan.status === 'ACTIVE' && isController) {
    actions.push(
      <Button key="pause" variant="secondary" onClick={() => onAction('pause')}>
        {PLAN_DIALOG.pause}
      </Button>
    );
  }
  if (plan.status === 'PAUSED' && isController) {
    actions.push(
      <Button key="resume" variant="primary" onClick={() => onAction('resume')}>
        {PLAN_DIALOG.resume}
      </Button>
    );
  }
  if ((plan.status === 'ACTIVE' || plan.status === 'PAUSED') && isController) {
    actions.push(
      <Button key="cancel" variant="danger-quiet" onClick={() => onAction('cancel')}>
        {PLAN_DIALOG.cancel}
      </Button>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={PLAN_DIALOG.title(recipientLabel(plan))}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {ACTIONS.close}
        </Button>
      }
    >
      <Stack gap={4}>
        {status ? (
          <div>
            <StatusPill status={status} />
          </div>
        ) : null}
        {plan.perPayment > 0 && plan.intervalSeconds > 0 ? (
          <PlanSentence
            recipient={{ address: plan.recipient, name: plan.recipientName ?? undefined }}
            schedule={{
              kind: 'period-release',
              perPeriod: String(plan.perPayment),
              everyDays: Math.round(plan.intervalSeconds / 86400),
              periods: Math.max(1, Math.ceil(plan.totalAmount / plan.perPayment)),
              asset: plan.asset,
              vault: { id: plan.vaultId, name: vaultName ?? BUDGETS_TAB.noVault },
            }}
          />
        ) : null}
        {plan.status === 'PENDING' ? (
          <Notice
            tone="warning"
            title={
              isSender && !plan.contractAddress ? PLAN_DIALOG.notSetUp : PLAN_DIALOG.notFundedLine
            }
          />
        ) : null}
        {plan.status === 'PAUSED' && isRecipient ? (
          <Notice tone="warning" title={PLAN_DIALOG.pausedRecipient} />
        ) : null}
        {plan.totalAmount > 0 ? (
          <ReleaseBar
            asset={plan.asset}
            claimed={String(plan.totalReleased)}
            ready={String(ready)}
            later={String(toCome)}
          />
        ) : null}
        <DetailList
          items={[
            {
              label: PLAN_DIALOG.details.recipient,
              value: <Address value={plan.recipient} name={plan.recipientName ?? undefined} />,
            },
            { label: PLAN_DIALOG.details.vault, value: vaultName },
            {
              label: PLAN_DIALOG.details.eachTime,
              value: <Amount value={plan.perPayment} asset={plan.asset} />,
            },
            { label: PLAN_DIALOG.details.howOften, value: everyDays(plan.intervalSeconds) },
            {
              label: PLAN_DIALOG.details.total,
              value: <Amount value={plan.totalAmount} asset={plan.asset} />,
            },
            {
              label: PLAN_DIALOG.details.released,
              value: <Amount value={plan.totalReleased} asset={plan.asset} />,
            },
            {
              label: PLAN_DIALOG.details.next,
              value:
                plan.status === 'ACTIVE' && nextDate
                  ? PLAN_DIALOG.nextOn(money(plan.perPayment, plan), nextDate)
                  : null,
            },
          ]}
        />
        {isSender && vaultName ? (
          <p className="text-small text-ink-secondary">{PLAN_DIALOG.fundingLine(vaultName)}</p>
        ) : null}
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-label text-ink-secondary">{PLAN_DIALOG.manage}</p>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : (
            <p className="text-small text-ink-muted">{PLAN_DIALOG.noActions}</p>
          )}
        </div>
      </Stack>
    </Dialog>
  );
}

type PlanReviewProps = {
  plan: BudgetPlan;
  action: Action;
  vaultName: string | null;
  readyAmount: number;
  network: 'mainnet' | 'chipnet';
  onClose: () => void;
  run: () => Promise<{ txid?: string }>;
};

function PlanReview({
  plan,
  action,
  vaultName,
  readyAmount,
  network,
  onClose,
  run,
}: PlanReviewProps) {
  const name = recipientLabel(plan);
  const contract = plan.contractAddress;
  const planSentence =
    plan.perPayment > 0 && plan.intervalSeconds > 0 ? (
      <PlanSentence
        recipient={{ address: plan.recipient, name: plan.recipientName ?? undefined }}
        schedule={{
          kind: 'period-release',
          perPeriod: String(plan.perPayment),
          everyDays: Math.round(plan.intervalSeconds / 86400),
          periods: Math.max(1, Math.ceil(plan.totalAmount / plan.perPayment)),
          asset: plan.asset,
          vault: { id: plan.vaultId, name: vaultName ?? BUDGETS_TAB.noVault },
        }}
      />
    ) : undefined;

  const shared = { open: true, onClose, run: () => run() };

  if (action === 'fund') {
    if (!contract) return null;
    const summary: ReviewSummary = {
      direction: 'out',
      leavesWallet: { amount: String(plan.totalAmount), asset: plan.asset },
      goesTo: { address: contract, name: BUDGET_CREATE.created.contractName },
      network,
    };
    return (
      <TransactionReview
        {...shared}
        plan={planSentence}
        summary={summary}
        next={<p>{PLAN_REVIEWS.fund.done}</p>}
      />
    );
  }

  if (action === 'claim') {
    return (
      <TransactionReview
        {...shared}
        summary={{
          direction: 'in',
          youReceive: { amount: String(readyAmount), asset: plan.asset },
          from: contract
            ? { address: contract, name: BUDGET_CREATE.created.contractName }
            : undefined,
          network,
        }}
        next={<p>{PLAN_REVIEWS.claim.done}</p>}
      />
    );
  }

  if (action === 'pause') {
    return (
      <TransactionReview
        {...shared}
        title={PLAN_REVIEWS.pause.title}
        consequence={{ tone: 'warning', body: PLAN_REVIEWS.pause.consequence(name) }}
        confirmLabel={PLAN_REVIEWS.pause.confirm}
        keepLabel={PLAN_REVIEWS.pause.keep}
        summary={{ direction: 'fee-only', network }}
        next={<p>{PLAN_REVIEWS.pause.done}</p>}
      />
    );
  }

  if (action === 'resume') {
    return (
      <TransactionReview
        {...shared}
        title={PLAN_REVIEWS.resume.title}
        consequence={{ tone: 'info', body: PLAN_REVIEWS.resume.consequence(name) }}
        confirmLabel={PLAN_REVIEWS.resume.confirm}
        summary={{ direction: 'fee-only', network }}
        next={<p>{PLAN_REVIEWS.resume.done}</p>}
      />
    );
  }

  const comesBack = Math.max(0, plan.totalAmount - plan.totalReleased - readyAmount);
  const backLabel = money(comesBack, plan);
  return (
    <TransactionReview
      {...shared}
      title={PLAN_REVIEWS.cancel.title}
      consequence={{
        tone: 'danger',
        body: (
          <div className="flex flex-col gap-1">
            <p>
              {readyAmount > 0
                ? PLAN_REVIEWS.cancel.consequence(name, money(readyAmount, plan), backLabel)
                : PLAN_REVIEWS.cancel.consequenceNothingReady(name, backLabel)}
            </p>
            {plan.totalReleased > 0 ? (
              <p>{PLAN_REVIEWS.cancel.alreadyClaimed(name, money(plan.totalReleased, plan))}</p>
            ) : null}
          </div>
        ),
      }}
      confirmLabel={PLAN_REVIEWS.cancel.confirm}
      keepLabel={PLAN_REVIEWS.cancel.keep}
      summary={{
        direction: 'returns',
        comesBack: { amount: String(comesBack), asset: plan.asset },
        recipientKeeps:
          readyAmount > 0 ? { amount: String(readyAmount), asset: plan.asset } : undefined,
        network,
      }}
      next={<p>{PLAN_REVIEWS.cancel.done}</p>}
    />
  );
}
