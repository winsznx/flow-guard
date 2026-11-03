import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrossLink } from '../components/CrossLink';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Code } from '../components/ui/Code';
import { CopyButton } from '../components/ui/CopyButton';
import { DetailList } from '../components/ui/DetailList';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { FilterChips } from '../components/ui/FilterChips';
import { Heading } from '../components/ui/Heading';
import { Activity, Search, Wallet } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Pagination } from '../components/ui/Pagination';
import { Panel } from '../components/ui/Panel';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { Select } from '../components/ui/Select';
import { SiteBanner } from '../components/ui/SiteBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { Switch } from '../components/ui/Switch';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { cx } from '../components/ui/cx';
import { ACTIONS, LABELS } from '../copy/common';
import {
  ADDRESS_DRAWER,
  ALL_TYPES,
  EXPLORER_ELSEWHERE_LINKS,
  EXPLORER_EMPTY,
  EXPLORER_ERRORS,
  EXPLORER_FILTERS,
  EXPLORER_PAGE,
  EXPLORER_SCOPE,
  EXPLORER_SEARCH,
  EXPLORER_STATS,
  EXPLORER_TABLE,
  KIND_LABEL,
  KIND_STATUSES,
  EVENT_DRAWER,
  PAYMENT_INTERVAL,
  RECORD_DRAWER,
  TRANSACTION_ENTITY_LABEL,
  TRANSACTION_TABLE,
  eventAt,
  lastUpdate,
  openEntityListInApp,
  openListInApp,
  recordMetaPrefix,
  requestsWaitingSub,
  searchResultsFor,
  streamsActiveSub,
  unnamedRecord,
  vaultsRecentSub,
  type ExplorerLoadProblem,
  type ExplorerRecordKind,
  type ExplorerScope,
  type ExplorerTransactionEntity,
} from '../copy/explorer';
import { EVENT_WORD, toEventKind } from '../copy/events';
import { formatDateTime, formatRelative, formatShortId, toDate } from '../copy/format';
import { BUILD_NETWORK, IS_TEST_BUILD, viewOnExplorer } from '../copy/network';
import {
  airdropStatus,
  lifecycleStatus,
  spendingRequestStatus,
  STATUS,
  type StatusKey,
} from '../copy/status';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { getExplorerAddressUrl } from '../utils/blockchain';
import {
  detectQueryKind,
  explorerLoadProblem,
  getExplorerAddress,
  getExplorerStats,
  getExplorerTransactions,
  isHiddenTestRecord,
  searchExplorer,
  type ExplorerAddressProposal,
  type ExplorerAddressResponse,
  type ExplorerAddressStream,
  type ExplorerAddressVault,
  type ExplorerSearchResponse,
  type ExplorerSearchTransaction,
  type ExplorerSortField,
  type ExplorerSortOrder,
  type ExplorerStatsResponse,
  type ExplorerTransactionRow,
  type ExplorerTransactionsQuery,
} from '../utils/explorerQueries';
import { appHref, isExplorerHost } from '../utils/publicUrls';
import { getCachedTokenMeta, resolveTokenMeta } from '../utils/tokenMeta';

