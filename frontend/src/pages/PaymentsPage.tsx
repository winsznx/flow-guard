import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { ListToolbar } from '../components/layout/ListToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Amount } from '../components/ui/Amount';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { Plus, Repeat, Users } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { useWallet } from '../hooks/useWallet';
import { showFinished } from '../copy/common';
import { formatAddress, formatDate, formatRelative } from '../copy/format';
import {
  INTERVAL_WORD,
  PAYMENTS_PAGE,
  paymentFrom,
  paymentTo,
  tokenRowsLeftOut,
  type PaymentInterval,
} from '../copy/payments';
import { STATUS, lifecycleStatus, type StatusKey } from '../copy/status';
import { getCachedTokenMeta } from '../utils/tokenMeta';

type View = 'all' | 'receiving' | 'sending';
type StatusFilter = 'all' | 'notFunded' | 'scheduled' | 'active' | 'readyToClaim' | 'paused' | 'finished' | 'cancelled';

interface PaymentRow {
  id: string;
  sender: string;
  recipient: string;
  recipient_name?: string | null;
  token_type: string;
  token_category?: string | null;
  token_decimals?: number | null;
  amount_per_period: number;
  interval: PaymentInterval;
  interval_seconds?: number | null;
  start_date: number;
  end_date?: number | null;
  next_payment_date: number;
  total_paid: number;
  payment_count: number;
  status: string;
}

type ListedPayment = PaymentRow & { role: 'sending' | 'receiving' };

const BCH: Asset = { kind: 'bch' };
const DAY_SECONDS = 86_400;
const NO_END_PAYMENTS = 12;
/** The server signs a claim with a lock time 2 hours in the past, so a payment is claimable 2 hours after it's due. */
const CLAIM_LAG_SECONDS = 7_200;
const INTERVAL_SECONDS: Record<PaymentInterval, number> = {
  DAILY: DAY_SECONDS,
  WEEKLY: 7 * DAY_SECONDS,
  BIWEEKLY: 14 * DAY_SECONDS,
  MONTHLY: 30 * DAY_SECONDS,
  YEARLY: 365 * DAY_SECONDS,
};

const VIEWS: { value: View; label: string }[] = [
  { value: 'all', label: PAYMENTS_PAGE.views.all },
  { value: 'receiving', label: PAYMENTS_PAGE.views.receiving },
  { value: 'sending', label: PAYMENTS_PAGE.views.sending },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: PAYMENTS_PAGE.filterAll },
  { value: 'readyToClaim', label: STATUS.readyToClaim.word },
  { value: 'notFunded', label: STATUS.notFunded.word },
  { value: 'scheduled', label: STATUS.scheduled.word },
  { value: 'active', label: STATUS.active.word },
  { value: 'paused', label: STATUS.paused.word },
  { value: 'finished', label: STATUS.finished.word },
  { value: 'cancelled', label: STATUS.cancelled.word },
];

function readView(value: string | null): View {
  return value === 'receiving' || value === 'sending' ? value : 'all';
}

function readStatus(value: string | null): StatusFilter {
  return FILTERS.some((filter) => filter.value === value) ? (value as StatusFilter) : 'all';
}

function paymentAsset(row: PaymentRow): Asset {
  if (row.token_type === 'BCH' || !row.token_category) return BCH;
  const meta = getCachedTokenMeta(row.token_category);
  return { kind: 'token', tokenId: row.token_category, symbol: meta?.symbol, decimals: row.token_decimals ?? meta?.decimals ?? 0 };
}

function intervalSeconds(row: PaymentRow): number {
  return Number(row.interval_seconds) || INTERVAL_SECONDS[row.interval] || 30 * DAY_SECONDS;
}

/** Mirrors the server: with an end date, ceil((end - start) / interval) payments, otherwise 12. */
function paymentTotal(row: PaymentRow): number {
  const step = intervalSeconds(row);
  if (row.end_date && row.end_date > row.start_date) return Math.max(1, Math.ceil((row.end_date - row.start_date) / step));
  return NO_END_PAYMENTS;
}

/** Payments due and claimable now, the same count the detail page shows. */
function dueCount(row: PaymentRow, nowSeconds: number): number {
  const left = Math.max(0, paymentTotal(row) - Number(row.payment_count || 0));
  const claimableFrom = nowSeconds - CLAIM_LAG_SECONDS;
  if (left === 0 || claimableFrom < row.next_payment_date) return 0;
  return Math.min(left, Math.floor((claimableFrom - row.next_payment_date) / intervalSeconds(row)) + 1);
}

function rowStatus(row: ListedPayment, nowSeconds: number): StatusKey {
  const base = lifecycleStatus(row.status, { startsAt: row.start_date * 1000, now: nowSeconds * 1000 }) ?? 'active';
  if (base !== 'active' && base !== 'scheduled') return base;
  if (Number(row.payment_count) >= paymentTotal(row)) return 'finished';
  if (row.role === 'receiving' && base === 'active' && nowSeconds >= row.next_payment_date + CLAIM_LAG_SECONDS) {
    return 'readyToClaim';
  }
  return base;
}

