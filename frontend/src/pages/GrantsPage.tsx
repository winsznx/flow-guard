import { useEffect, useMemo, useState } from 'react';
import { PageContainer } from '../components/layout/PageContainer';
import { ListToolbar } from '../components/layout/ListToolbar';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { Milestone, Plus } from '../components/ui/Icon';
import { List, type Column } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Notice } from '../components/ui/Notice';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { useWallet } from '../hooks/useWallet';
import { fetchGrants, fetchReceivedGrants, type GrantRow } from '../services/grantApi';
import { ACTIONS, showFinished } from '../copy/common';
import { formatAmount } from '../copy/format';
import {
  GRANTS_PAGE,
  grantAsset,
  grantTo,
  listMeta,
  listStateLine,
  milestonesPaid,
  notFundedSub,
  tokenGrantsLeftOut,
  type GrantRole,
  type GrantSegment,
} from '../copy/grants';
import { STATUS, lifecycleStatus, type StatusKey } from '../copy/status';

type GrantStatusKey = Extract<StatusKey, 'notFunded' | 'active' | 'paused' | 'finished' | 'cancelled'>;

type ListedGrant = GrantRow & { role: GrantRole; statusKey: GrantStatusKey };

/** Each list loads on its own. Null means that list failed. */
type LoadState = { kind: 'loading' } | { kind: 'settled'; sent: GrantRow[] | null; received: GrantRow[] | null };

type Loaded = { sent: GrantRow[]; received: GrantRow[] };

const STATUS_ORDER: readonly GrantStatusKey[] = ['notFunded', 'active', 'paused', 'finished', 'cancelled'];
const CLOSED: ReadonlySet<GrantStatusKey> = new Set(['finished', 'cancelled']);
const LOCKED: ReadonlySet<GrantStatusKey> = new Set(['active', 'paused']);
const SATS_PER_BCH = 100_000_000;

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function toStatusKey(raw: string): GrantStatusKey {
  const key = lifecycleStatus(raw);
  return key && (STATUS_ORDER as readonly StatusKey[]).includes(key) ? (key as GrantStatusKey) : 'notFunded';
}

function toSats(value: number | null | undefined): bigint {
  const n = Number(value);
  return Number.isFinite(n) ? BigInt(Math.round(n * SATS_PER_BCH)) : 0n;
}

function remainingSats(grant: GrantRow): bigint {
  const left = Math.max(0, Number(grant.milestones_total) - Number(grant.milestones_completed));
  return toSats(grant.amount_per_milestone) * BigInt(left);
}

function withRole(grant: GrantRow, me: string): ListedGrant {
  return {
    ...grant,
    role: sameAddress(grant.creator, me) ? 'sender' : 'recipient',
    statusKey: toStatusKey(grant.status),
  };
}

function segmentFailed(state: LoadState, segment: GrantSegment): boolean {
  if (state.kind !== 'settled') return false;
  if (segment === 'sending') return state.sent === null;
  if (segment === 'receiving') return state.received === null;
  return state.sent === null && state.received === null;
}

function scopeGrants(state: Loaded, segment: GrantSegment, me: string): ListedGrant[] {
  if (segment === 'sending') return state.sent.map((grant) => withRole(grant, me));
  if (segment === 'receiving') {
    return state.received.map((grant) => ({ ...withRole(grant, me), role: 'recipient' as const }));
  }
  const byId = new Map<string, GrantRow>();
  for (const grant of [...state.sent, ...state.received]) byId.set(grant.id, grant);
  return [...byId.values()].sort((a, b) => b.created_at - a.created_at).map((grant) => withRole(grant, me));
}

function matchesSearch(grant: ListedGrant, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [grant.title, grant.description ?? '', grant.grant_number, grant.creator, grant.recipient]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

const COLUMNS: Column<ListedGrant>[] = [
  {
    key: 'name',
    header: GRANTS_PAGE.columns.name,
    primary: true,
    cell: (grant) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="break-words">{grant.title?.trim() || grantTo(grant.recipient)}</span>
        <span className="text-small text-ink-muted">
          {listMeta(grant.role, grant.role === 'recipient' ? grant.creator : grant.recipient)}
        </span>
      </span>
    ),
  },
  {
    key: 'status',
    header: GRANTS_PAGE.columns.status,
    mobile: 'top',
    cell: (grant) => <StatusPill status={grant.statusKey} size="sm" />,
  },
  {
    key: 'amount',
    header: GRANTS_PAGE.columns.amount,
    align: 'end',
    mobile: 'bottom-start',
    cell: (grant) => <Amount value={grant.total_amount} asset={grantAsset(grant)} precision="list" />,
  },
  {
    key: 'progress',
    header: GRANTS_PAGE.columns.progress,
    mobile: 'bottom-end',
    cell: (grant) => milestonesPaid(grant.milestones_completed, grant.milestones_total),
  },
];

