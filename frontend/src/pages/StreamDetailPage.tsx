import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AssetName } from '../components/ui/AssetName';
import { AmountInput } from '../components/ui/AmountInput';
import { Address } from '../components/ui/Address';
import { BackLink } from '../components/ui/BackLink';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { Code } from '../components/ui/Code';
import { CopyButton } from '../components/ui/CopyButton';
import { DetailList } from '../components/ui/DetailList';
import { Dialog } from '../components/ui/Dialog';
import { ErrorState } from '../components/ui/ErrorState';
import { Heading } from '../components/ui/Heading';
import { ArrowDownToLine, ArrowUpFromLine, Copy } from '../components/ui/Icon';
import { ManageActions, type ManageAction } from '../components/ui/ManageActions';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence, type Schedule } from '../components/ui/PlanSentence';
import { ReleaseBar } from '../components/ui/ReleaseBar';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import {
  TransactionReview,
  type ReviewSummary,
  type TxStep,
} from '../components/ui/TransactionReview';
import type { Asset } from '../components/ui/types';
import { ROLE_LINES, TOASTS } from '../copy/common';
import { toEventKind, type ActivityEvent } from '../copy/events';
import {
  formatAddress,
  formatAmount,
  formatDate,
  formatDateTime,
  formatInterval,
} from '../copy/format';
import { lifecycleStatus } from '../copy/status';
import { STREAM_DETAIL, scheduleChoiceOf, scheduleName } from '../copy/streams';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import {
  cancelStreamOnChain,
  claimStreamFunds,
  fundStreamContract,
  pauseStreamOnChain,
  refillStreamOnChain,
  resumeStreamOnChain,
  transferStreamOnChain,
} from '../utils/blockchain';
import { type TokenMeta } from '../utils/tokenMeta';
import { useTokenMeta } from '../hooks/useTokenMeta';

const DAY_SECONDS = 86_400;
const MAX_EVEN_BLOCKS = 52;
const ACTIVITY_SHOWN = 8;

type StreamStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';

interface Stream {
  id: string;
  stream_id: string;
  vault_id?: string | null;
  batch_id?: string | null;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  token_decimals?: number | null;
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  claim_deferred_until?: number | null;
  stream_type: string;
  start_time: number;
  end_time?: number | null;
  interval_seconds?: number | null;
  amount_per_interval?: number | null;
  step_amount?: number | null;
  schedule_count?: number | null;
  tranche_schedule?: { unlock_time: number; amount: number; cumulative_amount: number }[] | null;
  hybrid_unlock_time?: number | null;
  hybrid_upfront_amount?: number | null;
  cliff_timestamp?: number | null;
  pause_started_at?: number | null;
  cancelable: boolean;
  transferable: boolean;
  refillable: boolean;
  status: StreamStatus;
  created_at: number;
  description?: string | null;
}

interface StreamEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  tx_hash: string | null;
  created_at: number;
}

interface StreamRecord {
  stream: Stream;
  events: StreamEvent[];
}

type Load =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error' }
  | { kind: 'ready'; record: StreamRecord };

type Role = 'sender' | 'recipient' | 'viewer';

type ReviewAction = 'fund' | 'claim' | 'cancel' | 'pause' | 'resume' | 'recipient' | 'addFunds';

/** Smallest BCH output the network relays, so smaller claims wait. */
const BCH_DUST_LIMIT = 0.00000546;

type BlockState = 'claimed' | 'ready' | 'later' | 'waiting';
type Block = { at: number; amount: string; state: BlockState };
type RawBlock = { at: number; amount: number; waiting?: boolean };

class StreamNotFound extends Error {}

async function fetchStream(id: string): Promise<StreamRecord> {
  const response = await fetch(`/api/streams/${id}`);
  if (response.status === 404 || response.status === 400) throw new StreamNotFound();
  if (!response.ok) throw new Error(`Stream request failed with ${response.status}`);
  const data: { stream?: Stream; events?: StreamEvent[] } = await response.json();
  if (!data.stream) throw new StreamNotFound();
  return { stream: data.stream, events: data.events ?? [] };
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  const bare = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:/, '');
  return Boolean(a && b) && bare(a ?? '') === bare(b ?? '');
}

function streamAsset(stream: Stream, meta: TokenMeta | null): Asset {
  if (stream.token_type === 'BCH' || !stream.token_category) return { kind: 'bch' };
  return {
    kind: 'token',
    tokenId: stream.token_category,
    symbol: meta?.symbol,
    decimals: stream.token_decimals ?? meta?.decimals ?? 0,
  };
}

function decimalsOf(asset: Asset): number {
  return asset.kind === 'bch' ? 8 : Math.max(0, Math.min(18, asset.decimals));
}

function amountText(value: number, asset: Asset): string {
  return Math.max(0, Number.isFinite(value) ? value : 0).toFixed(decimalsOf(asset));
}