function isDone(status: StatusKey): boolean {
  return status === 'finished' || status === 'cancelled';
}

async function fetchPayments(param: 'sender' | 'recipient', address: string): Promise<PaymentRow[]> {
  const response = await fetch(`/api/payments?${param}=${encodeURIComponent(address)}`);
  if (!response.ok) throw new Error(`Recurring payments request failed with ${response.status}`);
  const data: { payments?: PaymentRow[] } = await response.json();
  return data.payments ?? [];
}

function counterparty(row: ListedPayment): string {
  return formatAddress(row.role === 'sending' ? row.recipient : row.sender);
}

function rowName(row: ListedPayment): string {
  if (row.role === 'receiving') return paymentFrom(counterparty(row));
  return row.recipient_name?.trim() || paymentTo(counterparty(row));
}

const WEEK_SECONDS = 7 * DAY_SECONDS;

function nextCell(row: ListedPayment, status: StatusKey, nowSeconds: number): ReactNode {
  if (status === 'readyToClaim') return PAYMENTS_PAGE.readyNow;
  if (status === 'notFunded') return PAYMENTS_PAGE.afterFunding;
  if (status !== 'active' && status !== 'scheduled') return null;
  const date = formatDate(row.next_payment_date, { dropSameYear: true, now: nowSeconds * 1000 });
  if (!date) return null;
  const soon = Math.abs(row.next_payment_date - nowSeconds) < WEEK_SECONDS;
  const relative = soon ? formatRelative(row.next_payment_date, nowSeconds * 1000) : null;
  return (
    <>
      <span className="md:hidden">{PAYMENTS_PAGE.nextOn} </span>
      {relative ? `${date} · ${relative}` : date}
    </>
  );
}