type TileSums = { promised: bigint; released: bigint; stillToCome: bigint; notFunded: bigint };

/** Still to come counts only money locked in a contract. Grants not funded yet are summed apart. */
function sumTiles(grants: ListedGrant[]): TileSums {
  const sums: TileSums = { promised: 0n, released: 0n, stillToCome: 0n, notFunded: 0n };
  for (const grant of grants) {
    if (grant.statusKey !== 'cancelled') sums.promised += toSats(grant.total_amount);
    sums.released += toSats(grant.total_released);
    if (LOCKED.has(grant.statusKey)) sums.stillToCome += remainingSats(grant);
    if (grant.statusKey === 'notFunded') sums.notFunded += remainingSats(grant);
  }
  return sums;
}

function BchAmount({ value }: { value: bigint }) {
  return <Amount value={value} asset={{ kind: 'bch' }} precision="list" size="lg" />;
}

function GrantStats({ grants, segment }: { grants: ListedGrant[]; segment: GrantSegment }) {
  const bchGrants = grants.filter((grant) => grantAsset(grant).kind === 'bch');
  const tokenCount = grants.length - bchGrants.length;
  const note = tokenCount > 0 ? tokenGrantsLeftOut(tokenCount) : undefined;
  const tiles = GRANTS_PAGE.tiles;
  const active = <StatTile label={tiles.active} value={grants.filter((grant) => grant.statusKey === 'active').length} />;

  if (segment === 'all') {
    const sending = sumTiles(bchGrants.filter((grant) => grant.role === 'sender'));
    const receiving = sumTiles(bchGrants.filter((grant) => grant.role === 'recipient'));
    return (
      <StatRow>
        {active}
        <StatTile
          label={tiles.notFunded}
          value={grants.filter((grant) => grant.statusKey === 'notFunded').length}
          sub={sending.notFunded > 0n ? notFundedSub(formatAmount(sending.notFunded, { kind: 'bch' }, { precision: 'list' })) : undefined}
        />
        <StatTile label={tiles.stillToPay} value={<BchAmount value={sending.stillToCome} />} sub={note} />
        <StatTile label={tiles.stillToReceive} value={<BchAmount value={receiving.stillToCome} />} />
      </StatRow>
    );
  }

  const sums = sumTiles(bchGrants);
  const receiving = segment === 'receiving';
  return (
    <StatRow>
      {active}
      <StatTile label={receiving ? tiles.promisedToYou : tiles.promised} value={<BchAmount value={sums.promised} />} sub={note} />
      <StatTile label={receiving ? tiles.paidToYou : tiles.released} value={<BchAmount value={sums.released} />} />
      <StatTile label={receiving ? tiles.stillToReceive : tiles.stillToCome} value={<BchAmount value={sums.stillToCome} />} />
    </StatRow>
  );
}