/** Timeline blocks are approximate for streams released every second, so they use list precision. */
function blockAmount(value: number, asset: Asset): string {
  return Math.max(0, Number.isFinite(value) ? value : 0).toFixed(Math.min(4, decimalsOf(asset)));
}

function money(value: number, asset: Asset): string {
  return formatAmount(amountText(value, asset), asset) ?? amountText(value, asset);
}

function perRelease(stream: Stream): number | null {
  const count = stream.schedule_count ?? 0;
  if (stream.stream_type === 'RECURRING')
    return stream.amount_per_interval ?? (count > 0 ? stream.total_amount / count : null);
  if (stream.stream_type === 'STEP')
    return stream.step_amount ?? (count > 0 ? stream.total_amount / count : null);
  return null;
}

function hasWait(stream: Stream): boolean {
  return Boolean(stream.cliff_timestamp && stream.cliff_timestamp > stream.start_time);
}

const BAR_SPANS: readonly number[] = [3_600, DAY_SECONDS, 7 * DAY_SECONDS, 30 * DAY_SECONDS];

/** Bars of an hour, day, week or month: the smallest that draws the whole stream in at most MAX_EVEN_BLOCKS bars. */
function barSpanOf(stream: Stream): number {
  const length = Math.max(0, (stream.end_time ?? 0) - stream.start_time);
  return BAR_SPANS.find((span) => length / span <= MAX_EVEN_BLOCKS) ?? BAR_SPANS[BAR_SPANS.length - 1];
}

function evenBlocks(from: number, to: number, amount: number, span: number): RawBlock[] {
  if (to <= from || amount <= 0) return [];
  const count = Math.max(1, Math.min(MAX_EVEN_BLOCKS, Math.round((to - from) / span)));
  return Array.from({ length: count }, (_, index) => ({
    at: from + ((to - from) * (index + 1)) / count,
    amount: amount / count,
  }));
}

function rawBlocks(stream: Stream): RawBlock[] {
  const start = stream.start_time;
  const end = stream.end_time ?? 0;
  const total = stream.total_amount;
  const span = barSpanOf(stream);

  switch (stream.stream_type) {
    case 'RECURRING':
    case 'STEP': {
      const count = stream.schedule_count ?? 0;
      const interval = stream.interval_seconds ?? 0;
      const each = perRelease(stream);
      if (count < 1 || interval <= 0 || each === null) return [];
      const cliff = hasWait(stream) ? (stream.cliff_timestamp ?? 0) : 0;
      return Array.from({ length: count }, (_, index) => {
        const at = start + interval * (index + 1);
        const amount =
          index === count - 1 && stream.stream_type === 'STEP' ? total - each * (count - 1) : each;
        return { at: Math.max(at, cliff), amount };
      });
    }
    case 'TRANCHE':
      return (stream.tranche_schedule ?? []).map((tranche) => ({
        at: tranche.unlock_time,
        amount: tranche.amount,
      }));
    case 'HYBRID': {
      const unlock = stream.hybrid_unlock_time ?? 0;
      const upfront = stream.hybrid_upfront_amount ?? 0;
      if (!unlock || !end || unlock >= end) return [];
      return [
        { at: start, amount: 0, waiting: true },
        { at: unlock, amount: upfront },
        ...evenBlocks(unlock, end, total - upfront, span),
      ];
    }
    case 'LINEAR': {
      if (!end || end <= start) return [];
      if (!hasWait(stream)) return evenBlocks(start, end, total, span);
      const cliff = stream.cliff_timestamp ?? start;
      const earned = (total * (cliff - start)) / (end - start);
      return [
        { at: start, amount: 0, waiting: true },
        { at: cliff, amount: earned },
        ...evenBlocks(cliff, end, total - earned, span),
      ];
    }
    default:
      return [];
  }
}

/** Streams that release every second, drawn as bars of about an hour, day, week or month. */
function isContinuous(stream: Stream): boolean {
  return stream.stream_type === 'LINEAR' || stream.stream_type === 'HYBRID';
}

/** Block states use the same claimed and ready amounts as the action card. */
function scheduleBlocks(stream: Stream, asset: Asset): Block[] {
  const epsilon = 10 ** -decimalsOf(asset);
  const claimable = stream.status === 'ACTIVE' ? Math.max(0, stream.claimable_amount) : 0;
  const released = stream.status === 'PENDING' ? 0 : stream.withdrawn_amount + claimable;
  let cumulative = 0;
  return rawBlocks(stream).map((block) => {
    if (block.waiting) return { at: block.at * 1000, amount: '0', state: 'waiting' };
    cumulative += block.amount;
    const state: BlockState =
      cumulative - block.amount / 2 <= stream.withdrawn_amount + epsilon
        ? 'claimed'
        : cumulative <= released + epsilon
          ? 'ready'
          : 'later';
    return { at: block.at * 1000, amount: blockAmount(block.amount, asset), state };
  });
}