export default function PaymentsPage() {
  const wallet = useWallet();
  const [params, setParams] = useSearchParams();
  const view = readView(params.get('view'));
  const status = readStatus(params.get('status'));
  const query = params.get('q') ?? '';
  const [rows, setRows] = useState<ListedPayment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setFailed(false);
    setRows(null);
    try {
      const [sent, received] = await Promise.all([
        fetchPayments('sender', wallet.address),
        fetchPayments('recipient', wallet.address),
      ]);
      const seen = new Set<string>();
      const merged: ListedPayment[] = [];
      for (const row of sent) {
        seen.add(row.id);
        merged.push({ ...row, role: 'sending' });
      }
      for (const row of received) {
        if (!seen.has(row.id)) merged.push({ ...row, role: 'receiving' });
      }
      setRows(merged);
    } catch (error) {
      console.error('Recurring payments did not load', error);
      setFailed(true);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '' || value === 'all') merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  };

  const inView = useMemo(
    () => (rows ?? []).filter((row) => view === 'all' || row.role === view),
    [rows, view],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inView.filter((row) => {
      if (status !== 'all' && rowStatus(row, nowSeconds) !== status) return false;
      if (!needle) return true;
      const haystack = [row.recipient_name ?? '', row.recipient, row.sender].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [inView, query, status, nowSeconds]);

  const open = status === 'all' ? filtered.filter((row) => !isDone(rowStatus(row, nowSeconds))) : filtered;
  const done = status === 'all' ? filtered.filter((row) => isDone(rowStatus(row, nowSeconds))) : [];

  const filtering = status !== 'all' || query.trim() !== '';
  const state: ListState = failed
    ? 'error'
    : rows === null
      ? 'loading'
      : filtered.length > 0
        ? 'ready'
        : inView.length === 0
          ? 'empty'
          : filtering
            ? 'no-results'
            : 'empty';

  const bchRows = inView.filter((row) => paymentAsset(row).kind === 'bch');
  const tokenCount = inView.length - bchRows.length;
  const activeCount = inView.filter((row) => {
    const key = rowStatus(row, nowSeconds);
    return key === 'active' || key === 'readyToClaim' || key === 'scheduled';
  }).length;
  const readyBch = bchRows
    .filter((row) => rowStatus(row, nowSeconds) === 'readyToClaim')
    .reduce((sum, row) => sum + dueCount(row, nowSeconds) * Number(row.amount_per_period || 0), 0);
  const paidOut = bchRows.filter((row) => row.role === 'sending').reduce((sum, row) => sum + Number(row.total_paid || 0), 0);
  const claimedIn = bchRows
    .filter((row) => row.role === 'receiving')
    .reduce((sum, row) => sum + Number(row.total_paid || 0), 0);
  const tokenSub = tokenCount > 0 ? tokenRowsLeftOut(tokenCount) : undefined;
  const showStats = state !== 'empty' && state !== 'error' && (rows === null || inView.length > 0);
  const tileState = rows === null ? 'loading' : 'ready';

  const columns: Column<ListedPayment>[] = [
    {
      key: 'payment',
      header: PAYMENTS_PAGE.columns.payment,
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-item text-ink">{rowName(row)}</span>
          <span className="text-small text-ink-muted">
            {[row.role === 'sending' ? PAYMENTS_PAGE.youSend : PAYMENTS_PAGE.youReceive, INTERVAL_WORD[row.interval]]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: PAYMENTS_PAGE.columns.status,
      mobile: 'top',
      cell: (row) => <StatusPill status={rowStatus(row, nowSeconds)} />,
    },
    {
      key: 'each',
      header: PAYMENTS_PAGE.columns.each,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => <Amount value={row.amount_per_period} asset={paymentAsset(row)} precision="list" />,
    },
    {
      key: 'next',
      header: PAYMENTS_PAGE.columns.next,
      mobile: 'bottom-end',
      cell: (row) => nextCell(row, rowStatus(row, nowSeconds), nowSeconds),
    },
  ];

  const createButton = (
    <ButtonLink variant="primary" leadingIcon={Plus} to="/payments/create">
      {PAYMENTS_PAGE.create}
    </ButtonLink>
  );

  const empty =
    view === 'receiving' ? (
      <EmptyState
        icon={Repeat}
        title={PAYMENTS_PAGE.empty.receiving.title}
        description={PAYMENTS_PAGE.empty.receiving.description}
        learnMore={{ label: PAYMENTS_PAGE.howItWorks, to: '/help#someone-set-up-a-payment' }}
      />
    ) : (
      <EmptyState
        icon={Repeat}
        title={view === 'sending' ? PAYMENTS_PAGE.empty.sending.title : PAYMENTS_PAGE.empty.all.title}
        description={view === 'sending' ? PAYMENTS_PAGE.empty.sending.description : PAYMENTS_PAGE.empty.all.description}
        example={PAYMENTS_PAGE.empty.all.example}
        action={createButton}
        learnMore={{ label: PAYMENTS_PAGE.howItWorks, to: '/help#stream-or-recurring-payment' }}
      />
    );

  return (
    <PageContainer>
      <PageHeader
        title={PAYMENTS_PAGE.title}
        description={PAYMENTS_PAGE.description}
        primaryAction={createButton}
        secondaryActions={[
          <ButtonLink key="pay-many" variant="secondary" leadingIcon={Users} to="/streams/batch-create">
            {PAYMENTS_PAGE.payMany}
          </ButtonLink>,
        ]}
      />
      <Stack>
        <ListToolbar
          segments={
            <SegmentedControl
              label={PAYMENTS_PAGE.viewLabel}
              options={VIEWS}
              value={view}
              onChange={(next) => update({ view: next, status: null })}
            />
          }
          search={
            <SearchInput
              label={PAYMENTS_PAGE.searchLabel}
              placeholder={PAYMENTS_PAGE.searchPlaceholder}
              value={query}
              onChange={(next) => update({ q: next })}
              className="w-full"
            />
          }
          chips={
            <FilterChips
              label={PAYMENTS_PAGE.filterLabel}
              options={view === 'sending' ? FILTERS.filter((filter) => filter.value !== 'readyToClaim') : FILTERS}
              selected={[status]}
              onChange={(next) => update({ status: next[0] ?? null })}
            />
          }
          stats={
            showStats ? (
          <StatRow>
            <StatTile label={PAYMENTS_PAGE.stats.active} value={activeCount} state={tileState} />
            {view !== 'sending' ? (
              <StatTile
                label={PAYMENTS_PAGE.stats.ready}
                value={<Amount value={readyBch} asset={BCH} size="lg" precision="list" />}
                sub={tokenSub}
                state={tileState}
              />
            ) : null}
            {view !== 'receiving' ? (
              <StatTile
                label={PAYMENTS_PAGE.stats.paid}
                value={<Amount value={paidOut} asset={BCH} size="lg" precision="list" />}
                sub={tokenSub}
                state={tileState}
              />
            ) : null}
            {view !== 'sending' ? (
              <StatTile
                label={PAYMENTS_PAGE.stats.received}
                value={<Amount value={claimedIn} asset={BCH} size="lg" precision="list" />}
                sub={tokenSub}
                state={tileState}
              />
            ) : null}
          </StatRow>
            ) : null
          }
        />

        <List
          label={PAYMENTS_PAGE.listLabel}
          columns={columns}
          rows={open}
          rowKey={(row) => row.id}
          rowHref={(row) => `/payments/${row.id}`}
          state={state}
          collapsed={done.length > 0 ? { label: showFinished(done.length), rows: done } : undefined}
          empty={empty}
          noResults={<NoResults thing={PAYMENTS_PAGE.noResultsThing} onClear={() => update({ status: null, q: null })} />}
          error={<ErrorState title={PAYMENTS_PAGE.error.title} reason={PAYMENTS_PAGE.error.reason} onRetry={load} />}
        />
      </Stack>
    </PageContainer>
  );
}
