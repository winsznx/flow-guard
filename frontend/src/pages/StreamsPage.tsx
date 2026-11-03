import { useCallback, useEffect, useState, type ReactNode } from 'react';
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
import { Plus, Users, Waves } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Pagination } from '../components/ui/Pagination';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import type { Asset } from '../components/ui/types';
import { formatAddress, formatDate, formatRelative } from '../copy/format';
import { STATUS, lifecycleStatus } from '../copy/status';
import { STREAMS_PAGE, scheduleName } from '../copy/streams';
import { useWallet } from '../hooks/useWallet';
import { getCachedTokenMeta } from '../utils/tokenMeta';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 250;
const BCH: Asset = { kind: 'bch' };

type RoleView = 'all' | 'receiving' | 'sending';
type StatusFilter = 'all' | 'PENDING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

const VIEWS: { value: RoleView; label: string }[] = [
  { value: 'all', label: STREAMS_PAGE.views.all },
  { value: 'receiving', label: STREAMS_PAGE.views.receiving },
  { value: 'sending', label: STREAMS_PAGE.views.sending },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: STREAMS_PAGE.filterAll },
  { value: 'PENDING', label: STATUS.notFunded.word },
  { value: 'ACTIVE', label: STATUS.active.word },
  { value: 'PAUSED', label: STATUS.paused.word },
  { value: 'COMPLETED', label: STATUS.finished.word },
  { value: 'CANCELLED', label: STATUS.cancelled.word },
];

interface StreamRow {
  id: string;
  vault_id?: string | null;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  token_decimals?: number | null;
  total_amount: number;
  withdrawn_amount: number;
  claimable_amount: number;
  stream_type: string;
  start_time?: number | null;
  cliff_timestamp?: number | null;
  schedule_count?: number | null;
  status: string;
  description?: string | null;
  latest_event?: { event_type: string; created_at: number } | null;
}

interface StreamPage {
  streams: StreamRow[];
  total: number;
}

function readView(raw: string | null): RoleView {
  return VIEWS.some((view) => view.value === raw) ? (raw as RoleView) : 'all';
}

function readStatus(raw: string | null): StatusFilter {
  return FILTERS.some((filter) => filter.value === raw) ? (raw as StatusFilter) : 'all';
}

function readPage(raw: string | null): number {
  const page = Math.trunc(Number(raw));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const bare = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:/, '');
  return Boolean(a && b) && bare(a ?? '') === bare(b ?? '');
}

function streamAsset(stream: StreamRow): Asset {
  if (stream.token_type === 'BCH' || !stream.token_category) return BCH;
  const meta = getCachedTokenMeta(stream.token_category);
  return {
    kind: 'token',
    tokenId: stream.token_category,
    symbol: meta?.symbol,
    decimals: stream.token_decimals ?? meta?.decimals ?? 0,
  };
}

async function fetchStreams(
  address: string,
  view: RoleView,
  status: StatusFilter,
  page: number,
  query: string
): Promise<StreamPage> {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (view === 'receiving') params.set('recipient', address);
  else if (view === 'sending') params.set('sender', address);
  else params.set('address', address);
  if (status !== 'all') params.set('status', status);
  if (query) params.set('q', query);
  const response = await fetch(`/api/streams?${params.toString()}`);
  if (!response.ok) throw new Error(`Streams request failed with ${response.status}`);
  const data: { streams?: StreamRow[]; total?: number } = await response.json();
  return { streams: data.streams ?? [], total: Number(data.total ?? 0) };
}

function lastActivity(stream: StreamRow, now: number): string {
  const eventAt = stream.latest_event ? stream.latest_event.created_at * 1000 : null;
  const startsAt = stream.start_time ? stream.start_time * 1000 : null;
  if (eventAt !== null && eventAt <= now)
    return formatRelative(eventAt, now) ?? STREAMS_PAGE.noActivity;
  if (startsAt !== null && startsAt > now) {
    const date = formatDate(startsAt, { dropSameYear: true, now });
    if (date) return STREAMS_PAGE.starts(date);
  }
  return STREAMS_PAGE.noActivity;
}

function MobileLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-small text-ink-muted md:hidden">{label}</span>
      {children}
    </span>
  );
}

function sumBch(rows: StreamRow[], pick: (row: StreamRow) => number): number {
  return rows.reduce((sum, row) => sum + Number(pick(row) || 0), 0);
}