function planOf(stream: Stream, asset: Asset): Schedule | null {
  const choice = scheduleChoiceOf(stream);
  const total = amountText(stream.total_amount, asset);
  const each = perRelease(stream);
  const end = stream.end_time ?? 0;
  switch (choice) {
    case 'once':
      return end ? { kind: 'once', amount: total, asset, on: end } : null;
    case 'evenly':
    case 'waitThenEvenly':
      return end
        ? {
            kind: 'linear',
            total,
            asset,
            start: stream.start_time,
            end,
            waitUntil: hasWait(stream) ? (stream.cliff_timestamp ?? undefined) : undefined,
          }
        : null;
    case 'sameAmount': {
      const interval = stream.interval_seconds ?? 0;
      const count = stream.schedule_count ?? 0;
      if (!interval || !count || each === null) return null;
      return {
        kind: 'recurring',
        perRelease: amountText(each, asset),
        asset,
        everyDays: interval / DAY_SECONDS,
        count,
        start: stream.start_time + interval,
      };
    }
    case 'partNow': {
      const upfront = stream.hybrid_upfront_amount;
      if (!stream.hybrid_unlock_time || upfront === null || upfront === undefined || !end)
        return null;
      return {
        kind: 'upfront',
        upfront: amountText(upfront, asset),
        rest: amountText(stream.total_amount - upfront, asset),
        asset,
        start: stream.hybrid_unlock_time,
        end,
      };
    }
    case 'custom': {
      const releases = (stream.tranche_schedule ?? []).map((tranche) => ({
        amount: amountText(tranche.amount, asset),
        at: tranche.unlock_time,
      }));
      return releases.length > 0 ? { kind: 'custom', releases, asset } : null;
    }
    default:
      return null;
  }
}

function toActivity(event: StreamEvent, asset: Asset, address: string | null): ActivityEvent {
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

function DetailSkeleton() {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <Skeleton kind="text" lines={2} />
        <Skeleton kind="tile" />
        <Skeleton kind="row" lines={4} />
      </div>
    </PageContainer>
  );
}

