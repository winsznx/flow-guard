import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { ListToolbar } from '../components/layout/ListToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { FileCheck, Plus } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Notice } from '../components/ui/Notice';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { asFlowError, errorMessage } from '../copy/errors';
import { formatDate } from '../copy/format';
import { READY_TO_SEND, REQUESTS_PAGE, approvalsLine } from '../copy/requests';
import { STATUS, spendingRequestStatus } from '../copy/status';
import { sameAddress, vaultTitle } from '../copy/vaults';
import { useWallet } from '../hooks/useWallet';
import { fetchProposals, fetchVaults } from '../utils/api';

const BCH: Asset = { kind: 'bch' };

type RequestStatus = 'pending' | 'approved' | 'executed' | 'rejected';

type RequestRow = {
  id: string;
  amount: number;
  recipient: string;
  reason: string;
  status: string;
  approvals: string[];
  approvalCount: number;
  required: number;
  vaultId: string;
  vaultName: string;
  createdAt: string | null;
};

type Loaded = { rows: RequestRow[]; vaultCount: number; failedVaults: number };

const FILTERS: { value: RequestStatus; label: string }[] = [
  { value: 'pending', label: STATUS.waitingForApproval.word },
  { value: 'approved', label: STATUS.approved.word },
  { value: 'executed', label: STATUS.paid.word },
  { value: 'rejected', label: STATUS.rejected.word },
];

function toRow(raw: Record<string, unknown>, vault: Record<string, unknown>): RequestRow {
  const approvals = Array.isArray(raw.approvals)
    ? raw.approvals.filter((a): a is string => typeof a === 'string')
    : [];
  const vaultId = String(vault.id ?? '');
  return {
    id: String(raw.id ?? ''),
    amount: Number(raw.amount) || 0,
    recipient: typeof raw.recipient === 'string' ? raw.recipient : '',
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    status: String(raw.status ?? '').toLowerCase(),
    approvals,
    approvalCount: Number(raw.approvalCount) || approvals.length,
    required: Number(vault.approvalThreshold) || 0,
    vaultId,
    vaultName: vaultTitle({
      id: vaultId,
      name: typeof vault.name === 'string' ? vault.name : null,
    }),
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
  };
}

const COLUMNS: Column<RequestRow>[] = [
  {
    key: 'request',
    header: REQUESTS_PAGE.columns.request,
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{row.reason || REQUESTS_PAGE.noReason}</span>
        <span className="truncate text-small text-ink-muted">
          {REQUESTS_PAGE.inVault(row.vaultName)}
        </span>
      </span>
    ),
  },
  {
    key: 'amount',
    header: REQUESTS_PAGE.columns.amount,
    align: 'end',
    mobile: 'bottom-end',
    cell: (row) => <Amount value={row.amount} asset={BCH} precision="list" />,
  },
  {
    key: 'to',
    header: REQUESTS_PAGE.columns.to,
    mobile: 'hidden',
    cell: (row) => <Address value={row.recipient} copy={false} />,
  },
  {
    key: 'approvals',
    header: REQUESTS_PAGE.columns.approvals,
    mobile: 'bottom-start',
    cell: (row) => approvalsLine(row.approvalCount, row.required),
  },
  {
    key: 'status',
    header: REQUESTS_PAGE.columns.status,
    mobile: 'top',
    cell: (row) => {
      const status = spendingRequestStatus(row.status);
      return status ? <StatusPill status={status} size="sm" /> : null;
    },
  },
  {
    key: 'created',
    header: REQUESTS_PAGE.columns.created,
    mobile: 'hidden',
    cell: (row) => (row.createdAt ? formatDate(row.createdAt, { dropSameYear: true }) : null),
  },
];

