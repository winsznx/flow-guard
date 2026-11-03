import { useCallback, useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { ListToolbar } from '../components/layout/ListToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Amount } from '../components/ui/Amount';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { Plus, Target } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { SearchInput } from '../components/ui/SearchInput';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { useWallet } from '../hooks/useWallet';
import {
  BOUNTIES_LIST,
  activeCount,
  bountyCount,
  createdOn,
  endsOn,
  paidOutOf,
  winnersPaid,
} from '../copy/bounties';
import { showFinished } from '../copy/common';
import { asFlowError } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import { STATUS, type StatusKey } from '../copy/status';
import { fetchBounties, type BountyRow } from '../services/bountyApi';
import { campaignAsset, campaignStatus, storedUnits } from '../utils/campaignAmounts';

const BCH: Asset = { kind: 'bch' };

type StatusFilter = 'notFunded' | 'active' | 'paused' | 'finished' | 'cancelled';

const FILTER_KEYS: readonly StatusFilter[] = ['notFunded', 'active', 'paused', 'finished', 'cancelled'];
const DONE: ReadonlySet<StatusKey> = new Set(['finished', 'expired', 'cancelled']);

type Load = { state: 'loading' } | { state: 'error'; reason: string } | { state: 'ready'; rows: BountyRow[] };

function filterKey(status: StatusKey): StatusFilter {
  if (status === 'scheduled') return 'active';
  if (status === 'expired') return 'finished';
  return FILTER_KEYS.find((key) => key === status) ?? 'notFunded';
}

function prizeCell(row: BountyRow): React.ReactNode {
  return <Amount value={storedUnits(row.reward_per_winner, row)} asset={campaignAsset(row)} precision="list" />;
}

function needsAction(row: BountyRow): number {
  return row.status === 'PENDING' ? 0 : 1;
}

function metaLine(row: BountyRow): string {
  const end = formatDate(row.end_date ?? null);
  const created = formatDate(row.created_at);
  if (end) return endsOn(end);
  return created ? createdOn(created) : BOUNTIES_LIST.noEndDate;
}

const columns: Column<BountyRow>[] = [
  {
    key: 'bounty',
    header: BOUNTIES_LIST.columns.bounty,
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-title-item text-ink break-words">{row.title}</span>
        <span className="text-small text-ink-muted">{metaLine(row)}</span>
      </span>
    ),
  },
  {
    key: 'status',
    header: BOUNTIES_LIST.columns.status,
    mobile: 'top',
    cell: (row) => <StatusPill status={campaignStatus(row)} />,
  },
  {
    key: 'perWinner',
    header: BOUNTIES_LIST.columns.perWinner,
    align: 'end',
    mobile: 'bottom-start',
    mobileLabel: BOUNTIES_LIST.columns.perWinner,
    cell: prizeCell,
  },
  {
    key: 'winners',
    header: BOUNTIES_LIST.columns.winners,
    align: 'end',
    mobile: 'bottom-end',
    cell: (row) => winnersPaid(row.winners_count, row.max_winners),
  },
];

