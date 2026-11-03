import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { ActivityList } from '../components/ui/ActivityList';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { DetailList } from '../components/ui/DetailList';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { Heading } from '../components/ui/Heading';
import { ArrowDownToLine, Users } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Pagination } from '../components/ui/Pagination';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Skeleton } from '../components/ui/Skeleton';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { TxLink } from '../components/ui/TxLink';
import { useToast } from '../components/ui/Toast';
import type { Asset } from '../components/ui/types';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { formatAddress, formatDate } from '../copy/format';
import { STATUS, lifecycleStatus } from '../copy/status';
import { STREAMS_PAGE, STREAM_BATCHES, scheduleName } from '../copy/streams';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { authFetch, type WalletForAuth } from '../utils/auth';
import { getCachedTokenMeta } from '../utils/tokenMeta';

const PAGE_SIZE = 20;
const BCH: Asset = { kind: 'bch' };

type Scope = 'mine' | 'vaults';
type StatusFilter = 'all' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'mine', label: STREAM_BATCHES.scopes.mine },
  { value: 'vaults', label: STREAM_BATCHES.scopes.vaults },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: STREAM_BATCHES.filterAll },
  { value: 'PENDING', label: STATUS.notFunded.word },
  { value: 'ACTIVE', label: STATUS.active.word },
  { value: 'COMPLETED', label: STATUS.finished.word },
  { value: 'CANCELLED', label: STATUS.cancelled.word },
];

interface BatchRow {
  id: string;
  vault_id: string | null;
  sender: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  token_decimals?: number | null;
  stream_count: number;
  total_amount: number;
  status: string;
  tx_hash: string | null;
  active_streams: number;
  pending_streams: number;
  cancelled_streams: number;
  completed_streams: number;
  created_at: number;
}

interface BatchStream {
  id: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  token_decimals?: number | null;
  total_amount: number;
  status: string;
  stream_type: string;
  start_time?: number | null;
  cliff_timestamp?: number | null;
  schedule_count?: number | null;
}

interface BatchEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  tx_hash: string | null;
  created_at: number;
}

interface BatchPage {
  batches: BatchRow[];
  total: number;
}

interface BatchDetail {
  batch: BatchRow;
  streams: BatchStream[];
  events: BatchEvent[];
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const bare = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:/, '');
  return Boolean(a && b) && bare(a ?? '') === bare(b ?? '');
}

function assetOf(row: {
  token_type: string;
  token_category?: string | null;
  token_decimals?: number | null;
}): Asset {
  if (row.token_type === 'BCH' || !row.token_category) return BCH;
  const meta = getCachedTokenMeta(row.token_category);
  return {
    kind: 'token',
    tokenId: row.token_category,
    symbol: meta?.symbol,
    decimals: row.token_decimals ?? meta?.decimals ?? 0,
  };
}

function readScope(raw: string | null, fallback: Scope): Scope {
  return raw === 'mine' || raw === 'vaults' ? raw : fallback;
}

function readStatus(raw: string | null): StatusFilter {
  return FILTERS.some((filter) => filter.value === raw) ? (raw as StatusFilter) : 'all';
}

function readPage(raw: string | null): number {
  const page = Math.trunc(Number(raw));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function fetchBatches(
  wallet: WalletForAuth & { address: string },
  scope: Scope,
  status: StatusFilter,
  page: number
): Promise<BatchPage> {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (scope === 'mine') params.set('sender', wallet.address);
  else params.set('treasury', 'true');
  if (status !== 'all') params.set('status', status);
  const url = `/api/streams/batch-runs?${params.toString()}`;
  const response = scope === 'mine' ? await fetch(url) : await authFetch(url, { wallet });
  if (!response.ok) throw new Error(`Batch list request failed with ${response.status}`);
  const data: { batches?: BatchRow[]; total?: number } = await response.json();
  return { batches: data.batches ?? [], total: Number(data.total ?? 0) };
}

async function fetchBatch(id: string): Promise<BatchDetail> {
  const response = await fetch(`/api/streams/batch-runs/${id}`);
  if (!response.ok) throw new Error(`Batch request failed with ${response.status}`);
  const data: { batch?: BatchRow; streams?: BatchStream[]; events?: BatchEvent[] } =
    await response.json();
  if (!data.batch) throw new Error('Batch response had no batch');
  return { batch: data.batch, streams: data.streams ?? [], events: data.events ?? [] };
}

function batchStatus(row: BatchRow) {
  return lifecycleStatus(row.status);
}

function toActivity(event: BatchEvent, asset: Asset, address: string | null): ActivityEvent {
  return {
    id: event.id,
    kind: toEventKind(event.event_type),
    object: { kind: 'stream' },
    at: event.created_at,
    actor: event.actor
      ? { address: event.actor, isYou: sameAddress(event.actor, address) }
      : undefined,
    amount: event.amount !== null && event.amount > 0 ? { value: event.amount, asset } : undefined,
    txid: event.tx_hash ?? undefined,
  };
}

function MobileLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-small text-ink-muted md:hidden">{label}</span>
      {children}
    </span>
  );
}