export default function GrantsPage() {
  const wallet = useWallet();
  const me = wallet.address ?? '';
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [segment, setSegment] = useState<GrantSegment>('all');
  const [statusFilter, setStatusFilter] = useState<GrantStatusKey[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!me) return undefined;
    let ignore = false;
    setLoad({ kind: 'loading' });
    void Promise.allSettled([fetchGrants(me), fetchReceivedGrants(me)]).then(([sent, received]) => {
      if (ignore) return;
      if (sent.status === 'rejected') console.error('Sent grants did not load', sent.reason);
      if (received.status === 'rejected') console.error('Received grants did not load', received.reason);
      setLoad({
        kind: 'settled',
        sent: sent.status === 'fulfilled' ? sent.value.grants : null,
        received: received.status === 'fulfilled' ? received.value.grants : null,
      });
    });
    return () => {
      ignore = true;
    };
  }, [me, attempt]);

  const failed = segmentFailed(load, segment);
  const ready = load.kind === 'settled' && !failed;
  const scoped = useMemo(
    () => (load.kind === 'settled' ? scopeGrants({ sent: load.sent ?? [], received: load.received ?? [] }, segment, me) : []),
    [load, segment, me],
  );
  const partlyLoaded =
    segment === 'all' && ready && load.kind === 'settled'
      ? load.sent === null
        ? GRANTS_PAGE.partlyLoaded.sent
        : load.received === null
          ? GRANTS_PAGE.partlyLoaded.received
          : null
      : null;
  const searched = useMemo(() => scoped.filter((grant) => matchesSearch(grant, query)), [scoped, query]);
  const filtering = statusFilter.length > 0;
  const shown = filtering ? searched.filter((grant) => statusFilter.includes(grant.statusKey)) : searched;
  const openRows = filtering ? shown : shown.filter((grant) => !CLOSED.has(grant.statusKey));
  const closedRows = filtering ? [] : shown.filter((grant) => CLOSED.has(grant.statusKey));

  const statusOptions = STATUS_ORDER.map((key) => ({
    value: key,
    label: STATUS[key].word,
  }));

  const clearFilters = () => {
    setStatusFilter([]);
    setQuery('');
  };

  const listState =
    load.kind === 'loading'
      ? 'loading'
      : failed
        ? 'error'
        : scoped.length === 0
          ? 'empty'
          : shown.length === 0
            ? 'no-results'
            : 'ready';

  const empty = GRANTS_PAGE.empty[segment];
  const createAction = (
    <ButtonLink variant="primary" to="/grants/create" leadingIcon={Plus}>
      {GRANTS_PAGE.create}
    </ButtonLink>
  );

  const stateLine =
    ready && scoped.length > 0
      ? listStateLine(
          scoped.filter((grant) => grant.statusKey === 'active').length,
          scoped.filter((grant) => grant.statusKey === 'notFunded').length,
        )
      : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={GRANTS_PAGE.title}
        description={GRANTS_PAGE.description}
        stateLine={stateLine}
        primaryAction={createAction}
      />
      <Stack>
        {partlyLoaded ? (
          <Notice
            tone="warning"
            title={GRANTS_PAGE.partlyLoaded.title}
            action={
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {ACTIONS.tryAgain}
              </Button>
            }
          >
            {partlyLoaded}
          </Notice>
        ) : null}
        <ListToolbar
          segments={
            <SegmentedControl label={GRANTS_PAGE.segmentLabel} options={GRANTS_PAGE.segments} value={segment} onChange={setSegment} />
          }
          search={
            <SearchInput
              label={GRANTS_PAGE.searchLabel}
              placeholder={GRANTS_PAGE.searchPlaceholder}
              value={query}
              onChange={setQuery}
              className="w-full"
            />
          }
          chips={
            ready && scoped.length > 0 ? (
              <FilterChips
                label={GRANTS_PAGE.statusLabel}
                options={statusOptions}
                selected={statusFilter}
                onChange={setStatusFilter}
                showAll
              />
            ) : null
          }
          stats={ready && scoped.length > 0 ? <GrantStats grants={scoped} segment={segment} /> : null}
        />
        <List
          label={GRANTS_PAGE.listLabel}
          columns={COLUMNS}
          rows={openRows}
          rowKey={(grant) => grant.id}
          rowHref={(grant) => `/grants/${grant.id}`}
          collapsed={closedRows.length > 0 ? { label: showFinished(closedRows.length), rows: closedRows } : undefined}
          state={listState}
          empty={
            <EmptyState
              icon={Milestone}
              title={empty.title}
              description={empty.description}
              action={segment === 'receiving' ? undefined : createAction}
              learnMore={segment === 'receiving' ? undefined : GRANTS_PAGE.howItWorks}
              example={'example' in empty ? empty.example : undefined}
            />
          }
          noResults={<NoResults thing={GRANTS_PAGE.things} onClear={clearFilters} />}
          error={
            <ErrorState
              title={GRANTS_PAGE.loadFailed}
              reason={GRANTS_PAGE.loadFailedReason}
              onRetry={() => setAttempt((n) => n + 1)}
            />
          }
        />
      </Stack>
    </PageContainer>
  );
}