export default function BountiesPage() {
  const wallet = useWallet();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<StatusFilter[]>([]);
  const [query, setQuery] = useState('');

  const loadBounties = useCallback(async (): Promise<void> => {
    if (!wallet.address) return;
    setLoad({ state: 'loading' });
    try {
      const result = await fetchBounties(wallet.address);
      setLoad({ state: 'ready', rows: result.campaigns });
    } catch (error) {
      setLoad({ state: 'error', reason: asFlowError(error).message });
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadBounties();
  }, [loadBounties]);

  const now = Date.now();
  const rows = useMemo(() => (load.state === 'ready' ? load.rows : []), [load]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => needsAction(a) - needsAction(b) || b.created_at - a.created_at),
    [rows],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sorted.filter((row) => {
      if (filter.length > 0 && !filter.includes(filterKey(campaignStatus(row, now)))) return false;
      return term === '' || row.title.toLowerCase().includes(term);
    });
  }, [sorted, filter, query, now]);

  const filtering = filter.length > 0 || query.trim() !== '';
  const open = filtering ? visible : visible.filter((row) => !DONE.has(campaignStatus(row, now)));
  const done = filtering ? [] : visible.filter((row) => DONE.has(campaignStatus(row, now)));

  const listState: ListState =
    load.state === 'loading'
      ? 'loading'
      : load.state === 'error'
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : visible.length === 0
            ? 'no-results'
            : 'ready';

  const bchRows = rows.filter((row) => campaignAsset(row).kind === 'bch');
  const prizeTotal = bchRows.reduce((sum, row) => sum + row.reward_per_winner * row.max_winners, 0);
  const paidTotal = bchRows.reduce((sum, row) => sum + row.total_paid, 0);
  const active = rows.filter((row) => campaignStatus(row, now) === 'active').length;
  const winners = rows.reduce((sum, row) => sum + row.winners_count, 0);

  const createButton = (
    <ButtonLink variant="primary" to="/bounties/create" leadingIcon={Plus}>
      {BOUNTIES_LIST.create}
    </ButtonLink>
  );

  const clear = () => {
    setFilter([]);
    setQuery('');
  };

  const fundAction = (row: BountyRow) =>
    row.status === 'PENDING' ? (
      <ButtonLink variant="secondary" size="sm" to={`/bounties/${row.id}`}>
        {BOUNTIES_LIST.fund}
      </ButtonLink>
    ) : null;

  return (
    <PageContainer>
      <PageHeader
        title={BOUNTIES_LIST.title}
        description={BOUNTIES_LIST.description}
        stateLine={load.state === 'ready' && rows.length > 0 ? `${bountyCount(rows.length)} · ${activeCount(active)}` : undefined}
        primaryAction={createButton}
      />
      <Stack>
        {load.state === 'ready' && rows.length > 0 ? (
          <ListToolbar
            search={
              <SearchInput
                label={BOUNTIES_LIST.searchLabel}
                placeholder={BOUNTIES_LIST.searchPlaceholder}
                value={query}
                onChange={setQuery}
                className="w-full"
              />
            }
            chips={
              <FilterChips
                label={BOUNTIES_LIST.statusLabel}
                options={FILTER_KEYS.map((key) => ({ value: key, label: STATUS[key].word }))}
                selected={filter}
                onChange={setFilter}
                showAll
              />
            }
            stats={
              <StatRow>
                <StatTile label={BOUNTIES_LIST.stats.active} value={active} />
                <StatTile
                  label={BOUNTIES_LIST.stats.prizeMoney}
                  value={<Amount value={prizeTotal} asset={BCH} size="lg" precision="list" />}
                  sub={paidOutOf(
                    formatAmount(paidTotal, BCH, { precision: 'list' }) ?? '',
                    formatAmount(prizeTotal, BCH, { precision: 'list' }) ?? '',
                  )}
                />
                <StatTile label={BOUNTIES_LIST.stats.winnersPaid} value={winners} />
              </StatRow>
            }
          />
        ) : null}

        <List
          label={BOUNTIES_LIST.listLabel}
          columns={columns}
          rows={open}
          rowKey={(row) => row.id}
          rowHref={(row) => `/bounties/${row.id}`}
          rowAction={fundAction}
          collapsed={done.length > 0 ? { label: showFinished(done.length), rows: done } : undefined}
          state={listState}
          empty={
            <EmptyState
              icon={Target}
              title={BOUNTIES_LIST.emptyTitle}
              description={BOUNTIES_LIST.emptyLine}
              example={BOUNTIES_LIST.example}
              action={createButton}
              learnMore={{ label: BOUNTIES_LIST.howTheyWork, to: BOUNTIES_LIST.howTheyWorkPath }}
            />
          }
          noResults={<NoResults thing={BOUNTIES_LIST.thing} onClear={clear} />}
          error={
            <ErrorState
              title={BOUNTIES_LIST.loadFailed}
              reason={load.state === 'error' ? load.reason : undefined}
              onRetry={loadBounties}
            />
          }
        />
      </Stack>
    </PageContainer>
  );
}