export default function ProposalsPage() {
  const wallet = useWallet();
  const [data, setData] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [filter, setFilter] = useState<RequestStatus[]>([]);

  const load = useCallback(async () => {
    setFailure(null);
    setData(null);
    try {
      const vaults = await fetchVaults(wallet.address || undefined);
      const own: Record<string, unknown>[] = [...vaults.created, ...vaults.signerIn];
      const results = await Promise.allSettled(
        own.map((vault) => fetchProposals(String(vault.id), wallet.address))
      );
      const rows: RequestRow[] = [];
      let failedVaults = 0;
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failedVaults += 1;
          return;
        }
        rows.push(...result.value.map((raw: Record<string, unknown>) => toRow(raw, own[index])));
      });
      rows.sort((a, b) => Date.parse(b.createdAt ?? '') - Date.parse(a.createdAt ?? ''));
      setData({ rows, vaultCount: own.length, failedVaults });
    } catch (error) {
      setFailure(asFlowError(error).message);
    }
  }, [wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => data?.rows ?? [], [data]);
  const rows = all.filter(
    (row) => filter.length === 0 || filter.includes(row.status as RequestStatus)
  );
  const state: ListState = failure
    ? 'error'
    : !data
      ? 'loading'
      : all.length === 0
        ? 'empty'
        : rows.length === 0
          ? 'no-results'
          : 'ready';

  const pending = all.filter((row) => row.status === 'pending');
  const needsYou = pending.filter(
    (row) => !row.approvals.some((a) => sameAddress(a, wallet.address))
  ).length;
  const approved = all.filter((row) => row.status === 'approved').length;

  const empty =
    data && data.vaultCount === 0 ? (
      <EmptyState
        icon={FileCheck}
        title={REQUESTS_PAGE.empty.title}
        description={REQUESTS_PAGE.empty.noVaultsLine}
        action={
          <ButtonLink to="/vaults/create" variant="primary" leadingIcon={Plus}>
            {REQUESTS_PAGE.empty.createVault}
          </ButtonLink>
        }
      />
    ) : (
      <EmptyState
        icon={FileCheck}
        title={REQUESTS_PAGE.empty.title}
        description={REQUESTS_PAGE.empty.line}
        action={
          <ButtonLink to="/vaults" variant="primary">
            {REQUESTS_PAGE.empty.action}
          </ButtonLink>
        }
      />
    );

  return (
    <PageContainer>
      <PageHeader title={REQUESTS_PAGE.title} description={REQUESTS_PAGE.description} />
      <Stack>
        {data && data.failedVaults > 0 ? (
          <Notice tone="warning" title={REQUESTS_PAGE.someFailedTitle}>
            {REQUESTS_PAGE.someFailed(data.failedVaults)}
          </Notice>
        ) : null}
        {state === 'ready' || state === 'no-results' ? (
          <>
            {approved > 0 ? (
              <Notice tone="info" title={READY_TO_SEND.title}>
                {READY_TO_SEND.line}
              </Notice>
            ) : null}
            <ListToolbar
              chips={
                <FilterChips
                  label={REQUESTS_PAGE.filterLabel}
                  options={FILTERS}
                  selected={filter}
                  onChange={setFilter}
                  showAll
                />
              }
              stats={
                <StatRow>
                  <StatTile label={REQUESTS_PAGE.stats.needsYou} value={String(needsYou)} />
                  <StatTile label={REQUESTS_PAGE.stats.waiting} value={String(pending.length)} />
                  <StatTile label={REQUESTS_PAGE.stats.approved} value={String(approved)} />
                </StatRow>
              }
            />
          </>
        ) : null}
        <List
          label={REQUESTS_PAGE.listLabel}
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/vaults/${row.vaultId}`}
          state={state}
          empty={empty}
          noResults={
            <NoResults thing={REQUESTS_PAGE.noResultsThing} onClear={() => setFilter([])} />
          }
          error={
            <ErrorState
              title={REQUESTS_PAGE.loadFailedTitle}
              reason={failure ?? errorMessage('LOAD_FAILED', { things: 'Spending requests' })}
              onRetry={load}
            />
          }
        />
      </Stack>
    </PageContainer>
  );
}
