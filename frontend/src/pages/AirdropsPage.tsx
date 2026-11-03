import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { Gift, Plus } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { NoResults } from '../components/ui/NoResults';
import { Notice } from '../components/ui/Notice';
import { SearchInput } from '../components/ui/SearchInput';
import { SegmentedControl } from '../components/ui/SegmentedControl';
import { StatRow } from '../components/ui/StatRow';
import { StatTile } from '../components/ui/StatTile';
import { StatusPill } from '../components/ui/StatusPill';
import { useToast } from '../components/ui/Toast';
import type { Asset } from '../components/ui/types';
import { useWallet } from '../hooks/useWallet';
import {
  AIRDROPS_PAGE,
  airdropPill,
  airdropPoolEmpty,
  airdropShareCount,
  fromSender,
  sharesClaimed,
  tokenAirdropsLeftOut,
} from '../copy/airdrops';
import { TOASTS, showFinished } from '../copy/common';
import { formatAddress, formatDate } from '../copy/format';
import { STATUS, type StatusKey } from '../copy/status';
import { getCachedTokenMeta } from '../utils/tokenMeta';

type View = 'sent' | 'toClaim';
type StatusFilter = 'all' | 'notFunded' | 'scheduled' | 'openForClaims' | 'paused' | 'closed' | 'expired' | 'cancelled';

interface AirdropRow {
  id: string;
  creator: string;
  title: string;
  token_type: string;
  token_category?: string | null;
  token_decimals?: number | null;
  total_amount: number;
  amount_per_claim: number;
  total_recipients: number;
  claimed_count: number;
  claim_link?: string | null;
  start_date: number;
  end_date?: number | null;
  status: string;
}

const BCH: Asset = { kind: 'bch' };

const VIEWS: { value: View; label: string }[] = [
  { value: 'sent', label: AIRDROPS_PAGE.views.sent },
  { value: 'toClaim', label: AIRDROPS_PAGE.views.toClaim },
];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: AIRDROPS_PAGE.filterAll },
  { value: 'notFunded', label: STATUS.notFunded.word },
  { value: 'scheduled', label: STATUS.scheduled.word },
  { value: 'openForClaims', label: STATUS.openForClaims.word },
  { value: 'paused', label: STATUS.paused.word },
  { value: 'closed', label: STATUS.closed.word },
  { value: 'expired', label: STATUS.expired.word },
  { value: 'cancelled', label: STATUS.cancelled.word },
];

function readView(value: string | null): View {
  return value === 'toClaim' ? 'toClaim' : 'sent';
}

function readStatus(value: string | null): StatusFilter {
  return FILTERS.some((filter) => filter.value === value) ? (value as StatusFilter) : 'all';
}

function airdropAsset(row: AirdropRow): Asset {
  if (row.token_type === 'BCH' || !row.token_category) return BCH;
  const meta = getCachedTokenMeta(row.token_category);
  return { kind: 'token', tokenId: row.token_category, symbol: meta?.symbol, decimals: row.token_decimals ?? meta?.decimals ?? 0 };
}

function isDone(status: StatusKey): boolean {
  return status === 'closed' || status === 'expired' || status === 'cancelled';
}

async function fetchAirdrops(view: View, address: string): Promise<AirdropRow[]> {
  const url =
    view === 'sent'
      ? `/api/airdrops?creator=${encodeURIComponent(address)}`
      : `/api/airdrops/claimable?address=${encodeURIComponent(address)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Airdrops request failed with ${response.status}`);
  const data: { campaigns?: AirdropRow[] } = await response.json();
  return data.campaigns ?? [];
}

