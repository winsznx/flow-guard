import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Stack } from '../../components/layout/Stack';
import { OrganizationHeader } from '../../components/dao/DaoSectionNav';
import { Amount } from '../../components/ui/Amount';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { FilterChips } from '../../components/ui/FilterChips';
import { Plus, Users, Waves } from '../../components/ui/Icon';
import { List, type Column, type ListState } from '../../components/ui/List';
import { NoResults } from '../../components/ui/NoResults';
import { Pagination } from '../../components/ui/Pagination';
import { StatRow } from '../../components/ui/StatRow';
import { StatTile } from '../../components/ui/StatTile';
import { StatusPill } from '../../components/ui/StatusPill';
import type { Asset } from '../../components/ui/types';
import { formatAddress, formatDate, formatRelative } from '../../copy/format';
import { STREAM_SCHEDULE_WORD, VAULT_STREAMS } from '../../copy/organization';
import { STATUS, lifecycleStatus } from '../../copy/status';
import { useWallet } from '../../hooks/useWallet';
import { authFetch, type WalletForAuth } from '../../utils/auth';
import { getCachedTokenMeta } from '../../utils/tokenMeta';
import { buildDaoBatchStreamState, buildDaoSingleStreamState } from '../../utils/daoStreamLaunch';

const PAGE_SIZE = 16;
const BCH: Asset = { kind: 'bch' };

type StatusFilter = 'all' | 'ACTIVE' | 'PENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: VAULT_STREAMS.filterAll },
  { value: 'ACTIVE', label: STATUS.active.word },
  { value: 'PENDING', label: STATUS.notFunded.word },
  { value: 'PAUSED', label: STATUS.paused.word },
  { value: 'COMPLETED', label: STATUS.finished.word },
  { value: 'CANCELLED', label: STATUS.cancelled.word },
];

interface VaultStream {
  id: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  token_decimals?: number | null;
  total_amount: number;
  claimable_amount: number;
  stream_type: string;
  status: string;
  start_time?: number | null;
  latest_event?: { event_type: string; created_at: number } | null;
}

interface StreamPage {
  streams: VaultStream[];
  total: number;
}

function streamAsset(stream: VaultStream): Asset {
  if (stream.token_type === 'BCH' || !stream.token_category) return BCH;
  const meta = getCachedTokenMeta(stream.token_category);
  return {
    kind: 'token',
    tokenId: stream.token_category,
    symbol: meta?.symbol,
    decimals: meta?.decimals ?? stream.token_decimals ?? 0,
  };
}

function StreamAmount({ stream, value }: { stream: VaultStream; value: number }) {
  return <Amount value={value} asset={streamAsset(stream)} precision="list" />;
}

async function fetchVaultStreams(
  wallet: WalletForAuth,
  page: number,
  status: StatusFilter,
  signal: AbortSignal
): Promise<StreamPage> {
  const params = new URLSearchParams({
    treasury: 'true',
    page: String(page),
    limit: String(PAGE_SIZE),
  });
  if (status !== 'all') params.set('status', status);
  const response = await authFetch(`/api/streams?${params.toString()}`, { wallet, signal });
  if (!response.ok) throw new Error(`Vault streams request failed with ${response.status}`);
  const data: { streams?: VaultStream[]; total?: number } = await response.json();
  return { streams: data.streams ?? [], total: Number(data.total ?? 0) };
}

function lastActivity(stream: VaultStream, now: number): string {
  const startsAt = stream.start_time ? stream.start_time * 1000 : null;
  const eventAt = stream.latest_event ? stream.latest_event.created_at * 1000 : null;
  if (eventAt !== null && eventAt <= now)
    return formatRelative(eventAt, now) ?? VAULT_STREAMS.noActivity;
  if (startsAt !== null && startsAt > now) {
    const date = formatDate(startsAt, { dropSameYear: true, now });
    if (date) return VAULT_STREAMS.starts(date);
  }
  return VAULT_STREAMS.noActivity;
}

const COLUMNS: Column<VaultStream>[] = [
  {
    key: 'stream',
    header: VAULT_STREAMS.columns.stream,
    primary: true,
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-title-item text-ink">
          {VAULT_STREAMS.streamTo(formatAddress(row.recipient))}
        </span>
        <span className="text-small text-ink-muted">
          {STREAM_SCHEDULE_WORD[row.stream_type.toUpperCase()] ?? VAULT_STREAMS.otherSchedule}
        </span>
      </div>
    ),
  },
  {
    key: 'status',
    header: VAULT_STREAMS.columns.status,
    mobile: 'top',
    cell: (row) => {
      const status = lifecycleStatus(row.status, {
        startsAt: row.start_time ? row.start_time * 1000 : null,
      });
      return status ? <StatusPill status={status} /> : null;
    },
  },
  {
    key: 'total',
    header: VAULT_STREAMS.columns.total,
    align: 'end',
    mobile: 'bottom-start',
    mobileLabel: VAULT_STREAMS.columns.total,
    cell: (row) => <StreamAmount stream={row} value={row.total_amount} />,
  },
  {
    key: 'ready',
    header: VAULT_STREAMS.columns.ready,
    align: 'end',
    mobile: 'bottom-end',
    mobileLabel: VAULT_STREAMS.columns.ready,
    cell: (row) => <StreamAmount stream={row} value={row.claimable_amount} />,
  },
  {
    key: 'last',
    header: VAULT_STREAMS.columns.last,
    mobile: 'hidden',
    cell: (row) => lastActivity(row, Date.now()),
  },
];