const PAGE_SIZE = 20;
const AUTO_UPDATE_MS = 30_000;
const CLOCK_TICK_MS = 15_000;
const LONG_ID = 16;
const KINDS: ExplorerRecordKind[] = ['vault', 'stream', 'payment', 'airdrop', 'proposal'];
const SORT_FIELDS: ExplorerSortField[] = ['time', 'amount', 'status'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCKED_DRAWER_QUERY = '(min-width: 1024px)';
const NO_RECORDS: ExplorerRecord[] = [];
const NO_TRANSACTIONS: ExplorerSearchTransaction[] = [];

type KindFilter = 'all' | ExplorerRecordKind;
type Load<T> =
  | { state: 'loading' }
  | { state: 'error'; problem: ExplorerLoadProblem }
  | { state: 'ready'; data: T };

type ExplorerRecord = {
  key: string;
  kind: ExplorerRecordKind;
  id: string;
  appId: string | null;
  name: string | null;
  from: string | null;
  to: string | null;
  amount: number | null;
  asset: Asset | null;
  rawStatus: string;
  interval: string | null;
  createdAt: string | number | null;
  event: { type: string; at: string | number | null } | null;
  txHash: string | null;
  contractAddress: string | null;
  vaultId: string | null;
};

const TX_TYPE_KIND: Record<ExplorerTransactionRow['tx_type'], ExplorerRecordKind> = {
  VAULT: 'vault',
  STREAM: 'stream',
  PAYMENT: 'payment',
  AIRDROP: 'airdrop',
  PROPOSAL: 'proposal',
};

const APP_LIST_PATH: Record<ExplorerRecordKind, string> = {
  vault: '/vaults',
  stream: '/streams',
  payment: '/payments',
  airdrop: '/airdrops',
  proposal: '/proposals',
};

const TRANSACTION_ENTITY_PATH: Record<ExplorerTransactionEntity, string> = {
  stream: '/streams',
  payment: '/payments',
  airdrop: '/airdrops',
  reward: '/rewards',
  bounty: '/bounties',
  grant: '/grants',
};

function isTokenType(tokenType: string | null | undefined): boolean {
  return tokenType === 'CASHTOKENS' || tokenType === 'FUNGIBLE_TOKEN';
}

function assetFor(
  tokenType: string | null | undefined,
  category: string | null | undefined
): Asset {
  if (!isTokenType(tokenType)) return { kind: 'bch' };
  const meta = getCachedTokenMeta(category);
  return {
    kind: 'token',
    tokenId: category ?? '',
    symbol: meta?.symbol,
    decimals: meta?.decimals ?? 0,
  };
}

function fromFeedRow(row: ExplorerTransactionRow): ExplorerRecord {
  const kind = TX_TYPE_KIND[row.tx_type];
  const eventEntity = row.latest_event?.entity_id ?? null;
  const hasOwnName = kind === 'vault' || kind === 'airdrop' || kind === 'proposal';
  return {
    key: `${kind}:${row.id}`,
    kind,
    id: row.id,
    appId: typeof eventEntity === 'string' && UUID.test(eventEntity) ? eventEntity : null,
    name: hasOwnName ? row.name?.trim() || null : null,
    from: kind === 'proposal' ? null : (row.sender ?? null),
    to: row.recipient ?? null,
    amount: row.amount,
    asset: assetFor(row.token_type, row.token_category),
    rawStatus: row.status,
    interval: kind === 'payment' ? (row.name ?? null) : null,
    createdAt: row.created_at,
    event: row.latest_event
      ? { type: row.latest_event.event_type, at: row.latest_event.created_at }
      : null,
    txHash: row.tx_hash ?? row.latest_event?.tx_hash ?? null,
    contractAddress: row.contract_address ?? null,
    vaultId: row.vault_id ?? null,
  };
}

function fromVault(vault: ExplorerAddressVault): ExplorerRecord {
  return {
    key: `vault:${vault.vault_id}`,
    kind: 'vault',
    id: vault.vault_id,
    appId: null,
    name: vault.name?.trim() || null,
    from: vault.creator,
    to: null,
    amount: vault.total_deposit,
    asset: { kind: 'bch' },
    rawStatus: vault.contract_address ? 'DEPLOYED' : 'CREATED',
    interval: null,
    createdAt: vault.created_at,
    event: null,
    txHash: null,
    contractAddress: vault.contract_address ?? null,
    vaultId: null,
  };
}

function fromStream(stream: ExplorerAddressStream): ExplorerRecord {
  return {
    key: `stream:${stream.stream_id}`,
    kind: 'stream',
    id: stream.stream_id,
    appId: stream.id && UUID.test(stream.id) ? stream.id : null,
    name: null,
    from: stream.sender,
    to: stream.recipient,
    amount: stream.total_amount,
    asset: stream.token_type === null ? null : assetFor(stream.token_type, stream.token_category),
    rawStatus: stream.status,
    interval: null,
    createdAt: stream.created_at,
    event: null,
    txHash: null,
    contractAddress: null,
    vaultId: null,
  };
}

function fromProposal(proposal: ExplorerAddressProposal): ExplorerRecord {
  return {
    key: `proposal:${proposal.id}`,
    kind: 'proposal',
    id: proposal.id,
    appId: null,
    name: proposal.reason?.trim() || null,
    from: null,
    to: proposal.recipient,
    amount: proposal.amount,
    asset: { kind: 'bch' },
    rawStatus: proposal.status,
    interval: null,
    createdAt: proposal.created_at,
    event: null,
    txHash: null,
    contractAddress: null,
    vaultId: proposal.vault_id,
  };
}

type SearchFound = { records: ExplorerRecord[]; transactions: ExplorerSearchTransaction[] };

function searchFound(response: ExplorerSearchResponse): SearchFound {
  const records = [
    ...response.vaults.map(fromVault),
    ...response.streams.map(fromStream),
    ...response.proposals.map(fromProposal),
  ];
  return {
    records: records.filter((record) => !isHiddenTestRecord(record.name)),
    transactions: response.transactions,
  };
}

function transactionKey(tx: ExplorerSearchTransaction): string {
  return `${tx.tx_hash}:${tx.entity_type}:${tx.entity_id}:${tx.event_type}`;
}

/** A transaction event, with the matching search record when the search also found it. */
type SearchEvent = { tx: ExplorerSearchTransaction; record: ExplorerRecord | null };

function entityKey(tx: ExplorerSearchTransaction): string {
  return `${tx.entity_type}:${tx.entity_id}`;
}

/** Pairs stream events with the stream records found by the same search, so each stream shows once. */
function reconcileSearch(
  records: ExplorerRecord[],
  transactions: ExplorerSearchTransaction[]
): { events: SearchEvent[]; others: ExplorerRecord[]; count: number } {
  const streamsByAppId = new Map(
    records
      .filter((record) => record.kind === 'stream' && record.appId)
      .map((record) => [record.appId, record])
  );
  const events = transactions.map((tx) => {
    const record = tx.entity_type === 'stream' ? streamsByAppId.get(tx.entity_id) : undefined;
    return { tx, record: record ? { ...record, txHash: record.txHash ?? tx.tx_hash } : null };
  });
  const paired = new Set(events.flatMap((event) => (event.record ? [event.record.key] : [])));
  const others = records.filter((record) => !paired.has(record.key));
  const count = new Set(transactions.map(entityKey)).size + others.length;
  return { events, others, count };
}

function eventRecordId(event: SearchEvent): string {
  return shortId(event.record?.id ?? event.tx.entity_id);
}

function transactionAppTarget(tx: ExplorerSearchTransaction): { path: string; label: string } {
  const list = TRANSACTION_ENTITY_PATH[tx.entity_type];
  return UUID.test(tx.entity_id)
    ? { path: `${list}/${tx.entity_id}`, label: RECORD_DRAWER.openInApp }
    : { path: list, label: openEntityListInApp(tx.entity_type) };
}

function statusKeyFor(record: ExplorerRecord): StatusKey | null {
  const raw = record.rawStatus;
  switch (record.kind) {
    case 'vault':
      return (
        KIND_STATUSES.vault.find((option) => option.value === raw.toUpperCase())?.status ?? null
      );
    case 'airdrop':
      return airdropStatus(raw);
    case 'proposal':
      return spendingRequestStatus(raw);
    default:
      return lifecycleStatus(raw);
  }
}

function displayName(record: ExplorerRecord): string {
  return record.name ?? unnamedRecord(record.kind, shortId(record.id));
}

function shortId(id: string): string {
  return id.length > LONG_ID ? formatShortId(id) : id;
}

/** Relative time that reads "just now" rather than "in 1 day" when the server clock runs ahead. */
function relativeSince(at: string | number | null, now: number): string | null {
  const time = toDate(at);
  return time ? formatRelative(time, Math.max(now, time.getTime())) : null;
}

function lastUpdateText(record: ExplorerRecord, now: number): string {
  const word = record.event ? EVENT_WORD[toEventKind(record.event.type)] : EVENT_WORD.created;
  const relative = relativeSince(record.event?.at ?? record.createdAt, now);
  return relative ? eventAt(word, relative) : EXPLORER_TABLE.timeNotRecorded;
}

function intervalText(record: ExplorerRecord): string | null {
  if (!record.interval) return null;
  return PAYMENT_INTERVAL[record.interval.toUpperCase()] ?? null;
}

function appTarget(record: ExplorerRecord): { path: string; label: string } {
  if (
    record.appId &&
    (record.kind === 'stream' || record.kind === 'payment' || record.kind === 'airdrop')
  ) {
    return {
      path: `${APP_LIST_PATH[record.kind]}/${record.appId}`,
      label: RECORD_DRAWER.openInApp,
    };
  }
  return {
    path: APP_LIST_PATH[record.kind],
    label: openListInApp(record.kind),
  };
}

function readScope(raw: string | null): ExplorerScope {
  return raw === 'personal' || raw === 'you' ? 'you' : 'everyone';
}

function readKind(raw: string | null): KindFilter {
  return KINDS.find((kind) => kind === raw) ?? 'all';
}

function readStatus(kind: KindFilter, raw: string | null): string {
  if (kind === 'all' || !raw) return '';
  const upper = raw.toUpperCase();
  return KIND_STATUSES[kind].some((option) => option.value === upper) ? upper : '';
}

function readSort(raw: string | null): ExplorerSortField {
  return SORT_FIELDS.find((field) => field === raw) ?? 'time';
}

function readOrder(raw: string | null): ExplorerSortOrder {
  return raw === 'asc' ? 'asc' : 'desc';
}

function subscribeDocked(onChange: () => void): () => void {
  const query = window.matchMedia(DOCKED_DRAWER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function readDocked(): boolean {
  return window.matchMedia(DOCKED_DRAWER_QUERY).matches;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function useTokenSymbols(records: ExplorerRecord[]): void {
  const [, setVersion] = useState(0);
  const missing = new Set<string>();
  for (const record of records) {
    const asset = record.asset;
    if (asset?.kind === 'token' && asset.tokenId && !getCachedTokenMeta(asset.tokenId))
      missing.add(asset.tokenId);
  }
  const missingKey = [...missing].sort().join(',');

  useEffect(() => {
    if (!missingKey) return undefined;
    let cancelled = false;
    void Promise.all(missingKey.split(',').map((category) => resolveTokenMeta(category))).then(
      (metas) => {
        if (!cancelled && metas.some(Boolean)) setVersion((v) => v + 1);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [missingKey]);
}

function withFreshAssets(records: ExplorerRecord[]): ExplorerRecord[] {
  return records.map((record) =>
    record.asset?.kind === 'token' && !record.asset.symbol
      ? { ...record, asset: assetFor('CASHTOKENS', record.asset.tokenId) }
      : record
  );
}

function AmountCell({ record, align }: { record: ExplorerRecord; align: 'end' | 'column' }) {
  if (record.amount === null || !record.asset) {
    return <span className="text-ink-muted">{EXPLORER_TABLE.notRecorded}</span>;
  }
  const every = intervalText(record);
  return (
    <span
      className={cx(
        'inline-flex flex-col gap-0.5',
        align === 'end' ? 'items-end' : 'items-start md:items-end'
      )}
    >
      <span className="text-ink">
        <Amount value={record.amount} asset={record.asset} precision="list" />
      </span>
      {every ? <span className="text-small text-ink-muted">{every}</span> : null}
    </span>
  );
}

function PartyCell({ record, side }: { record: ExplorerRecord; side: 'from' | 'to' }) {
  const address = side === 'from' ? record.from : record.to;
  if (side === 'from' && record.kind === 'proposal') return <span>{KIND_LABEL.vault.one}</span>;
  if (side === 'to' && record.kind === 'airdrop') return <span>{EXPLORER_TABLE.claimList}</span>;
  if (!address) return <span className="text-ink-muted">{EXPLORER_TABLE.nobody}</span>;
  return <Address value={address} copy={false} />;
}

function buildColumns(now: number): Column<ExplorerRecord>[] {
  return [
    {
      key: 'name',
      header: EXPLORER_TABLE.name,
      primary: true,
      cell: (record) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          {record.name ? (
            <>
              <span className="break-words">{record.name}</span>
              <span className="text-small text-ink-muted">
                {recordMetaPrefix(record.kind)}
                <span className="whitespace-nowrap">{shortId(record.id)}</span>
              </span>
            </>
          ) : (
            <span>
              {KIND_LABEL[record.kind].one}{' '}
              <span className="whitespace-nowrap">{shortId(record.id)}</span>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: EXPLORER_TABLE.status,
      sortable: true,
      mobile: 'top',
      cell: (record) => {
        const status = statusKeyFor(record);
        return status ? <StatusPill status={status} size="sm" /> : null;
      },
    },
    {
      key: 'from',
      header: EXPLORER_TABLE.from,
      mobile: 'hidden',
      cell: (record) => <PartyCell record={record} side="from" />,
    },
    {
      key: 'to',
      header: EXPLORER_TABLE.to,
      mobile: 'hidden',
      cell: (record) => <PartyCell record={record} side="to" />,
    },
    {
      key: 'amount',
      header: EXPLORER_TABLE.amount,
      align: 'end',
      sortable: true,
      mobile: 'bottom-start',
      cell: (record) => <AmountCell record={record} align="column" />,
    },
    {
      key: 'time',
      header: EXPLORER_TABLE.lastUpdate,
      align: 'end',
      sortable: true,
      mobile: 'bottom-end',
      cell: (record) => {
        const at = toDate(record.event?.at ?? record.createdAt);
        return (
          <span
            className="whitespace-nowrap"
            title={at ? (formatDateTime(at, { withZone: true }) ?? undefined) : undefined}
          >
            {lastUpdateText(record, now)}
          </span>
        );
      },
    },
  ];
}

function txAction(record: ExplorerRecord) {
  return record.txHash ? (
    <span className="whitespace-nowrap">
      <TxLink txid={record.txHash} network={BUILD_NETWORK} />
    </span>
  ) : null;
}

function RecordDetails({
  record,
  now,
  onSelectAddress,
}: {
  record: ExplorerRecord;
  now: number;
  onSelectAddress: (address: string) => void;
}) {
  const status = statusKeyFor(record);
  const target = appTarget(record);
  const created = formatDateTime(record.createdAt, { withZone: true });
  const every = intervalText(record);
  const addressValue = (address: string | null) =>
    address ? (
      <span className="inline-flex flex-col items-start gap-1 sm:items-end">
        <Address value={address} />
        <Button variant="link" onClick={() => onSelectAddress(address)}>
          {RECORD_DRAWER.seeAddress}
        </Button>
      </span>
    ) : null;

  const items = [
    { label: RECORD_DRAWER.type, value: KIND_LABEL[record.kind].one },
    {
      label: RECORD_DRAWER.id,
      value: (
        <span className="inline-flex items-center gap-1">
          <Code>{shortId(record.id)}</Code>
          <CopyButton value={record.id} label={RECORD_DRAWER.copyId} />
        </span>
      ),
    },
    ...(record.kind === 'proposal'
      ? []
      : [{ label: RECORD_DRAWER.from, value: addressValue(record.from) }]),
    ...(record.kind === 'vault' || record.kind === 'airdrop'
      ? []
      : [{ label: RECORD_DRAWER.to, value: addressValue(record.to) }]),
    {
      label: record.kind === 'vault' ? RECORD_DRAWER.deposited : RECORD_DRAWER.amount,
      value:
        record.amount !== null && record.asset ? (
          <Amount value={record.amount} asset={record.asset} />
        ) : (
          EXPLORER_TABLE.notRecorded
        ),
    },
    ...(every ? [{ label: RECORD_DRAWER.howOften, value: every }] : []),
    { label: RECORD_DRAWER.created, value: created ?? EXPLORER_TABLE.timeNotRecorded },
    { label: RECORD_DRAWER.lastUpdate, value: lastUpdateText(record, now) },
    ...(record.contractAddress
      ? [{ label: RECORD_DRAWER.contract, value: <Address value={record.contractAddress} /> }]
      : []),
    ...(record.vaultId
      ? [{ label: RECORD_DRAWER.vault, value: <Code>{shortId(record.vaultId)}</Code> }]
      : []),
    ...(record.txHash
      ? [
          {
            label: RECORD_DRAWER.transaction,
            value: <TxLink txid={record.txHash} network={BUILD_NETWORK} />,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 sm:px-6">
      <div className="flex flex-col gap-2">
        <Heading level="section" as="h2">
          {displayName(record)}
        </Heading>
        {status ? (
          <div>
            <StatusPill status={status} />
          </div>
        ) : null}
        <p className="text-small text-ink-secondary">{RECORD_DRAWER.readOnly}</p>
      </div>
      <DetailList items={items} />
      <div className="flex flex-col items-start gap-2">
        <AppLink path={target.path} label={target.label} />
        <p className="text-small text-ink-secondary">{RECORD_DRAWER.openInAppLine}</p>
      </div>
    </div>
  );
}

function AppLink({
  path,
  label,
  variant = 'primary',
  hiddenSuffix,
}: {
  path: string;
  label: string;
  variant?: 'primary' | 'link';
  hiddenSuffix?: string;
}) {
  const content = (
    <>
      {label}
      {hiddenSuffix ? <span className="sr-only">{hiddenSuffix}</span> : null}
    </>
  );
  if (isExplorerHost()) {
    return (
      <ButtonLink variant={variant} href={appHref(path)} external>
        {content}
      </ButtonLink>
    );
  }
  return (
    <ButtonLink variant={variant} to={path}>
      {content}
    </ButtonLink>
  );
}

function AddressDetails({
  address,
  load,
  onRetry,
  now,
}: {
  address: string;
  load: Load<ExplorerAddressResponse>;
  onRetry: () => void;
  now: number;
}) {
  return (
    <div className="flex flex-col gap-6 px-4 pb-6 sm:px-6">
      <div className="flex flex-col gap-2">
        <Heading level="section" as="h2">
          {ADDRESS_DRAWER.title}
        </Heading>
        <Address value={address} variant="full" />
        <div>
          <ButtonLink
            variant="link"
            href={getExplorerAddressUrl(address, BUILD_NETWORK)}
            external
            className="inline-flex items-center gap-1"
          >
            {viewOnExplorer(BUILD_NETWORK)}
          </ButtonLink>
        </div>
      </div>
      {load.state === 'loading' ? (
        <div aria-busy="true">
          <Skeleton kind="text" lines={5} />
        </div>
      ) : load.state === 'error' ? (
        <ErrorState
          title={EXPLORER_ERRORS.addressTitle}
          reason={EXPLORER_ERRORS.reason[load.problem]}
          onRetry={onRetry}
        />
      ) : (
        <AddressSummary data={load.data} now={now} />
      )}
    </div>
  );
}

function countText(count: number | null): string {
  return count === null ? ADDRESS_DRAWER.countMissing : String(count);
}

function PartMissing() {
  return <p className="text-small text-ink-secondary">{ADDRESS_DRAWER.partMissing}</p>;
}

function AddressSummary({ data, now }: { data: ExplorerAddressResponse; now: number }) {
  const { sent, received } = data.streams;
  const streams =
    sent === null && received === null
      ? null
      : [
          ...(sent ?? []).map((stream) => ({ stream, direction: ADDRESS_DRAWER.sent })),
          ...(received ?? []).map((stream) => ({ stream, direction: ADDRESS_DRAWER.received })),
        ];
  const streamsPartial = streams !== null && (sent === null || received === null);
  const vaults = data.vaults?.filter((vault) => !isHiddenTestRecord(vault.name)) ?? null;

  return (
    <>
      <DetailList
        items={[
          {
            label: ADDRESS_DRAWER.balance,
            value:
              data.balance === null ? (
                LABELS.balanceUnavailable
              ) : (
                <Amount value={data.balance} asset={{ kind: 'bch' }} />
              ),
          },
          { label: ADDRESS_DRAWER.vaultsCreated, value: countText(data.activity.vaultsCreated) },
          { label: ADDRESS_DRAWER.streamsSent, value: countText(data.activity.streamsSent) },
          {
            label: ADDRESS_DRAWER.streamsReceived,
            value: countText(data.activity.streamsReceived),
          },
          {
            label: ADDRESS_DRAWER.requestsPaying,
            value: countText(data.activity.proposalsReceived),
          },
        ]}
      />
      <section className="flex flex-col gap-3" aria-label={ADDRESS_DRAWER.streams}>
        <Heading level="item" as="h3">
          {ADDRESS_DRAWER.streams}
        </Heading>
        {streams === null ? (
          <PartMissing />
        ) : streams.length === 0 && !streamsPartial ? (
          <p className="text-small text-ink-secondary">{ADDRESS_DRAWER.noStreams}</p>
        ) : (
          <ul className="flex flex-col">
            {streams.map(({ stream, direction }) => {
              const record = fromStream(stream);
              const status = statusKeyFor(record);
              return (
                <li
                  key={`${direction}:${stream.stream_id}`}
                  className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-label text-ink">{displayName(record)}</span>
                    <span className="text-small text-ink-muted">
                      {eventAt(
                        direction,
                        relativeSince(record.createdAt, now) ?? EXPLORER_TABLE.timeNotRecorded
                      )}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 text-small">
                    <AmountCell record={record} align="end" />
                    {status ? <StatusPill status={status} size="sm" /> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {streamsPartial ? <PartMissing /> : null}
      </section>
      <section className="flex flex-col gap-3" aria-label={ADDRESS_DRAWER.vaults}>
        <Heading level="item" as="h3">
          {ADDRESS_DRAWER.vaults}
        </Heading>
        {vaults === null ? (
          <PartMissing />
        ) : vaults.length === 0 ? (
          <p className="text-small text-ink-secondary">{ADDRESS_DRAWER.noVaults}</p>
        ) : (
          <ul className="flex flex-col">
            {vaults.map((vault) => {
              const record = fromVault(vault);
              return (
                <li
                  key={vault.vault_id}
                  className="flex items-start justify-between gap-3 border-t border-line py-3 first:border-t-0"
                >
                  <span className="text-label text-ink">{displayName(record)}</span>
                  <span className="shrink-0 text-small">
                    <AmountCell record={record} align="end" />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function ExplorerShell({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  if (embedded) return <PageContainer>{children}</PageContainer>;
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {IS_TEST_BUILD ? <SiteBanner kind="test-network" /> : null}
      <MarketingNav />
      <main className="flex-1">
        <PageContainer>{children}</PageContainer>
      </main>
      <MarketingFooter />
    </div>
  );
}

export default function ExplorerPage({ embedded = false }: { embedded?: boolean } = {}) {
  const wallet = useWallet();
  const openWalletModal = useWalletModal((state) => state.openModal);
  const [searchParams, setSearchParams] = useSearchParams();
  const now = useNow();
  const docked = useSyncExternalStore(subscribeDocked, readDocked, () => true);
  const listRef = useRef<HTMLDivElement>(null);

  const scope = readScope(searchParams.get('scope'));
  const kind = readKind(searchParams.get('type'));
  const status = readStatus(kind, searchParams.get('status'));
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1);
  const query = searchParams.get('q')?.trim() ?? '';
  const activeAddress = searchParams.get('address');
  const sort = readSort(searchParams.get('sort'));
  const order = readOrder(searchParams.get('order'));
  const walletAddress = wallet.address ?? null;
  const needsWallet = scope === 'you' && !walletAddress;
  const filtersSet = kind !== 'all' || status !== '';

  const updateParams = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      mutate(next);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const [reloadKey, setReloadKey] = useState(0);
  const [autoUpdate, setAutoUpdate] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const [stats, setStats] = useState<Load<ExplorerStatsResponse>>({ state: 'loading' });
  useEffect(() => {
    let cancelled = false;
    getExplorerStats().then(
      (data) => {
        if (!cancelled) setStats({ state: 'ready', data });
      },
      (error: unknown) => {
        console.error('[Explorer] totals', error);
        if (!cancelled) setStats({ state: 'error', problem: explorerLoadProblem(error) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const [feed, setFeed] = useState<Load<{ records: ExplorerRecord[]; total: number }>>({
    state: 'loading',
  });
  useEffect(() => {
    if (needsWallet) return undefined;
    let cancelled = false;
    setFeed((current) => (current.state === 'ready' ? current : { state: 'loading' }));
    const request: ExplorerTransactionsQuery = {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      sort,
      order,
      type: kind === 'all' ? undefined : kind,
      status: status || undefined,
      address: scope === 'you' ? (walletAddress ?? undefined) : undefined,
    };
    getExplorerTransactions(request).then(
      (data) => {
        if (cancelled) return;
        const records = data.transactions
          .map(fromFeedRow)
          .filter((record) => !isHiddenTestRecord(record.name));
        const hiddenHere = data.transactions.length - records.length + data.dropped;
        setFeed({
          state: 'ready',
          data: { records, total: Math.max(records.length, data.total - hiddenHere) },
        });
        setLastLoadedAt(Date.now());
      },
      (error: unknown) => {
        console.error('[Explorer] activity', error);
        if (!cancelled) setFeed({ state: 'error', problem: explorerLoadProblem(error) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needsWallet, page, sort, order, kind, status, scope, walletAddress, reloadKey]);

  const [searchText, setSearchText] = useState(query || activeAddress || '');
  const [search, setSearch] = useState<Load<SearchFound> | null>(null);
  useEffect(() => {
    if (!query) {
      setSearch(null);
      return undefined;
    }
    let cancelled = false;
    setSearch({ state: 'loading' });
    searchExplorer(query).then(
      (data) => {
        if (!cancelled) setSearch({ state: 'ready', data: searchFound(data) });
      },
      (error: unknown) => {
        console.error('[Explorer] search', error);
        if (!cancelled) setSearch({ state: 'error', problem: explorerLoadProblem(error) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [query, reloadKey]);

  const [addressLoad, setAddressLoad] = useState<Load<ExplorerAddressResponse>>({
    state: 'loading',
  });
  const [addressReload, setAddressReload] = useState(0);
  useEffect(() => {
    if (!activeAddress) return undefined;
    let cancelled = false;
    setAddressLoad({ state: 'loading' });
    getExplorerAddress(activeAddress).then(
      (data) => {
        if (!cancelled) setAddressLoad({ state: 'ready', data });
      },
      (error: unknown) => {
        console.error('[Explorer] address', error);
        if (!cancelled) setAddressLoad({ state: 'error', problem: explorerLoadProblem(error) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [activeAddress, addressReload]);

  useEffect(() => {
    if (!autoUpdate) return undefined;
    const timer = window.setInterval(() => {
      const top = listRef.current?.getBoundingClientRect().top ?? 0;
      if (!document.hidden && top >= 0) setReloadKey((key) => key + 1);
    }, AUTO_UPDATE_MS);
    return () => window.clearInterval(timer);
  }, [autoUpdate]);

  const feedRecords = feed.state === 'ready' ? feed.data.records : NO_RECORDS;
  const searchMatches = search?.state === 'ready' ? search.data.records : NO_RECORDS;
  const searchTransactions = search?.state === 'ready' ? search.data.transactions : NO_TRANSACTIONS;
  useTokenSymbols(useMemo(() => [...feedRecords, ...searchMatches], [feedRecords, searchMatches]));
  const shownFeed = withFreshAssets(feedRecords);
  const shownSearch = withFreshAssets(searchMatches);

  const [selected, setSelected] = useState<ExplorerRecord | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<ExplorerSearchTransaction | null>(null);
  const columns = useMemo(() => buildColumns(now), [now]);

  const openAddress = useCallback(
    (address: string) => {
      setSelected(null);
      updateParams((next) => next.set('address', address));
    },
    [updateParams]
  );

  const closeAddress = useCallback(() => {
    updateParams((next) => next.delete('address'));
  }, [updateParams]);

  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (detectQueryKind(trimmed) === 'address') {
      openAddress(trimmed);
      return;
    }
    updateParams((next) => {
      next.set('q', trimmed);
      next.delete('address');
    });
  };

  const clearSearch = () => {
    setSearchText('');
    updateParams((next) => next.delete('q'));
  };

  const setScope = (next: ExplorerScope) =>
    updateParams((params) => {
      if (next === 'you') params.set('scope', 'personal');
      else params.delete('scope');
      params.delete('page');
    });

  const setKind = (next: KindFilter) =>
    updateParams((params) => {
      if (next === 'all') params.delete('type');
      else params.set('type', next);
      params.delete('status');
      params.delete('page');
    });

  const setStatus = (next: string) =>
    updateParams((params) => {
      if (next) params.set('status', next);
      else params.delete('status');
      params.delete('page');
    });

  const clearFilters = () =>
    updateParams((params) => {
      params.delete('type');
      params.delete('status');
      params.delete('page');
    });

  const setPage = (next: number) => {
    updateParams((params) => {
      if (next <= 1) params.delete('page');
      else params.set('page', String(next));
    });
    listRef.current?.scrollIntoView({ block: 'start' });
  };

  const setSortKey = (key: string) => {
    const field = readSort(key);
    updateParams((params) => {
      if (field === sort) params.set('order', order === 'asc' ? 'desc' : 'asc');
      else {
        params.set('sort', field);
        params.set('order', 'desc');
      }
      params.delete('page');
    });
  };

  const refresh = () => setReloadKey((key) => key + 1);

  const queryKind = detectQueryKind(searchText);
  const searchHint = searchText.trim()
    ? EXPLORER_SEARCH.hint[queryKind]
    : EXPLORER_SEARCH.hint.text;
  const typeOptions = [
    { value: 'all' as KindFilter, label: ALL_TYPES },
    ...KINDS.map((value) => ({ value: value as KindFilter, label: KIND_LABEL[value].many })),
  ];
  const statusOptions =
    kind === 'all'
      ? []
      : [
          { value: '', label: EXPLORER_FILTERS.anyStatus },
          ...KIND_STATUSES[kind].map((option) => ({
            value: option.value,
            label: statusWord(option.status),
          })),
        ];

  const feedState: ListState =
    feed.state === 'loading'
      ? 'loading'
      : feed.state === 'error'
        ? 'error'
        : shownFeed.length > 0
          ? 'ready'
          : filtersSet
            ? 'no-results'
            : 'empty';

  const stateLine = lastLoadedAt
    ? lastUpdate(formatRelative(lastLoadedAt, Math.max(now, lastLoadedAt)) ?? '')
    : EXPLORER_PAGE.notUpdatedYet;

  const statsData = stats.state === 'ready' ? stats.data : null;
  const tileState = (value: number | null | undefined): 'loading' | 'error' | 'ready' =>
    stats.state === 'ready' ? (typeof value === 'number' ? 'ready' : 'error') : stats.state;
  const drawerSide = docked ? 'right' : 'full';

  return (
    <ExplorerShell embedded={embedded}>
      <PageHeader
        title={EXPLORER_PAGE.title}
        description={EXPLORER_PAGE.description}
        stateLine={stateLine}
        secondaryActions={[
          <Button key="refresh" variant="secondary" onClick={refresh}>
            {EXPLORER_PAGE.refresh}
          </Button>,
        ]}
      />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <SearchInput
            label={EXPLORER_SEARCH.label}
            placeholder={EXPLORER_SEARCH.placeholder}
            value={searchText}
            onChange={setSearchText}
            onSubmit={submitSearch}
          />
          <p className="text-small text-ink-secondary" aria-live="polite">
            {searchHint}
          </p>
        </div>

        {query ? (
          <SearchResults
            query={query}
            load={search}
            records={shownSearch}
            transactions={searchTransactions}
            columns={columns}
            now={now}
            onOpen={setSelected}
            onOpenEvent={setSelectedEvent}
            onClear={clearSearch}
            onRetry={refresh}
          />
        ) : (
          <>
            {scope === 'everyone' ? (
              <StatRow>
                <StatTile
                  label={EXPLORER_STATS.vaults}
                  state={tileState(statsData?.vaults.total)}
                  onRetry={refresh}
                  value={statsData?.vaults.total ?? null}
                  sub={countSub(statsData?.vaults.recent24h, vaultsRecentSub)}
                />
                <StatTile
                  label={EXPLORER_STATS.streams}
                  state={tileState(statsData?.streams.total)}
                  onRetry={refresh}
                  value={statsData?.streams.total ?? null}
                  sub={countSub(statsData?.streams.active, streamsActiveSub)}
                />
                <StatTile
                  label={EXPLORER_STATS.requests}
                  state={tileState(statsData?.proposals.total)}
                  onRetry={refresh}
                  value={statsData?.proposals.total ?? null}
                  sub={countSub(statsData?.proposals.active, requestsWaitingSub)}
                />
                <StatTile
                  label={EXPLORER_STATS.recent}
                  state={tileState(statsData ? recentTotal(statsData) : null)}
                  onRetry={refresh}
                  value={statsData ? recentTotal(statsData) : null}
                  sub={EXPLORER_STATS.recentSub}
                />
              </StatRow>
            ) : null}

            <div ref={listRef} className="flex scroll-mt-header flex-col gap-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <SegmentedControl
                  label={EXPLORER_SCOPE.label}
                  options={EXPLORER_SCOPE.options}
                  value={scope}
                  onChange={setScope}
                />
                <div className="lg:w-drawer">
                  <Switch
                    label={EXPLORER_FILTERS.autoUpdate}
                    description={EXPLORER_FILTERS.autoUpdateLine}
                    checked={autoUpdate}
                    onChange={setAutoUpdate}
                  />
                </div>
              </div>

              {needsWallet ? (
                <Panel>
                  <EmptyState
                    icon={Wallet}
                    title={EXPLORER_SCOPE.connectTitle}
                    description={EXPLORER_SCOPE.connectLine}
                    action={
                      <Button variant="primary" data-wallet-trigger onClick={openWalletModal}>
                        {ACTIONS.connectWallet}
                      </Button>
                    }
                  />
                </Panel>
              ) : (
                <>
                  {scope === 'you' ? (
                    <p className="text-small text-ink-secondary">{EXPLORER_SCOPE.youLine}</p>
                  ) : null}
                  <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div className="-mx-4 min-w-0 overflow-x-auto px-4 md:mx-0 md:px-0">
                      <FilterChips
                        label={EXPLORER_FILTERS.typeLabel}
                        options={typeOptions}
                        selected={[kind]}
                        onChange={(values) => setKind(values[0] ?? 'all')}
                      />
                    </div>
                    {statusOptions.length > 0 ? (
                      <div className="md:w-popover">
                        <Select
                          label={EXPLORER_FILTERS.statusLabel}
                          options={statusOptions}
                          value={status}
                          onValueChange={setStatus}
                          dense
                        />
                      </div>
                    ) : null}
                  </div>

                  <List
                    label={EXPLORER_TABLE.label}
                    columns={columns}
                    rows={shownFeed}
                    rowKey={(record) => record.key}
                    onRowOpen={setSelected}
                    rowAction={txAction}
                    state={feedState}
                    sort={{ key: sort, direction: order, onChange: setSortKey }}
                    empty={
                      scope === 'you' ? (
                        <EmptyState
                          icon={Activity}
                          title={EXPLORER_EMPTY.youTitle}
                          description={EXPLORER_EMPTY.youLine}
                          action={
                            <AppLink path="/streams/create" label={EXPLORER_EMPTY.youAction} />
                          }
                        />
                      ) : (
                        <EmptyState
                          icon={Activity}
                          title={EXPLORER_EMPTY.everyoneTitle}
                          description={EXPLORER_EMPTY.everyoneLine}
                        />
                      )
                    }
                    noResults={<NoResults thing={EXPLORER_TABLE.things} onClear={clearFilters} />}
                    error={
                      <ErrorState
                        title={EXPLORER_ERRORS.activityTitle}
                        reason={
                          feed.state === 'error' ? EXPLORER_ERRORS.reason[feed.problem] : undefined
                        }
                        onRetry={refresh}
                      />
                    }
                  />

                  {feed.state === 'ready' && shownFeed.length > 0 ? (
                    <Pagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={feed.data.total}
                      onPage={setPage}
                    />
                  ) : null}
                </>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col gap-1 text-small text-ink-secondary">
          <p>{EXPLORER_PAGE.coverage}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{EXPLORER_PAGE.elsewhere}</span>
            {EXPLORER_ELSEWHERE_LINKS.map((link) => (
              <CrossLink
                key={link.path}
                to={link.path}
                data-inline
                className="text-brand underline underline-offset-4 transition-colors duration-(--duration-fast) ease-standard hover:text-brand-hover"
              >
                {link.label}
              </CrossLink>
            ))}
          </p>
        </div>
      </div>

      <Drawer
        open={selected !== null && !activeAddress}
        onClose={() => setSelected(null)}
        side={drawerSide}
        label={RECORD_DRAWER.label}
      >
        {selected ? (
          <RecordDetails record={selected} now={now} onSelectAddress={openAddress} />
        ) : null}
      </Drawer>
      <Drawer
        open={selectedEvent !== null && !activeAddress}
        onClose={() => setSelectedEvent(null)}
        side={drawerSide}
        label={EVENT_DRAWER.label}
      >
        {selectedEvent ? <EventDetails tx={selectedEvent} /> : null}
      </Drawer>
      <Drawer
        open={Boolean(activeAddress)}
        onClose={closeAddress}
        side={drawerSide}
        label={ADDRESS_DRAWER.label}
      >
        {activeAddress ? (
          <AddressDetails
            address={activeAddress}
            load={addressLoad}
            onRetry={() => setAddressReload((key) => key + 1)}
            now={now}
          />
        ) : null}
      </Drawer>
    </ExplorerShell>
  );
}

function statusWord(status: StatusKey): string {
  return STATUS[status].word;
}

function countSub(
  count: number | null | undefined,
  describe: (count: number) => string
): string | undefined {
  return typeof count === 'number' ? describe(count) : undefined;
}

function recentTotal({ vaults, streams, proposals }: ExplorerStatsResponse): number | null {
  const counts = [vaults.recent24h, streams.recent24h, proposals.recent24h];
  return counts.every((count): count is number => count !== null)
    ? counts.reduce((sum, count) => sum + count, 0)
    : null;
}

function buildTransactionColumns(now: number): Column<SearchEvent>[] {
  return [
    {
      key: 'record',
      header: TRANSACTION_TABLE.record,
      primary: true,
      cell: (event) => (
        <span>
          {TRANSACTION_ENTITY_LABEL[event.tx.entity_type].one}{' '}
          <span className="whitespace-nowrap">{eventRecordId(event)}</span>
        </span>
      ),
    },
    {
      key: 'happened',
      header: TRANSACTION_TABLE.happened,
      mobile: 'bottom-start',
      cell: ({ tx }) => EVENT_WORD[toEventKind(tx.event_type)],
    },
    {
      key: 'when',
      header: TRANSACTION_TABLE.when,
      align: 'end',
      mobile: 'bottom-end',
      cell: ({ tx }) => {
        const at = toDate(tx.created_at);
        return (
          <span
            className="whitespace-nowrap"
            title={at ? (formatDateTime(at, { withZone: true }) ?? undefined) : undefined}
          >
            {relativeSince(tx.created_at, now) ?? EXPLORER_TABLE.timeNotRecorded}
          </span>
        );
      },
    },
  ];
}

function EventDetails({ tx }: { tx: ExplorerSearchTransaction }) {
  const label = TRANSACTION_ENTITY_LABEL[tx.entity_type].one;
  const target = transactionAppTarget(tx);
  const at = formatDateTime(tx.created_at, { withZone: true });
  const items = [
    { label: RECORD_DRAWER.type, value: label },
    {
      label: RECORD_DRAWER.id,
      value: (
        <span className="inline-flex items-center gap-1">
          <Code>{shortId(tx.entity_id)}</Code>
          <CopyButton value={tx.entity_id} label={RECORD_DRAWER.copyId} />
        </span>
      ),
    },
    { label: EVENT_DRAWER.happened, value: EVENT_WORD[toEventKind(tx.event_type)] },
    {
      label: EVENT_DRAWER.when,
      value: at ?? EXPLORER_TABLE.timeNotRecorded,
    },
    {
      label: RECORD_DRAWER.transaction,
      value: <TxLink txid={tx.tx_hash} network={BUILD_NETWORK} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6 px-4 pb-6 sm:px-6">
      <div className="flex flex-col gap-2">
        <Heading level="section" as="h2">
          {label} <span className="whitespace-nowrap">{shortId(tx.entity_id)}</span>
        </Heading>
        <p className="text-small text-ink-secondary">{RECORD_DRAWER.readOnly}</p>
      </div>
      <DetailList items={items} />
      <div className="flex flex-col items-start gap-2">
        <AppLink path={target.path} label={target.label} />
        <p className="text-small text-ink-secondary">{RECORD_DRAWER.openInAppLine}</p>
      </div>
    </div>
  );
}

function SearchResults({
  query,
  load,
  records,
  transactions,
  columns,
  now,
  onOpen,
  onOpenEvent,
  onClear,
  onRetry,
}: {
  query: string;
  load: Load<SearchFound> | null;
  records: ExplorerRecord[];
  transactions: ExplorerSearchTransaction[];
  columns: Column<ExplorerRecord>[];
  now: number;
  onOpen: (record: ExplorerRecord) => void;
  onOpenEvent: (tx: ExplorerSearchTransaction) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const isTransaction = detectQueryKind(query) === 'transaction';
  const transactionColumns = useMemo(() => buildTransactionColumns(now), [now]);
  const { events, others, count } = useMemo(
    () => reconcileSearch(records, transactions),
    [records, transactions]
  );
  const ready = load?.state === 'ready';
  const showTransactions = ready && events.length > 0;
  const showRecords = !showTransactions || others.length > 0;
  const state: ListState =
    !load || load.state === 'loading'
      ? 'loading'
      : load.state === 'error'
        ? 'error'
        : others.length > 0
          ? 'ready'
          : 'empty';

  return (
    <section className="flex flex-col gap-4" aria-label={EXPLORER_SEARCH.listLabel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 wrap-anywhere">
          <Heading level="section" as="h2">
            {ready
              ? searchResultsFor(count, query)
              : EXPLORER_SEARCH.listLabel}
          </Heading>
        </div>
        <Button variant="ghost" onClick={onClear}>
          {EXPLORER_SEARCH.clear}
        </Button>
      </div>
      {showTransactions ? (
        <section className="flex flex-col gap-3" aria-label={EXPLORER_SEARCH.inTransaction}>
          <Heading level="item" as="h3">
            {EXPLORER_SEARCH.inTransaction}
          </Heading>
          <List
            label={EXPLORER_SEARCH.inTransaction}
            columns={transactionColumns}
            rows={events}
            rowKey={({ tx }) => transactionKey(tx)}
            onRowOpen={(event) => (event.record ? onOpen(event.record) : onOpenEvent(event.tx))}
            state="ready"
            empty={null}
            noResults={null}
            error={null}
          />
        </section>
      ) : null}
      {showTransactions && showRecords ? (
        <Heading level="item" as="h3">
          {EXPLORER_SEARCH.matchingRecords}
        </Heading>
      ) : null}
      {showRecords ? (
        <List
          label={showTransactions ? EXPLORER_SEARCH.matchingRecords : EXPLORER_SEARCH.listLabel}
          columns={columns}
          rows={others}
          rowKey={(record) => record.key}
          onRowOpen={onOpen}
          rowAction={txAction}
          state={state}
          empty={
            isTransaction ? (
              <EmptyState
                icon={Search}
                title={EXPLORER_SEARCH.transactionTitle}
                description={EXPLORER_SEARCH.transactionNone}
                action={<TxLink txid={query} network={BUILD_NETWORK} />}
              />
            ) : (
              <div className="wrap-anywhere">
                <EmptyState
                  icon={Search}
                  title={EXPLORER_SEARCH.noneTitle(query)}
                  description={EXPLORER_SEARCH.noneLine}
                />
              </div>
            )
          }
          noResults={null}
          error={
            load?.state === 'error' ? (
              <ErrorState
                title={EXPLORER_SEARCH.failedTitle}
                reason={EXPLORER_ERRORS.reason[load.problem]}
                onRetry={onRetry}
              />
            ) : null
          }
        />
      ) : null}
    </section>
  );
}
