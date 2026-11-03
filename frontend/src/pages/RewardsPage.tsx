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
import { Award, Plus } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { SearchInput } from '../components/ui/SearchInput';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { useWallet } from '../hooks/useWallet';
import { showFinished } from '../copy/common';
import { asFlowError } from '../copy/errors';
import { formatAmount, formatDate } from '../copy/format';
import {
  REWARDS_LIST,
  REWARD_TYPE,
  REWARD_TYPE_ORDER,
  activePrograms,
  endsOn,
  leftAmount,
  programCount,
  sentAmount,
  toFund,
} from '../copy/rewards';
import { STATUS, type StatusKey } from '../copy/status';
import { fetchRewards, type RewardCategory, type RewardRow } from '../services/rewardApi';
import { campaignAsset, campaignStatus, storedUnits, useTableLayout } from '../utils/campaignAmounts';

const BCH: Asset = { kind: 'bch' };

type StatusFilter = 'notFunded' | 'active' | 'paused' | 'finished' | 'cancelled';
type TypeFilter = 'all' | RewardCategory;

const FILTER_KEYS: readonly StatusFilter[] = ['notFunded', 'active', 'paused', 'finished', 'cancelled'];
const DONE: ReadonlySet<StatusKey> = new Set(['finished', 'expired', 'cancelled']);

type Load = { state: 'loading' } | { state: 'error'; reason: string } | { state: 'ready'; rows: RewardRow[] };

function filterKey(status: StatusKey): StatusFilter {
  if (status === 'scheduled') return 'active';
  if (status === 'expired') return 'finished';
  return FILTER_KEYS.find((key) => key === status) ?? 'notFunded';
}

function leftOf(row: RewardRow): number {
  return Math.max(0, (row.total_pool ?? 0) - (row.distributed_total ?? 0));
}

function leftUnits(row: RewardRow): bigint {
  const left = storedUnits(row.total_pool, row) - storedUnits(row.distributed_total, row);
  return left > 0n ? left : 0n;
}

function amountCell(units: bigint, row: RewardRow, words: ((amount: string) => string) | null): React.ReactNode {
  const asset = campaignAsset(row);
  if (!words) return <Amount value={units} asset={asset} precision="list" />;
  return words(formatAmount(units, asset, { precision: 'list' }) ?? '');
}

function paidCell(row: RewardRow, table: boolean): React.ReactNode {
  if (row.status === 'PENDING') return null;
  return amountCell(storedUnits(row.distributed_total, row), row, table ? null : sentAmount);
}

function leftCell(row: RewardRow, table: boolean): React.ReactNode {
  if (row.status === 'PENDING') return amountCell(storedUnits(row.total_pool, row), row, toFund);
  return amountCell(leftUnits(row), row, table ? null : leftAmount);
}

function metaLine(row: RewardRow): string {
  const type = REWARD_TYPE[row.reward_category] ?? REWARD_TYPE.CUSTOM;
  const end = formatDate(row.end_date ?? null);
  return `${type} · ${end ? endsOn(end) : REWARDS_LIST.noEndDate}`;
}

const columns = (table: boolean): Column<RewardRow>[] => [
  {
    key: 'program',
    header: REWARDS_LIST.columns.program,
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
    header: REWARDS_LIST.columns.status,
    mobile: 'top',
    cell: (row) => <StatusPill status={campaignStatus(row)} />,
  },
  {
    key: 'paidOut',
    header: REWARDS_LIST.columns.paidOut,
    align: 'end',
    mobile: 'bottom-start',
    cell: (row) => paidCell(row, table),
  },
  {
    key: 'left',
    header: REWARDS_LIST.columns.left,
    align: 'end',
    mobile: 'bottom-end',
    cell: (row) => leftCell(row, table),
  },
];