function batchProgress(row: BatchRow): string {
  return STREAM_BATCHES.progress(row.stream_count, {
    active: row.active_streams,
    waiting: row.pending_streams,
    finished: row.completed_streams,
    cancelled: row.cancelled_streams,
  });
}

const COLUMNS: Column<BatchRow>[] = [
  {
    key: 'batch',
    header: STREAM_BATCHES.columns.batch,
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-title-item text-ink">
          {STREAM_BATCHES.batchName(row.stream_count)}
        </span>
        <span className="text-small text-ink-muted">
          {[batchProgress(row), row.vault_id ? STREAM_BATCHES.listedUnderVault : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    ),
  },
  {
    key: 'status',
    header: STREAM_BATCHES.columns.status,
    mobile: 'top',
    cell: (row) => {
      const status = batchStatus(row);
      return status ? <StatusPill status={status} size="sm" /> : null;
    },
  },
  {
    key: 'total',
    header: STREAM_BATCHES.columns.total,
    align: 'end',
    mobile: 'bottom-start',
    cell: (row) => (
      <MobileLabel label={STREAM_BATCHES.columns.total}>
        <Amount value={row.total_amount} asset={assetOf(row)} precision="list" />
      </MobileLabel>
    ),
  },
  {
    key: 'created',
    header: STREAM_BATCHES.columns.created,
    mobile: 'bottom-end',
    cell: (row) => (
      <MobileLabel label={STREAM_BATCHES.columns.created}>
        {formatDate(row.created_at, { dropSameYear: true }) ?? ''}
      </MobileLabel>
    ),
  },
];

const STREAM_COLUMNS: Column<BatchStream>[] = [
  {
    key: 'stream',
    header: STREAMS_PAGE.columns.stream,
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-title-item text-ink">
          {STREAM_BATCHES.drawer.streamTo(formatAddress(row.recipient))}
        </span>
        <span className="text-small text-ink-muted">{scheduleName(row)}</span>
      </span>
    ),
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
    cell: (row) => <Amount value={row.total_amount} asset={assetOf(row)} precision="list" />,
  },
];