export default function StreamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const { pathname } = useLocation();
  const { toast } = useToast();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [review, setReview] = useState<ReviewAction | null>(null);
  const [recipientDialog, setRecipientDialog] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [recipientValid, setRecipientValid] = useState(false);
  const [recipientChecked, setRecipientChecked] = useState(false);
  const [addFundsDialog, setAddFundsDialog] = useState(false);
  const [addAmount, setAddAmount] = useState('');

  useEffect(() => {
    if (!id) return undefined;
    let ignore = false;
    fetchStream(id)
      .then((record) => {
        if (!ignore) setLoad({ kind: 'ready', record });
      })
      .catch((error: unknown) => {
        if (ignore) return;
        if (error instanceof StreamNotFound) {
          setLoad({ kind: 'not-found' });
          return;
        }
        console.error('Stream did not load', error);
        setLoad((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
      });
    return () => {
      ignore = true;
    };
  }, [id, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const record = load.kind === 'ready' ? load.record : null;
  const meta = useTokenMeta(
    record?.stream.token_type === 'CASHTOKENS' ? (record.stream.token_category ?? null) : null
  );

  if (load.kind === 'loading') return <DetailSkeleton />;

  if (load.kind === 'not-found' || load.kind === 'error') {
    const copy = load.kind === 'not-found' ? STREAM_DETAIL.notFound : STREAM_DETAIL.loadError;
    return (
      <PageContainer>
        <div className="mb-6">
          <BackLink to="/streams" label={STREAM_DETAIL.notFound.back} />
        </div>
        <ErrorState
          title={copy.title}
          reason={copy.reason}
          onRetry={
            load.kind === 'error'
              ? () => {
                  setLoad({ kind: 'loading' });
                  reload();
                }
              : undefined
          }
        />
      </PageContainer>
    );
  }

  const { stream, events } = load.record;
  const address = wallet.address;
  const asset = streamAsset(stream, meta);
  const role: Role = sameAddress(stream.sender, address)
    ? 'sender'
    : sameAddress(stream.recipient, address)
      ? 'recipient'
      : 'viewer';
  const nowMs = Date.now();
  const nowSeconds = Math.floor(nowMs / 1000);
  const status = lifecycleStatus(stream.status, { startsAt: stream.start_time * 1000, now: nowMs });
  const recipientShort = formatAddress(stream.recipient);
  const senderShort = formatAddress(stream.sender);
  const title = stream.description?.trim() || STREAM_DETAIL.titleTo(recipientShort);
  const isRecurring = stream.stream_type === 'RECURRING';
  const isToken = asset.kind === 'token';

  const claimed = Math.max(0, stream.withdrawn_amount);
  const ready = Math.max(0, stream.claimable_amount);
  const later = Math.max(0, stream.total_amount - claimed - ready);
  const releasedSoFar = Math.max(0, stream.vested_amount);
  const unreleased = Math.max(0, stream.total_amount - releasedSoFar);
  const releasedNotClaimed = Math.max(0, releasedSoFar - claimed);
  const notClaimed = Math.max(0, stream.total_amount - claimed);
  const deferredUntil =
    stream.claim_deferred_until && stream.claim_deferred_until > nowSeconds
      ? stream.claim_deferred_until
      : null;
  const each = perRelease(stream);

  const blocks = scheduleBlocks(stream, asset);
  const nextBlock = blocks.find((block) => block.state === 'later');
  const plan = planOf(stream, asset);
  const waitEnd = hasWait(stream)
    ? (stream.cliff_timestamp ?? null)
    : stream.stream_type === 'HYBRID'
      ? (stream.hybrid_unlock_time ?? null)
      : null;

  const isActive = stream.status === 'ACTIVE';
  const isPaused = stream.status === 'PAUSED';
  const claimable = isToken ? ready > 0 : ready >= BCH_DUST_LIMIT;
  const canClaim = role === 'recipient' && isActive && claimable && !deferredUntil;
  const canAddFunds =
    role === 'sender' && isRecurring && stream.refillable && (isActive || isPaused);
  const canPause = role === 'sender' && stream.cancelable && isActive;
  const canResume = role === 'sender' && stream.cancelable && isPaused;
  const canCancel = role === 'sender' && stream.cancelable && (isActive || isPaused);
  const canChangeRecipient =
    role === 'recipient' && stream.transferable && !isRecurring && isActive;

  const recipientLine = (): string => {
    if (stream.status === 'PENDING') return STREAM_DETAIL.action.notFunded;
    if (stream.status === 'CANCELLED') return STREAM_DETAIL.action.cancelled;
    if (stream.status === 'COMPLETED') return STREAM_DETAIL.action.finished;
    if (isPaused) return STREAM_DETAIL.action.paused;
    if (deferredUntil) return STREAM_DETAIL.action.deferred(formatDate(deferredUntil) ?? '');
    if (waitEnd && waitEnd > nowSeconds) {
      const date = formatDate(waitEnd);
      if (date) return STREAM_DETAIL.action.waitUntil(date);
    }
    if (isContinuous(stream) && stream.end_time && stream.end_time > nowSeconds) {
      const end = formatDate(stream.end_time);
      if (end) return STREAM_DETAIL.action.continuous(end);
    }
    if (nextBlock && !isContinuous(stream)) {
      const amount = formatAmount(nextBlock.amount, asset);
      const date = formatDate(nextBlock.at);
      if (amount && date) return STREAM_DETAIL.action.next(amount, date);
    }
    if (claimed > 0 && later <= 0 && ready <= 0) return STREAM_DETAIL.action.allClaimed;
    return STREAM_DETAIL.action.nothingYet;
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${pathname}`);
      toast({ tone: 'success', title: TOASTS.linkCopied });
    } catch (error) {
      console.warn('Clipboard write was refused', error);
      toast({ tone: 'danger', title: TOASTS.copyFailed });
    }
  };

  const runWith =
    (send: () => Promise<string>, walletSteps = 1) =>
    async (report: (step: TxStep) => void): Promise<{ txid?: string }> => {
      report({ step: 'wallet', index: 1, of: walletSteps, status: 'pending' });
      const txid = await send();
      for (let index = 1; index <= walletSteps; index += 1) {
        report({ step: 'wallet', index, of: walletSteps, status: 'done' });
      }
      report({ step: 'network', status: 'done' });
      report({ step: 'confirmed', status: 'done' });
      reload();
      return { txid };
    };

  const primaryAction = (() => {
    if (role === 'recipient') {
      return canClaim ? (
        <Button
          variant="primary"
          size="lg"
          leadingIcon={ArrowDownToLine}
          onClick={() => setReview('claim')}
        >
          {STREAM_DETAIL.action.claim(money(ready, asset))}
        </Button>
      ) : (
        <p className="text-body text-ink-secondary">{recipientLine()}</p>
      );
    }
    if (role === 'sender') {
      if (stream.status === 'PENDING') {
        return (
          <Button
            variant="primary"
            size="lg"
            leadingIcon={ArrowUpFromLine}
            onClick={() => setReview('fund')}
          >
            {STREAM_DETAIL.action.fund}
          </Button>
        );
      }
      if (canAddFunds) {
        return (
          <Button
            variant="primary"
            size="lg"
            leadingIcon={ArrowUpFromLine}
            onClick={() => setAddFundsDialog(true)}
          >
            {STREAM_DETAIL.action.addFunds}
          </Button>
        );
      }
      if (isActive || isPaused) {
        return (
          <Button variant="primary" size="lg" leadingIcon={Copy} onClick={() => void copyShareLink()}>
            {STREAM_DETAIL.action.copyShareLink}
          </Button>
        );
      }
    }
    return null;
  })();

  const notices: ReactNode[] = [];
  if (stream.status === 'PENDING' && role === 'sender') {
    const created = formatDate(stream.created_at) ?? '';
    notices.push(
      <Notice key="not-funded" tone="warning" title={STREAM_DETAIL.notice.notFundedTitle}>
        <p>
          {STREAM_DETAIL.notice.notFundedSender(money(stream.total_amount, asset), recipientShort)}
        </p>
        <p className="mt-1">
          {stream.batch_id
            ? STREAM_DETAIL.notice.notFundedBatch(created)
            : STREAM_DETAIL.notice.notFundedSingle}
        </p>
      </Notice>
    );
  }
  if (stream.status === 'PENDING' && role === 'recipient') {
    notices.push(
      <Notice key="not-funded" tone="info" title={STREAM_DETAIL.notice.notFundedTitle}>
        {STREAM_DETAIL.notice.notFundedRecipient}
      </Notice>
    );
  }
  if (isPaused && role !== 'sender') {
    notices.push(
      <Notice key="paused" tone="warning" title={STREAM_DETAIL.notice.pausedTitle}>
        {STREAM_DETAIL.notice.pausedRecipient}
      </Notice>
    );
  }
  if (isPaused && role === 'sender') {
    notices.push(
      <Notice key="paused" tone="warning" title={STREAM_DETAIL.notice.pausedTitle}>
        {STREAM_DETAIL.notice.pausedSender(recipientShort)}
      </Notice>
    );
  }
  if (deferredUntil && role === 'recipient' && isActive) {
    notices.push(
      <Notice
        key="deferred"
        tone="info"
        title={STREAM_DETAIL.notice.deferredTitle(formatDate(deferredUntil) ?? '')}
      >
        {STREAM_DETAIL.notice.deferred(formatDateTime(deferredUntil, { withZone: true }) ?? '')}
      </Notice>
    );
  }
  if (stream.vault_id) {
    notices.push(
      <Notice
        key="vault"
        tone="neutral"
        title={STREAM_DETAIL.notice.vaultTitle}
        action={
          <ButtonLink variant="link" standalone to={`/vaults/${stream.vault_id}`}>
            {STREAM_DETAIL.notice.openVault}
          </ButtonLink>
        }
      >
        {role === 'sender' ? STREAM_DETAIL.notice.vaultSender : STREAM_DETAIL.notice.vaultOther}
      </Notice>
    );
  }

  const scheduleLine = (() => {
    const end = stream.end_time ? formatDate(stream.end_time) : null;
    if (isRecurring && stream.refillable) return STREAM_DETAIL.schedule.noEnd;
    if (stream.stream_type === 'LINEAR' && end) {
      const wait = hasWait(stream) ? formatDate(stream.cliff_timestamp) : null;
      return wait
        ? STREAM_DETAIL.schedule.linearWait(wait, end)
        : STREAM_DETAIL.schedule.linear(end);
    }
    if (stream.stream_type === 'HYBRID' && end && stream.hybrid_unlock_time) {
      const date = formatDate(stream.hybrid_unlock_time);
      if (date)
        return STREAM_DETAIL.schedule.upfront(
          money(stream.hybrid_upfront_amount ?? 0, asset),
          date,
          end
        );
    }
    return null;
  })();

  const pausedSince = stream.pause_started_at ? formatDate(stream.pause_started_at) : null;
  const pausedScheduleLine = pausedSince
    ? STREAM_DETAIL.schedule.pausedSince(pausedSince)
    : STREAM_DETAIL.schedule.paused;

  const interval = stream.interval_seconds ? formatInterval(stream.interval_seconds) : null;
  const details = [
    {
      label: STREAM_DETAIL.details.from,
      value: <Address value={stream.sender} isYou={role === 'sender'} />,
    },
    {
      label: STREAM_DETAIL.details.to,
      value: <Address value={stream.recipient} isYou={role === 'recipient'} />,
    },
    {
      label: STREAM_DETAIL.details.paidIn,
      value: <AssetName asset={asset} />,
    },
    { label: STREAM_DETAIL.details.schedule, value: scheduleName(stream) },
    ...(interval && (isRecurring || stream.stream_type === 'STEP')
      ? [
          {
            label: STREAM_DETAIL.details.howOften,
            value: interval.charAt(0).toUpperCase() + interval.slice(1),
          },
        ]
      : []),
    ...(each !== null
      ? [
          {
            label: STREAM_DETAIL.details.eachRelease,
            value: <Amount value={amountText(each, asset)} asset={asset} />,
          },
        ]
      : []),
    {
      label: STREAM_DETAIL.details.starts,
      value: formatDateTime(stream.start_time, { withZone: true }),
    },
    ...(waitEnd
      ? [
          {
            label:
              stream.stream_type === 'HYBRID'
                ? STREAM_DETAIL.details.upfront
                : STREAM_DETAIL.details.waitUntil,
            value: formatDateTime(waitEnd, { withZone: true }),
          },
        ]
      : []),
    {
      label: STREAM_DETAIL.details.ends,
      value:
        isRecurring && stream.refillable
          ? STREAM_DETAIL.details.noEnd
          : formatDateTime(stream.end_time ?? null, { withZone: true }),
    },
    {
      label: STREAM_DETAIL.details.canPause,
      value: stream.cancelable ? STREAM_DETAIL.details.yes : STREAM_DETAIL.details.no,
    },
    ...(isRecurring
      ? [
          {
            label: STREAM_DETAIL.details.canAddFunds,
            value: stream.refillable ? STREAM_DETAIL.details.yes : STREAM_DETAIL.details.no,
          },
        ]
      : [
          {
            label: STREAM_DETAIL.details.canChangeRecipient,
            value: stream.transferable ? STREAM_DETAIL.details.yes : STREAM_DETAIL.details.no,
          },
        ]),
    {
      label: STREAM_DETAIL.details.listedUnder,
      value: stream.vault_id ? (
        <ButtonLink variant="link" to={`/vaults/${stream.vault_id}`}>
          {STREAM_DETAIL.details.vault}
        </ButtonLink>
      ) : (
        STREAM_DETAIL.details.notListed
      ),
    },
    {
      label: STREAM_DETAIL.details.reference,
      value: (
        <span className="inline-flex items-center gap-1">
          <Code>{stream.stream_id}</Code>
          <CopyButton value={stream.stream_id} label={STREAM_DETAIL.details.copyReference} />
        </span>
      ),
    },
  ];

  const recipientName = recipientShort;
  const whoLine =
    role === 'recipient'
      ? !stream.cancelable
        ? STREAM_DETAIL.who.youFixed
        : isRecurring
          ? STREAM_DETAIL.who.youRecurring
          : STREAM_DETAIL.who.youCancelable
      : !stream.cancelable
        ? STREAM_DETAIL.who.fixed(recipientName)
        : isRecurring
          ? STREAM_DETAIL.who.recurringCancelable(recipientName)
          : STREAM_DETAIL.who.cancelable(recipientName);

  const manageActions: ManageAction[] = [
    ...(canPause ? [{ key: 'pause', label: STREAM_DETAIL.manage.pause, onClick: () => setReview('pause') }] : []),
    ...(canResume ? [{ key: 'resume', label: STREAM_DETAIL.manage.resume, onClick: () => setReview('resume') }] : []),
    ...(canChangeRecipient
      ? [
          {
            key: 'recipient',
            label: STREAM_DETAIL.manage.changeRecipient,
            onClick: () => {
              setNewRecipient('');
              setRecipientChecked(false);
              setRecipientDialog(true);
            },
          },
        ]
      : []),
    ...(canCancel
      ? [{ key: 'cancel', label: STREAM_DETAIL.manage.cancel, danger: true, onClick: () => setReview('cancel') }]
      : []),
  ];

  const roleLine =
    role === 'sender'
      ? STREAM_DETAIL.roleLine.sender(recipientShort)
      : role === 'recipient'
        ? STREAM_DETAIL.roleLine.recipient(senderShort)
        : STREAM_DETAIL.roleLine.viewer(senderShort, recipientShort);
  const created = formatDate(stream.created_at);

  const recipientSame = sameAddress(newRecipient, stream.recipient);
  const recipientReason =
    !recipientValid || recipientSame
      ? STREAM_DETAIL.recipientDialog.needsAddress
      : !recipientChecked
        ? STREAM_DETAIL.recipientDialog.needsCheck
        : null;

  const addValue = Number(addAmount);
  const addValid = Number.isFinite(addValue) && addValue > 0 && (each === null || addValue >= each);
  const addError =
    addAmount.trim() === ''
      ? undefined
      : !Number.isFinite(addValue) || addValue <= 0
        ? STREAM_DETAIL.addFundsDialog.invalid
        : each !== null && addValue < each
          ? STREAM_DETAIL.addFundsDialog.tooSmall(money(each, asset))
          : undefined;
  const addPayments = each !== null && addValid ? Math.floor(addValue / each + 1e-9) : null;

  const reviewProps = (() => {
    const base = { network } as const;
    switch (review) {
      case 'fund':
        return {
          title: STREAM_DETAIL.review.fund.title,
          plan: plan ? (
            <PlanSentence recipient={{ address: stream.recipient }} schedule={plan} />
          ) : undefined,
          consequence: isToken
            ? { tone: 'info' as const, body: STREAM_DETAIL.review.fund.twoSteps }
            : undefined,
          summary: {
            ...base,
            direction: 'out',
            leavesWallet: { amount: amountText(stream.total_amount, asset), asset },
            goesTo: { address: stream.recipient },
          } satisfies ReviewSummary,
          steps: isToken ? 2 : 1,
          run: runWith(() => fundStreamContract(wallet, stream.id), isToken ? 2 : 1),
          next: <p>{STREAM_DETAIL.review.fund.next(recipientShort)}</p>,
        };
      case 'claim':
        return {
          summary: {
            ...base,
            direction: 'in',
            youReceive: { amount: amountText(ready, asset), asset },
            from: { address: stream.sender },
            whoCanStop: STREAM_DETAIL.review.claim.who,
          } satisfies ReviewSummary,
          run: runWith(() => claimStreamFunds(wallet, stream.id)),
          next: <p>{STREAM_DETAIL.review.claim.next}</p>,
        };
      case 'cancel':
        return {
          title: STREAM_DETAIL.review.cancel.title,
          consequence: {
            tone: 'danger' as const,
            body: isRecurring
              ? STREAM_DETAIL.review.cancel.recurring
              : releasedNotClaimed > 0
                ? STREAM_DETAIL.review.cancel.vesting(
                    recipientShort,
                    money(releasedNotClaimed, asset),
                    money(unreleased, asset)
                  )
                : STREAM_DETAIL.review.cancel.vestingAllBack(money(unreleased, asset)),
          },
          confirmLabel: STREAM_DETAIL.review.cancel.confirm,
          keepLabel: STREAM_DETAIL.review.cancel.keep,
          summary: (isRecurring
            ? {
                ...base,
                direction: 'returns',
                comesBack: { amount: amountText(notClaimed, asset), asset },
              }
            : {
                ...base,
                direction: 'returns',
                comesBack: { amount: amountText(unreleased, asset), asset },
                recipientKeeps:
                  releasedNotClaimed > 0
                    ? { amount: amountText(releasedNotClaimed, asset), asset }
                    : undefined,
              }) satisfies ReviewSummary,
          run: runWith(() => cancelStreamOnChain(wallet, stream.id)),
          next: <p>{STREAM_DETAIL.review.cancel.next}</p>,
        };
      case 'pause':
        return {
          title: STREAM_DETAIL.review.pause.title,
          consequence: {
            tone: 'warning' as const,
            body: STREAM_DETAIL.review.pause.body(recipientShort),
          },
          confirmLabel: STREAM_DETAIL.review.pause.confirm,
          keepLabel: STREAM_DETAIL.review.pause.keep,
          summary: { ...base, direction: 'fee-only' } satisfies ReviewSummary,
          run: runWith(() => pauseStreamOnChain(wallet, stream.id)),
          next: <p>{STREAM_DETAIL.review.pause.next}</p>,
        };
      case 'resume':
        return {
          confirmLabel: STREAM_DETAIL.review.resume.confirm,
          summary: { ...base, direction: 'fee-only' } satisfies ReviewSummary,
          run: runWith(() => resumeStreamOnChain(wallet, stream.id)),
          next: <p>{STREAM_DETAIL.review.resume.next}</p>,
        };
      case 'recipient':
        return {
          title: STREAM_DETAIL.review.recipient.title,
          consequence: {
            tone: 'danger' as const,
            body: (
              <div className="flex flex-col gap-2">
                <p>{STREAM_DETAIL.review.recipient.body}</p>
                <p>
                  {STREAM_DETAIL.review.recipient.amounts(money(ready, asset), money(later, asset))}
                </p>
                <div>
                  <p className="text-ink-secondary">{STREAM_DETAIL.review.recipient.newAddress}</p>
                  <Address value={newRecipient.trim()} variant="full" />
                </div>
              </div>
            ),
          },
          confirmLabel: STREAM_DETAIL.review.recipient.confirm,
          keepLabel: STREAM_DETAIL.review.recipient.keep,
          summary: { ...base, direction: 'fee-only' } satisfies ReviewSummary,
          run: runWith(() => transferStreamOnChain(wallet, stream.id, newRecipient.trim())),
          next: <p>{STREAM_DETAIL.review.recipient.next}</p>,
        };
      case 'addFunds':
        return {
          summary: {
            ...base,
            direction: 'out',
            leavesWallet: { amount: addAmount, asset },
            goesTo: { address: stream.recipient },
          } satisfies ReviewSummary,
          run: runWith(() => refillStreamOnChain(wallet, stream.id, addValue)),
          next: (
            <p>
              {addPayments !== null
                ? STREAM_DETAIL.addFundsDialog.preview(addPayments)
                : STREAM_DETAIL.review.addFunds.next}
            </p>
          ),
        };
      default:
        return null;
    }
  })();

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={roleLine}
        breadcrumbs={[{ label: STREAM_DETAIL.breadcrumb, to: '/streams' }, { label: title }]}
        status={status ?? undefined}
        role={role}
        plan={
          role === 'sender' && plan ? (
            <PlanSentence recipient={{ address: stream.recipient }} schedule={plan} />
          ) : undefined
        }
        stateLine={[created ? STREAM_DETAIL.stateLine.created(created) : null, ROLE_LINES[role]]
          .filter(Boolean)
          .join(' · ')}
      />

      <TwoColumn
        main={
          <>
            {notices}
            <Card as="section">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <p className="text-label text-ink-secondary">
                    {role === 'recipient'
                      ? STREAM_DETAIL.action.readyLabel
                      : STREAM_DETAIL.action.releasedLabel}
                  </p>
                  <Amount
                    value={amountText(role === 'recipient' ? ready : releasedSoFar, asset)}
                    asset={asset}
                    size="xl"
                  />
                  <p className="text-small text-ink-muted">
                    {STREAM_DETAIL.action.ofTotal(money(stream.total_amount, asset))}
                  </p>
                </div>
                <ReleaseBar
                  asset={asset}
                  claimed={amountText(claimed, asset)}
                  ready={amountText(ready, asset)}
                  later={amountText(later, asset)}
                />
                {primaryAction ? (
                  <div className="flex flex-wrap items-center gap-3">{primaryAction}</div>
                ) : null}
                {role === 'recipient' && isActive ? (
                  <p className="text-small text-ink-muted">{STREAM_DETAIL.action.claimLag}</p>
                ) : null}
              </div>
            </Card>

            <Panel title={STREAM_DETAIL.schedule.heading}>
              {scheduleLine ? <p className="text-body text-ink-secondary">{scheduleLine}</p> : null}
              {isPaused ? (
                <p className="text-body text-ink-secondary">{pausedScheduleLine}</p>
              ) : blocks.length > 0 ? (
                <>
                  <ScheduleTimeline asset={asset} blocks={blocks} now={nowMs} continuous={isContinuous(stream)} />
                </>
              ) : (
                <p className="text-body text-ink-secondary">{STREAM_DETAIL.schedule.empty}</p>
              )}
            </Panel>

            <Panel title={STREAM_DETAIL.activityHeading}>
              <ActivityList
                events={events
                  .slice(0, ACTIVITY_SHOWN)
                  .map((event) => toActivity(event, asset, address))}
                state="ready"
                network={network}
                seeAllHref="/explorer?scope=personal&type=stream"
              />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={STREAM_DETAIL.detailsHeading}>
              <DetailList items={details} />
            </Panel>
            <Card as="section">
              <div className="flex flex-col gap-2">
                <Heading level="item" as="h2">
                  {STREAM_DETAIL.whoHeading}
                </Heading>
                <p className="text-body text-ink-secondary">{whoLine}</p>
              </div>
            </Card>
            {manageActions.length > 0 ? (
              <Card as="section">
                <div className="flex flex-col gap-3">
                  <Heading level="item" as="h2">
                    {STREAM_DETAIL.manageHeading}
                  </Heading>
                  <ManageActions actions={manageActions} />
                </div>
              </Card>
            ) : null}
          </>
        }
      />

      <Dialog
        open={recipientDialog}
        onClose={() => setRecipientDialog(false)}
        title={STREAM_DETAIL.recipientDialog.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRecipientDialog(false)}>
              {STREAM_DETAIL.recipientDialog.cancel}
            </Button>
            {recipientReason ? (
              <Button variant="primary" disabled disabledReason={recipientReason}>
                {STREAM_DETAIL.recipientDialog.continue}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  setRecipientDialog(false);
                  setReview('recipient');
                }}
              >
                {STREAM_DETAIL.recipientDialog.continue}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <AddressInput
            label={STREAM_DETAIL.recipientDialog.address}
            value={newRecipient}
            onChange={setNewRecipient}
            onValidChange={setRecipientValid}
            network={network}
            helper={STREAM_DETAIL.recipientDialog.helper}
            error={recipientSame ? STREAM_DETAIL.recipientDialog.sameAddress : undefined}
          />
          {ready > 0 ? (
            <p className="text-small text-ink-secondary">
              {STREAM_DETAIL.review.recipient.claimFirst(money(ready, asset))}
            </p>
          ) : null}
          <Checkbox
            label={STREAM_DETAIL.recipientDialog.check}
            description={STREAM_DETAIL.recipientDialog.checkLine}
            checked={recipientChecked}
            onChange={setRecipientChecked}
          />
        </div>
      </Dialog>

      <Dialog
        open={addFundsDialog}
        onClose={() => setAddFundsDialog(false)}
        title={STREAM_DETAIL.addFundsDialog.title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddFundsDialog(false)}>
              {STREAM_DETAIL.addFundsDialog.cancel}
            </Button>
            {addValid ? (
              <Button
                variant="primary"
                onClick={() => {
                  setAddFundsDialog(false);
                  setReview('addFunds');
                }}
              >
                {STREAM_DETAIL.addFundsDialog.continue}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled
                disabledReason={STREAM_DETAIL.addFundsDialog.needsAmount}
              >
                {STREAM_DETAIL.addFundsDialog.continue}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <AmountInput
            label={STREAM_DETAIL.addFundsDialog.amount}
            asset={asset}
            value={addAmount}
            onChange={setAddAmount}
            helper={
              each !== null
                ? STREAM_DETAIL.addFundsDialog.helper(money(each, asset))
                : STREAM_DETAIL.addFundsDialog.helperPlain
            }
            error={addError}
          />
          {addPayments !== null && addPayments > 0 ? (
            <p role="status" className="text-small text-ink-secondary">
              {STREAM_DETAIL.addFundsDialog.preview(addPayments)}
            </p>
          ) : null}
        </div>
      </Dialog>

      {reviewProps ? (
        <TransactionReview
          key={review ?? 'none'}
          open
          onClose={() => setReview(null)}
          {...reviewProps}
        />
      ) : null}
    </PageContainer>
  );
}