export default function AirdropsPage() {
  const wallet = useWallet();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const view = readView(params.get('view'));
  const status = readStatus(params.get('status'));
  const query = params.get('q') ?? '';
  const [rows, setRows] = useState<AirdropRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const nowSeconds = Math.floor(Date.now() / 1000);

  const load = useCallback(async () => {
    if (!wallet.address) return;
    setFailed(false);
    setRows(null);
    try {
      const loaded = await fetchAirdrops(view, wallet.address);
      setRows(view === 'toClaim' ? loaded.filter((row) => !airdropPoolEmpty(row)) : loaded);
    } catch (error) {
      console.error('Airdrops did not load', error);
      setFailed(true);
    }
  }, [view, wallet.address]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (next: Record<string, string | null>) => {
    const merged = new URLSearchParams(params);
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '' || value === 'all' || (key === 'view' && value === 'sent')) merged.delete(key);
      else merged.set(key, value);
    }
    setParams(merged, { replace: true });
  };

  const all = useMemo(() => rows ?? [], [rows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((row) => {
      if (status !== 'all' && airdropPill(row, nowSeconds) !== status) return false;
      return !needle || row.title.toLowerCase().includes(needle);
    });
  }, [all, nowSeconds, query, status]);

  const open = status === 'all' ? filtered.filter((row) => !isDone(airdropPill(row, nowSeconds))) : filtered;
  const done = status === 'all' ? filtered.filter((row) => isDone(airdropPill(row, nowSeconds))) : [];
  const filtering = status !== 'all' || query.trim() !== '';
  const state: ListState = failed
    ? 'error'
    : rows === null
      ? 'loading'
      : filtered.length > 0
        ? 'ready'
        : all.length > 0 && filtering
          ? 'no-results'
          : 'empty';

  const bchRows = all.filter((row) => airdropAsset(row).kind === 'bch');
  const tokenCount = all.length - bchRows.length;
  const openCount = all.filter((row) => airdropPill(row, nowSeconds) === 'openForClaims').length;
  const sharesTaken = all.reduce((sum, row) => sum + Number(row.claimed_count || 0), 0);
  const claimedBch = bchRows.reduce((sum, row) => sum + Number(row.claimed_count || 0) * Number(row.amount_per_claim || 0), 0);
  const showStats = view === 'sent' && !failed && (rows === null || all.length > 0);
  const tileState = rows === null ? 'loading' : 'ready';

  const copyLink = async (row: AirdropRow) => {
    if (!row.claim_link) return;
    try {
      await navigator.clipboard.writeText(row.claim_link);
      toast({ tone: 'success', title: TOASTS.linkCopied });
    } catch (error) {
      console.warn('Clipboard write was refused', error);
      toast({ tone: 'danger', title: TOASTS.copyFailed });
    }
  };

  const columns: Column<AirdropRow>[] = [
    {
      key: 'airdrop',
      header: AIRDROPS_PAGE.columns.airdrop,
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-title-item text-ink">{row.title}</span>
          <span className="text-small text-ink-muted">
            {view === 'toClaim' ? fromSender(formatAddress(row.creator)) : sharesClaimed(Number(row.claimed_count) || 0, airdropShareCount(row))}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: AIRDROPS_PAGE.columns.status,
      mobile: 'top',
      cell: (row) => <StatusPill status={airdropPill(row, nowSeconds)} />,
    },
    {
      key: 'share',
      header: AIRDROPS_PAGE.columns.share,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => <Amount value={row.amount_per_claim} asset={airdropAsset(row)} precision="list" />,
    },
    {
      key: 'closes',
      header: AIRDROPS_PAGE.columns.closes,
      mobile: 'bottom-end',
      cell: (row) => {
        const date = formatDate(row.end_date, { dropSameYear: true, now: nowSeconds * 1000 });
        if (!date) return AIRDROPS_PAGE.noClose;
        return (
          <>
            <span className="md:hidden">{AIRDROPS_PAGE.closesOn} </span>
            {date}
          </>
        );
      },
    },
  ];

  const canShare = (row: AirdropRow) => view === 'sent' && Boolean(row.claim_link) && airdropPill(row, nowSeconds) === 'openForClaims';

  const createButton = (
    <ButtonLink variant="primary" leadingIcon={Plus} to="/airdrops/create">
      {AIRDROPS_PAGE.create}
    </ButtonLink>
  );

  const empty =
    view === 'toClaim' ? (
      <EmptyState
        icon={Gift}
        title={AIRDROPS_PAGE.empty.toClaim.title}
        description={AIRDROPS_PAGE.empty.toClaim.description}
        learnMore={{ label: AIRDROPS_PAGE.howItWorks, to: '/help#claim-an-airdrop' }}
      />
    ) : (
      <EmptyState
        icon={Gift}
        title={AIRDROPS_PAGE.empty.sent.title}
        description={AIRDROPS_PAGE.empty.sent.description}
        example={AIRDROPS_PAGE.empty.sent.example}
        action={createButton}
        learnMore={{ label: AIRDROPS_PAGE.howItWorks, to: '/use-cases#send-to-many' }}
      />
    );

  return (
    <PageContainer>
      <PageHeader title={AIRDROPS_PAGE.title} description={AIRDROPS_PAGE.description} primaryAction={createButton} />
      <Stack>
        <ListToolbar
          segments={
            <SegmentedControl
              label={AIRDROPS_PAGE.viewLabel}
              options={VIEWS}
              value={view}
              onChange={(next) => update({ view: next, status: null })}
            />
          }
          search={
            <SearchInput
              label={AIRDROPS_PAGE.searchLabel}
              placeholder={AIRDROPS_PAGE.searchPlaceholder}
              value={query}
              onChange={(next) => update({ q: next })}
              className="w-full"
            />
          }
          chips={
            view === 'sent' ? (
              <FilterChips
                label={AIRDROPS_PAGE.filterLabel}
                options={FILTERS}
                selected={[status]}
                onChange={(next) => update({ status: next[0] ?? null })}
              />
            ) : view === 'toClaim' ? (
              <Notice tone="info" title={AIRDROPS_PAGE.toClaimLine} />
            ) : null
          }
          stats={
            showStats ? (
              <StatRow>
                <StatTile label={AIRDROPS_PAGE.stats.open} value={openCount} state={tileState} />
                <StatTile label={AIRDROPS_PAGE.stats.shares} value={sharesTaken} state={tileState} />
                <StatTile
                  label={AIRDROPS_PAGE.stats.claimedBch}
                  value={<Amount value={claimedBch} asset={BCH} size="lg" precision="list" />}
                  sub={tokenCount > 0 ? tokenAirdropsLeftOut(tokenCount) : undefined}
                  state={tileState}
                />
              </StatRow>
            ) : null
          }
        />

        <List
          label={AIRDROPS_PAGE.listLabel}
          columns={columns}
          rows={open}
          rowKey={(row) => row.id}
          rowHref={(row) => `/airdrops/${row.id}`}
          rowAction={
            view === 'sent'
              ? (row) =>
                  canShare(row) ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={AIRDROPS_PAGE.copyLinkFor(row.title)}
                      onClick={() => void copyLink(row)}
                    >
                      {AIRDROPS_PAGE.copyLink}
                    </Button>
                  ) : null
              : undefined
          }
          state={state}
          collapsed={done.length > 0 ? { label: showFinished(done.length), rows: done } : undefined}
          empty={empty}
          noResults={<NoResults thing={AIRDROPS_PAGE.noResultsThing} onClear={() => update({ status: null, q: null })} />}
          error={<ErrorState title={AIRDROPS_PAGE.error.title} reason={AIRDROPS_PAGE.error.reason} onRetry={load} />}
        />
      </Stack>
    </PageContainer>
  );
}