function BatchDrawerBody({
  id,
  address,
  network,
}: {
  id: string;
  address: string | null;
  network: 'mainnet' | 'chipnet';
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let ignore = false;
    setDetail(null);
    setFailed(false);
    fetchBatch(id)
      .then((next) => {
        if (!ignore) setDetail(next);
      })
      .catch((error: unknown) => {
        console.error('Batch did not load', error);
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/streams/batch-runs/${id}/export`);
      if (!response.ok) throw new Error(`Batch export request failed with ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `batch-${id}.csv`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error('Batch export did not download', error);
      toast({ tone: 'danger', title: STREAM_BATCHES.drawer.downloadFailed });
    } finally {
      setDownloading(false);
    }
  };

  if (failed) {
    return (
      <ErrorState
        title={STREAM_BATCHES.drawer.error.title}
        reason={STREAM_BATCHES.drawer.error.reason}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton kind="text" lines={2} />
        <Skeleton kind="row" lines={4} />
      </div>
    );
  }

  const { batch, streams, events } = detail;
  const asset = assetOf(batch);
  const status = batchStatus(batch);
  const created = formatDate(batch.created_at);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Heading level="section">{STREAM_BATCHES.drawer.title(batch.stream_count)}</Heading>
          {status ? <StatusPill status={status} /> : null}
        </div>
        {created ? (
          <p className="text-small text-ink-muted">{STREAM_BATCHES.drawer.created(created)}</p>
        ) : null}
      </div>

      <DetailList
        items={[
          { label: STREAM_BATCHES.drawer.details.recipients, value: String(batch.stream_count) },
          {
            label: STREAM_BATCHES.drawer.details.total,
            value: <Amount value={batch.total_amount} asset={asset} />,
          },
          {
            label: STREAM_BATCHES.drawer.details.status,
            value: batchProgress(batch),
          },
          {
            label: STREAM_BATCHES.drawer.details.listedUnder,
            value: batch.vault_id ? (
              <ButtonLink variant="link" to={`/vaults/${batch.vault_id}`}>
                {STREAM_BATCHES.drawer.vault}
              </ButtonLink>
            ) : (
              STREAM_BATCHES.drawer.noVault
            ),
          },
          {
            label: STREAM_BATCHES.drawer.details.funding,
            value: batch.tx_hash ? (
              <TxLink txid={batch.tx_hash} network={network} />
            ) : (
              STREAM_BATCHES.drawer.notFunded
            ),
          },
        ]}
      />

      <div>
        {downloading ? (
          <Button
            variant="secondary"
            leadingIcon={ArrowDownToLine}
            busy
            busyLabel={STREAM_BATCHES.drawer.downloading}
          >
            {STREAM_BATCHES.drawer.download}
          </Button>
        ) : (
          <Button variant="secondary" leadingIcon={ArrowDownToLine} onClick={() => void download()}>
            {STREAM_BATCHES.drawer.download}
          </Button>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <Heading level="item" as="h3">
          {STREAM_BATCHES.drawer.recipientsHeading}
        </Heading>
        <List
          label={STREAM_BATCHES.drawer.recipientsLabel}
          columns={STREAM_COLUMNS}
          rows={streams}
          rowKey={(row) => row.id}
          rowHref={(row) => `/streams/${row.id}`}
          state={streams.length > 0 ? 'ready' : 'empty'}
          empty={
            <p className="p-4 text-small text-ink-secondary">{STREAM_BATCHES.drawer.noStreams}</p>
          }
          noResults={null}
          error={null}
        />
      </section>

      <section className="flex flex-col gap-3">
        <Heading level="item" as="h3">
          {STREAM_BATCHES.drawer.activityHeading}
        </Heading>
        <ActivityList
          events={events.slice(0, 8).map((event) => toActivity(event, asset, address))}
          state="ready"
          network={network}
        />
      </section>
    </div>
  );
}

export default function StreamBatchHistoryPage() {
  const wallet = useWallet();
  const address = wallet.address;
  const walletRef = useRef<WalletForAuth>(wallet);
  useEffect(() => {
    walletRef.current = wallet;
  });
  const network = useNetwork();
  const { pathname } = useLocation();
  const isOrganization = pathname.startsWith('/app/dao');
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = readScope(searchParams.get('scope'), isOrganization ? 'vaults' : 'mine');
  const status = readStatus(searchParams.get('status'));
  const page = readPage(searchParams.get('page'));
  const [data, setData] = useState<BatchPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return undefined;
    let ignore = false;
    setData(null);
    setFailed(false);
    fetchBatches({ ...walletRef.current, address }, scope, status, page)
      .then((next) => {
        if (!ignore) setData(next);
      })
      .catch((error: unknown) => {
        console.error('Batches did not load', error);
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [address, scope, status, page, reloadKey]);

  const updateQuery = (next: { scope?: Scope; status?: StatusFilter; page?: number }) => {
    const params = new URLSearchParams(searchParams);
    const merged = { scope, status, page: 1, ...next };
    params.set('scope', merged.scope);
    if (merged.status === 'all') params.delete('status');
    else params.set('status', merged.status);
    if (merged.page <= 1) params.delete('page');
    else params.set('page', String(merged.page));
    setSearchParams(params, { replace: true });
  };

  const batches = data?.batches ?? [];
  const bchBatches = batches.filter((row) => row.token_type === 'BCH');
  const tokenCount = batches.length - bchBatches.length;
  const recipients = batches.reduce((sum, row) => sum + Number(row.stream_count || 0), 0);
  const totalBch = bchBatches.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);

  const state: ListState = failed
    ? 'error'
    : data === null
      ? 'loading'
      : batches.length > 0
        ? 'ready'
        : status === 'all'
          ? 'empty'
          : 'no-results';
  const tileState = data === null ? 'loading' : 'ready';
  const showStats = state === 'ready' || (state === 'loading' && status === 'all');

  const createButton = (
    <ButtonLink variant="primary" leadingIcon={Users} to="/streams/batch-create">
      {STREAM_BATCHES.createBatch}
    </ButtonLink>
  );
  const empty = STREAM_BATCHES.empty[scope];

  return (
    <PageContainer>
      <PageHeader
        title={STREAMS_PAGE.title}
        documentTitle={STREAM_BATCHES.documentTitle}
        description={STREAM_BATCHES.description}
        badge={isOrganization ? 'beta' : undefined}
        primaryAction={createButton}
        tabs={{
          label: STREAMS_PAGE.tabsLabel,
          activeKey: 'batches',
          items: [
            {
              key: 'all',
              label: STREAMS_PAGE.tabs.all,
              to: isOrganization ? '/app/dao/streams' : '/streams',
            },
            { key: 'batches', label: STREAMS_PAGE.tabs.batches, to: pathname },
          ],
        }}
      />
      <Stack>
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <SegmentedControl
            label={STREAM_BATCHES.scopeLabel}
            options={SCOPES}
            value={scope}
            onChange={(next) => updateQuery({ scope: next })}
          />
          <FilterChips
            label={STREAM_BATCHES.filterLabel}
            options={FILTERS}
            selected={[status]}
            onChange={(next) => updateQuery({ status: next[0] ?? 'all' })}
          />
        </div>
        {scope === 'vaults' ? (
          <p className="text-small text-ink-secondary">{STREAM_BATCHES.vaultsLine}</p>
        ) : null}

        {showStats ? (
          <StatRow>
            <StatTile
              label={STREAM_BATCHES.stats.batches}
              value={data?.total ?? 0}
              state={tileState}
            />
            <StatTile
              label={STREAM_BATCHES.stats.recipients}
              value={recipients}
              state={tileState}
              pageOnly
            />
            {data === null || bchBatches.length > 0 ? (
              <StatTile
                label={STREAM_BATCHES.stats.total}
                value={<Amount value={totalBch} asset={BCH} size="lg" precision="list" />}
                sub={tokenCount > 0 ? STREAM_BATCHES.tokenNote(tokenCount) : undefined}
                state={tileState}
                pageOnly
              />
            ) : null}
          </StatRow>
        ) : null}

        <List
          label={STREAM_BATCHES.listLabel}
          columns={COLUMNS}
          rows={batches}
          rowKey={(row) => row.id}
          onRowOpen={(row) => setOpenId(row.id)}
          state={state}
          empty={
            <EmptyState
              icon={Users}
              title={empty.title}
              description={empty.description}
              action={scope === 'mine' ? createButton : undefined}
              learnMore={STREAM_BATCHES.empty.help}
            />
          }
          noResults={
            <NoResults
              thing={STREAM_BATCHES.noResultsThing}
              onClear={() => updateQuery({ status: 'all' })}
            />
          }
          error={
            <ErrorState
              title={STREAM_BATCHES.error.title}
              reason={STREAM_BATCHES.error.reason}
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

        {isOrganization ? null : (
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <ButtonLink variant="link" to="/explorer?scope=personal&type=stream">
              {STREAMS_PAGE.links.activity}
            </ButtonLink>
          </div>
        )}
      </Stack>

      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        side="right"
        label={STREAM_BATCHES.drawer.label}
      >
        {openId ? (
          <div className="px-4 pb-6 sm:px-6">
            <BatchDrawerBody id={openId} address={address} network={network} />
          </div>
        ) : null}
      </Drawer>
    </PageContainer>
  );
}