interface LoadResult {
  request: string;
  data: StreamPage | null;
}

/** Keyed on the wallet, so a switch starts again from page one with nothing from the last wallet. */
export function DaoStreamsPage() {
  const viewer = useWallet().address;
  return <VaultStreams key={viewer ?? ''} viewer={viewer} />;
}

function VaultStreams({ viewer }: { viewer: string | null }) {
  const navigate = useNavigate();
  const wallet = useWallet();
  const walletRef = useRef<WalletForAuth>(wallet);
  useEffect(() => {
    walletRef.current = wallet;
  });
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const request = `${page}|${status}|${attempt}`;

  useEffect(() => {
    if (!viewer) return;
    const controller = new AbortController();
    fetchVaultStreams(walletRef.current, page, status, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) setResult({ request, data: loaded });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        console.error('Vault streams did not load', error);
        setResult({ request, data: null });
      }
    );
    return () => controller.abort();
  }, [viewer, page, status, request]);

  const current = result?.request === request ? result : null;
  const data = current?.data ?? null;
  const failed = current !== null && current.data === null;

  const changeStatus = (next: StatusFilter[]) => {
    setStatus(next[0] ?? 'all');
    setPage(1);
  };

  const streams = data?.streams ?? [];
  const bchStreams = streams.filter((stream) => stream.token_type === 'BCH');
  const tokenCount = streams.length - bchStreams.length;
  const readyBch = bchStreams.reduce(
    (sum, stream) => sum + Number(stream.claimable_amount || 0),
    0
  );
  const activeCount = streams.filter((stream) => stream.status.toUpperCase() === 'ACTIVE').length;

  const state: ListState = failed
    ? 'error'
    : data === null
      ? 'loading'
      : streams.length > 0
        ? 'ready'
        : status === 'all'
          ? 'empty'
          : 'no-results';
  const showStats = state === 'ready' || (state === 'loading' && status === 'all');
  const tileState = data === null ? 'loading' : 'ready';

  const createStream = () => navigate('/streams/create', { state: buildDaoSingleStreamState() });
  const payMany = () => navigate('/streams/batch-create', { state: buildDaoBatchStreamState() });

  return (
    <PageContainer>
      <OrganizationHeader
        page="streams"
        sample={false}
        primaryAction={
          <Button variant="primary" leadingIcon={Plus} onClick={createStream}>
            {VAULT_STREAMS.create}
          </Button>
        }
        secondaryAction={
          <Button key="pay-many" variant="secondary" leadingIcon={Users} onClick={payMany}>
            {VAULT_STREAMS.payMany}
          </Button>
        }
      />
      <Stack>
        <FilterChips
          label={VAULT_STREAMS.filterLabel}
          options={FILTERS}
          selected={[status]}
          onChange={changeStatus}
        />

        {showStats ? (
          <StatRow>
            <StatTile
              label={VAULT_STREAMS.stats.total}
              value={data?.total ?? 0}
              state={tileState}
            />
            <StatTile
              label={VAULT_STREAMS.stats.active}
              value={activeCount}
              state={tileState}
              pageOnly
            />
            <div className="col-span-2 grid lg:col-span-1">
              <StatTile
                label={VAULT_STREAMS.stats.ready}
                value={<Amount value={readyBch} asset={BCH} size="lg" precision="list" />}
                sub={tokenCount > 0 ? VAULT_STREAMS.tokenNote(tokenCount) : undefined}
                state={tileState}
                pageOnly
              />
            </div>
          </StatRow>
        ) : null}

        <List
          label={VAULT_STREAMS.listLabel}
          columns={COLUMNS}
          rows={streams}
          rowKey={(row) => row.id}
          rowHref={(row) => `/streams/${row.id}`}
          state={state}
          empty={
            <EmptyState
              icon={Waves}
              title={VAULT_STREAMS.empty.title}
              description={VAULT_STREAMS.empty.description}
              action={
                <Button variant="primary" leadingIcon={Plus} onClick={createStream}>
                  {VAULT_STREAMS.create}
                </Button>
              }
            />
          }
          noResults={
            <NoResults thing={VAULT_STREAMS.noResultsThing} onClear={() => changeStatus(['all'])} />
          }
          error={
            <ErrorState
              title={VAULT_STREAMS.error.title}
              reason={VAULT_STREAMS.error.reason}
              onRetry={() => setAttempt((count) => count + 1)}
            />
          }
        />

        {data && data.total > 0 ? (
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
        ) : null}

        <div>
          <ButtonLink variant="link" to="/app/dao/stream-batches">
            {VAULT_STREAMS.batches}
          </ButtonLink>
        </div>
      </Stack>
    </PageContainer>
  );
}