function buildColumns(address: string | null): Column<StreamRow>[] {
  return [
    {
      key: 'stream',
      header: STREAMS_PAGE.columns.stream,
      primary: true,
      cell: (row) => {
        const incoming = sameAddress(row.recipient, address);
        const fallback = incoming
          ? STREAMS_PAGE.streamFrom(formatAddress(row.sender))
          : STREAMS_PAGE.streamTo(formatAddress(row.recipient));
        const meta = [scheduleName(row), row.vault_id ? STREAMS_PAGE.listedUnderVault : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="break-words text-title-item text-ink">
              {row.description?.trim() || fallback}
            </span>
            <span className="text-small text-ink-muted">{meta}</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: STREAMS_PAGE.columns.status,
      mobile: 'top',
      cell: (row) => {
        const status = lifecycleStatus(row.status, {
          startsAt: row.start_time ? row.start_time * 1000 : null,
        });
        return status ? <StatusPill status={status} size="sm" /> : null;
      },
    },
    {
      key: 'total',
      header: STREAMS_PAGE.columns.total,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => (
        <MobileLabel label={STREAMS_PAGE.columns.total}>
          <Amount value={row.total_amount} asset={streamAsset(row)} precision="list" />
        </MobileLabel>
      ),
    },
    {
      key: 'ready',
      header: STREAMS_PAGE.columns.ready,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) => (
        <MobileLabel label={STREAMS_PAGE.columns.ready}>
          <Amount value={row.claimable_amount} asset={streamAsset(row)} precision="list" />
        </MobileLabel>
      ),
    },
    {
      key: 'last',
      header: STREAMS_PAGE.columns.last,
      mobile: 'hidden',
      cell: (row) => lastActivity(row, Date.now()),
    },
  ];
}

export default function StreamsPage() {
  const wallet = useWallet();
  const address = wallet.address;
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams.get('view'));
  const status = readStatus(searchParams.get('status'));
  const page = readPage(searchParams.get('page'));
  const query = searchParams.get('q') ?? '';
  const trimmedQuery = query.trim();
  const [data, setData] = useState<StreamPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!address) return undefined;
    let ignore = false;
    setData(null);
    setFailed(false);
    const timer = window.setTimeout(
      () => {
        fetchStreams(address, view, status, page, trimmedQuery)
          .then((next) => {
            if (!ignore) setData(next);
          })
          .catch((error: unknown) => {
            console.error('Streams did not load', error);
            if (!ignore) setFailed(true);
          });
      },
      trimmedQuery ? SEARCH_DELAY_MS : 0
    );
    return () => {
      ignore = true;
      window.clearTimeout(timer);
    };
  }, [address, view, status, page, trimmedQuery, reloadKey]);

  const updateQuery = useCallback(
    (next: { view?: RoleView; status?: StatusFilter; page?: number; q?: string }) => {
      const params = new URLSearchParams(searchParams);
      const merged = { view, status, q: query, page: 1, ...next };
      if (merged.view === 'all') params.delete('view');
      else params.set('view', merged.view);
      if (merged.status === 'all') params.delete('status');
      else params.set('status', merged.status);
      if (merged.q === '') params.delete('q');
      else params.set('q', merged.q);
      if (merged.page <= 1) params.delete('page');
      else params.set('page', String(merged.page));
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams, view, status, query]
  );

  const streams = data?.streams ?? [];
  const bchStreams = streams.filter((row) => row.token_type === 'BCH');
  const tokenCount = streams.length - bchStreams.length;
  const incomingBch = bchStreams.filter((row) => sameAddress(row.recipient, address));
  const readyRows = view === 'sending' ? bchStreams : incomingBch;
  const readyBch = sumBch(readyRows, (row) => row.claimable_amount);
  const totalBch = sumBch(bchStreams, (row) => row.total_amount);
  const claimedBch = sumBch(bchStreams, (row) => row.withdrawn_amount);
  const onlyIncoming =
    view === 'all' && streams.some((row) => !sameAddress(row.recipient, address));
  const readyNote =
    tokenCount > 0
      ? onlyIncoming
        ? STREAMS_PAGE.readyNotes(tokenCount)
        : STREAMS_PAGE.tokenNote(tokenCount)
      : onlyIncoming
        ? STREAMS_PAGE.readyNote
        : undefined;

  const state: ListState = failed
    ? 'error'
    : data === null
      ? 'loading'
      : streams.length > 0
        ? 'ready'
        : status === 'all' && trimmedQuery === ''
          ? 'empty'
          : 'no-results';
  const tileState = data === null ? 'loading' : 'ready';
  const showStats =
    state === 'ready' || (state === 'loading' && status === 'all' && trimmedQuery === '');
  const showBchTiles = data === null || bchStreams.length > 0;

  const createButton = (
    <ButtonLink variant="primary" leadingIcon={Plus} to="/streams/create">
      {STREAMS_PAGE.create}
    </ButtonLink>
  );

  const empty = STREAMS_PAGE.empty[view];

  return (
    <PageContainer>
      <PageHeader
        title={STREAMS_PAGE.title}
        description={STREAMS_PAGE.description}
        primaryAction={createButton}
        secondaryActions={[
          <ButtonLink
            key="pay-many"
            variant="secondary"
            leadingIcon={Users}
            to="/streams/batch-create"
          >
            {STREAMS_PAGE.payMany}
          </ButtonLink>,
        ]}
        tabs={{
          label: STREAMS_PAGE.tabsLabel,
          activeKey: 'all',
          items: [
            { key: 'all', label: STREAMS_PAGE.tabs.all, to: '/streams' },
            { key: 'batches', label: STREAMS_PAGE.tabs.batches, to: '/streams/batches' },
          ],
        }}
      />
      <Stack>
        <ListToolbar
          segments={
            <SegmentedControl
              label={STREAMS_PAGE.viewLabel}
              options={VIEWS}
              value={view}
              onChange={(next) => updateQuery({ view: next })}
            />
          }
          search={
            <SearchInput
              label={STREAMS_PAGE.searchLabel}
              placeholder={STREAMS_PAGE.searchPlaceholder}
              value={query}
              onChange={(next) => updateQuery({ q: next })}
              className="w-full"
            />
          }
          chips={
            <FilterChips
              label={STREAMS_PAGE.filterLabel}
              options={FILTERS}
              selected={[status]}
              onChange={(next) => updateQuery({ status: next[0] ?? 'all' })}
            />
          }
          stats={
            showStats ? (
              <StatRow>
                <StatTile
                  label={STREAMS_PAGE.stats.streams}
                  value={data?.total ?? 0}
                  state={tileState}
                />
                {showBchTiles ? (
                  <>
                    <StatTile
                      label={
                        view === 'sending'
                          ? STREAMS_PAGE.stats.recipientsCanClaim
                          : STREAMS_PAGE.stats.ready
                      }
                      value={<Amount value={readyBch} asset={BCH} size="lg" precision="list" />}
                      sub={readyNote}
                      state={tileState}
                      pageOnly
                    />
                    <StatTile
                      label={STREAMS_PAGE.stats.total}
                      value={<Amount value={totalBch} asset={BCH} size="lg" precision="list" />}
                      state={tileState}
                      pageOnly
                    />
                    <StatTile
                      label={STREAMS_PAGE.stats.claimed}
                      value={<Amount value={claimedBch} asset={BCH} size="lg" precision="list" />}
                      state={tileState}
                      pageOnly
                    />
                  </>
                ) : null}
              </StatRow>
            ) : null
          }
        />

        <List
          label={STREAMS_PAGE.listLabel}
          columns={buildColumns(address)}
          rows={streams}
          rowKey={(row) => row.id}
          rowHref={(row) => `/streams/${row.id}`}
          state={state}
          empty={
            <EmptyState
              icon={Waves}
              title={empty.title}
              description={empty.description}
              action={view === 'receiving' ? undefined : createButton}
              example={view === 'receiving' ? undefined : STREAMS_PAGE.empty.example}
              learnMore={STREAMS_PAGE.empty.help}
            />
          }
          noResults={
            <NoResults
              thing={STREAMS_PAGE.noResultsThing}
              onClear={() => updateQuery({ status: 'all', q: '' })}
            />
          }
          error={
            <ErrorState
              title={STREAMS_PAGE.error.title}
              reason={STREAMS_PAGE.error.reason}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          }
        />

        {data && data.total > PAGE_SIZE ? (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={data.total}
            onPage={(next) => updateQuery({ page: next })}
          />
        ) : null}

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <ButtonLink variant="link" standalone to="/streams/shapes">
            {STREAMS_PAGE.links.examples}
          </ButtonLink>
          <ButtonLink variant="link" standalone to="/explorer?scope=personal&type=stream">
            {STREAMS_PAGE.links.activity}
          </ButtonLink>
        </div>
      </Stack>
    </PageContainer>
  );
}