export default function RewardsPage() {
  const wallet = useWallet();
  const table = useTableLayout();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [filter, setFilter] = useState<StatusFilter[]>([]);
  const [type, setType] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');

  const loadRewards = useCallback(async (): Promise<void> => {
    if (!wallet.address) return;
    setLoad({ state: 'loading' });
    try {
      const result = await fetchRewards(wallet.address);
      setLoad({ state: 'ready', rows: result.campaigns });
    } catch (error) {
      setLoad({ state: 'error', reason: asFlowError(error).message });
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  const now = Date.now();
  const rows = useMemo(() => (load.state === 'ready' ? load.rows : []), [load]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => Number(a.status !== 'PENDING') - Number(b.status !== 'PENDING') || b.created_at - a.created_at,
      ),
    [rows],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return sorted.filter((row) => {
      if (filter.length > 0 && !filter.includes(filterKey(campaignStatus(row, now)))) return false;
      if (type !== 'all' && row.reward_category !== type) return false;
      return term === '' || row.title.toLowerCase().includes(term);
    });
  }, [sorted, filter, type, query, now]);

  const filtering = filter.length > 0 || type !== 'all' || query.trim() !== '';
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
  const paidOut = bchRows.reduce((sum, row) => sum + (row.distributed_total ?? 0), 0);
  const left = bchRows.reduce((sum, row) => (row.status === 'PENDING' ? sum : sum + leftOf(row)), 0);
  const sent = rows.reduce((sum, row) => sum + (row.distributed_count ?? 0), 0);
  const active = rows.filter((row) => campaignStatus(row, now) === 'active').length;

  const createButton = (
    <ButtonLink variant="primary" to="/rewards/create" leadingIcon={Plus}>
      {REWARDS_LIST.create}
    </ButtonLink>
  );

  const clear = () => {
    setFilter([]);
    setType('all');
    setQuery('');
  };

  const fundAction = (row: RewardRow) =>
    row.status === 'PENDING' ? (
      <ButtonLink variant="secondary" size="sm" to={`/rewards/${row.id}`}>
        {REWARDS_LIST.fund}
      </ButtonLink>
    ) : null;

  return (
    <PageContainer>
      <PageHeader
        title={REWARDS_LIST.title}
        description={REWARDS_LIST.description}
        stateLine={load.state === 'ready' && rows.length > 0 ? `${programCount(rows.length)} · ${activePrograms(active)}` : undefined}
        primaryAction={createButton}
      />
      <Stack>
        {load.state === 'ready' && rows.length > 0 ? (
          <ListToolbar
            search={
              <SearchInput
                label={REWARDS_LIST.searchLabel}
                placeholder={REWARDS_LIST.searchPlaceholder}
                value={query}
                onChange={setQuery}
                className="w-full"
              />
            }
            chips={
              <>
                <FilterChips
                  label={REWARDS_LIST.statusLabel}
                  options={FILTER_KEYS.map((key) => ({ value: key, label: STATUS[key].word }))}
                  selected={filter}
                  onChange={setFilter}
                  showAll
                />
                <FilterChips<RewardCategory>
                  label={REWARDS_LIST.typeLabel}
                  options={REWARD_TYPE_ORDER.map((key) => ({ value: key, label: REWARD_TYPE[key] }))}
                  selected={type === 'all' ? [] : [type]}
                  onChange={(next) => setType(next[0] ?? 'all')}
                />
              </>
            }
            stats={
              <StatRow>
                <StatTile label={REWARDS_LIST.stats.active} value={active} />
                <StatTile
                  label={REWARDS_LIST.stats.paidOut}
                  value={<Amount value={paidOut} asset={BCH} size="lg" precision="list" />}
                  sub={REWARDS_LIST.stats.bchOnly}
                />
                <StatTile label={REWARDS_LIST.stats.sent} value={sent} />
                <StatTile
                  label={REWARDS_LIST.stats.left}
                  value={<Amount value={left} asset={BCH} size="lg" precision="list" />}
                  sub={REWARDS_LIST.stats.bchOnly}
                />
              </StatRow>
            }
          />
        ) : null}

        <List
          label={REWARDS_LIST.listLabel}
          columns={columns(table)}
          rows={open}
          rowKey={(row) => row.id}
          rowHref={(row) => `/rewards/${row.id}`}
          rowAction={fundAction}
          collapsed={done.length > 0 ? { label: showFinished(done.length), rows: done } : undefined}
          state={listState}
          empty={
            <EmptyState
              icon={Award}
              title={REWARDS_LIST.emptyTitle}
              description={REWARDS_LIST.emptyLine}
              example={REWARDS_LIST.example}
              action={createButton}
              learnMore={{ label: REWARDS_LIST.howTheyWork, to: REWARDS_LIST.howTheyWorkPath }}
            />
          }
          noResults={<NoResults thing={REWARDS_LIST.thing} onClear={clear} />}
          error={
            <ErrorState
              title={REWARDS_LIST.loadFailed}
              reason={load.state === 'error' ? load.reason : undefined}
              onRetry={loadRewards}
            />
          }
        />
      </Stack>
    </PageContainer>
  );
}
