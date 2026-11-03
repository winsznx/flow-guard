import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { AssetName } from '../components/ui/AssetName';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { CopyField } from '../components/ui/CopyField';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { Heading } from '../components/ui/Heading';
import { ManageActions } from '../components/ui/ManageActions';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { ReleaseBar } from '../components/ui/ReleaseBar';
import { ScheduleTimeline } from '../components/ui/ScheduleTimeline';
import { Skeleton } from '../components/ui/Skeleton';
import { TransactionReview } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { useNetwork, type Network } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { sameWallet } from '../utils/address';
import { LABELS, MOMENTS } from '../copy/common';
import { errorMessage } from '../copy/errors';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { assetDecimals, formatAddress, formatAmount, formatDate } from '../copy/format';
import {
  CREATE_PAYMENT,
  INTERVAL_DAYS,
  INTERVAL_WORD,
  PAYMENT_DETAIL,
  paymentFrom,
  paymentTo,
  paymentsCount,
  type PaymentInterval,
} from '../copy/payments';
import { lifecycleStatus, type StatusKey } from '../copy/status';
import {
  cancelPaymentOnChain,
  claimPaymentFunds,
  fundPaymentContract,
  pausePaymentOnChain,
  resumePaymentOnChain,
} from '../utils/blockchain';
import { getCachedTokenMeta } from '../utils/tokenMeta';

interface PaymentRecord {
  id: string;
  payment_id?: string | null;
  sender: string;
  recipient: string;
  recipient_name?: string | null;
  token_type: string;
  token_category?: string | null;
  token_decimals?: number | null;
  amount_per_period: number;
  interval: PaymentInterval;
  interval_seconds?: number | null;
  start_date: number;
  end_date?: number | null;
  next_payment_date: number;
  total_paid: number;
  payment_count: number;
  status: string;
  contract_address?: string | null;
  tx_hash?: string | null;
}

interface StoredEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  tx_hash: string | null;
  created_at: number;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'missing' }
  | { kind: 'ready'; payment: PaymentRecord; events: StoredEvent[] };

type Review = 'fund' | 'claim' | 'pause' | 'resume' | 'cancel' | null;
type Role = 'sender' | 'recipient' | 'viewer';

const BCH: Asset = { kind: 'bch' };
const DAY_SECONDS = 86_400;
const NO_END_PAYMENTS = 12;
const CLAIM_LAG_SECONDS = 7_200;
const MAX_TIMELINE_BLOCKS = 36;
const POLL_ATTEMPTS = 8;
const ACTIVITY_LIMIT = 8;
const POLL_DELAY_MS = 1_500;
/** Server defaults in backend fundingConfig.ts: 5,000 satoshis on top of a BCH contract, 20,000 satoshis of BCH in a token contract. */
const BCH_CONTRACT_RESERVE = '0.00005';
const TOKEN_CONTRACT_BCH = '0.0002';

function paymentAsset(payment: PaymentRecord): Asset {
  if (payment.token_type === 'BCH' || !payment.token_category) return BCH;
  const meta = getCachedTokenMeta(payment.token_category);
  return {
    kind: 'token',
    tokenId: payment.token_category,
    symbol: meta?.symbol,
    decimals: payment.token_decimals ?? meta?.decimals ?? 0,
  };
}

function stepSeconds(payment: PaymentRecord): number {
  return Number(payment.interval_seconds) || INTERVAL_DAYS[payment.interval] * DAY_SECONDS;
}

function totalPayments(payment: PaymentRecord): number {
  const step = stepSeconds(payment);
  if (payment.end_date && payment.end_date > payment.start_date) {
    return Math.max(1, Math.ceil((payment.end_date - payment.start_date) / step));
  }
  return NO_END_PAYMENTS;
}

function dueCount(payment: PaymentRecord, nowSeconds: number): number {
  const left = Math.max(0, totalPayments(payment) - Number(payment.payment_count || 0));
  const claimableFrom = nowSeconds - CLAIM_LAG_SECONDS;
  if (left === 0 || claimableFrom < payment.next_payment_date) return 0;
  return Math.min(left, Math.floor((claimableFrom - payment.next_payment_date) / stepSeconds(payment)) + 1);
}

/** Display-unit string with the asset's decimals, so totals never pass through float rounding twice. */
function units(value: number, asset: Asset): string {
  return Math.max(0, value).toFixed(assetDecimals(asset));
}

function deriveStatus(payment: PaymentRecord, role: Role, nowSeconds: number): StatusKey {
  const base = lifecycleStatus(payment.status, { startsAt: payment.start_date * 1000, now: nowSeconds * 1000 }) ?? 'active';
  if (base !== 'active' && base !== 'scheduled') return base;
  if (Number(payment.payment_count) >= totalPayments(payment)) return 'finished';
  if (role === 'recipient' && base === 'active' && dueCount(payment, nowSeconds) > 0) return 'readyToClaim';
  return base;
}

function toActivity(
  events: StoredEvent[],
  viewer: string | null | undefined,
  asset: Asset,
  recipient: { address: string; name?: string | null },
  network: Network,
): ActivityEvent[] {
  return events.map((event) => ({
    id: event.id,
    kind: toEventKind(event.event_type),
    object: { kind: 'payment' },
    at: event.created_at * 1000,
    actor: event.actor
      ? {
          address: event.actor,
          isYou: sameWallet(event.actor, viewer, network),
          name:
            sameWallet(event.actor, recipient.address, network) && !sameWallet(event.actor, viewer, network)
              ? recipient.name?.trim() || undefined
              : undefined,
        }
      : undefined,
    amount: event.amount !== null && event.amount !== undefined ? { value: event.amount, asset } : undefined,
    txid: event.tx_hash ?? undefined,
  }));
}

async function fetchPayment(id: string): Promise<Load> {
  const response = await fetch(`/api/payments/${encodeURIComponent(id)}`);
  if (response.status === 404 || response.status === 400) return { kind: 'missing' };
  if (!response.ok) throw new Error(`Payment request failed with ${response.status}`);
  const data: { payment?: PaymentRecord; events?: StoredEvent[] } = await response.json();
  if (!data.payment) return { kind: 'missing' };
  return { kind: 'ready', payment: data.payment, events: data.events ?? [] };
}

export default function PaymentDetailPage() {
  const { id = '' } = useParams();
  const wallet = useWallet();
  const network = useNetwork();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [review, setReview] = useState<Review>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async (): Promise<PaymentRecord | null> => {
    try {
      const next = await fetchPayment(id);
      setLoad(next);
      return next.kind === 'ready' ? next.payment : null;
    } catch (error) {
      console.error('Recurring payment did not load', error);
      setLoad((current) => (current.kind === 'ready' ? current : { kind: 'failed' }));
      return null;
    }
  }, [id]);

  const retry = useCallback(async () => {
    setLoad({ kind: 'loading' });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    void retry();
  }, [retry]);

  const waitForFunding = useCallback(async () => {
    setSyncing(true);
    try {
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        const latest = await refresh();
        if (latest && latest.status !== 'PENDING') return;
        await new Promise((resolve) => window.setTimeout(resolve, POLL_DELAY_MS));
      }
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const closeReview = () => {
    setReview(null);
    void refresh();
  };

  const breadcrumbs = [{ label: PAYMENT_DETAIL.back, to: '/payments' }];

  if (load.kind === 'loading') {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6" aria-busy="true" aria-label={PAYMENT_DETAIL.loading}>
          <Skeleton kind="text" lines={3} />
          <Skeleton kind="tile" />
          <Skeleton kind="row" lines={4} />
        </div>
      </PageContainer>
    );
  }

  if (load.kind === 'failed' || load.kind === 'missing') {
    const copy = load.kind === 'failed' ? PAYMENT_DETAIL.loadFailed : PAYMENT_DETAIL.notFound;
    return (
      <PageContainer>
        <Panel>
          <ErrorState
            title={copy.title}
            reason={copy.reason}
            onRetry={load.kind === 'failed' ? retry : undefined}
            action={
              load.kind === 'missing' ? (
                <ButtonLink variant="secondary" to="/payments">
                  {PAYMENT_DETAIL.backToList}
                </ButtonLink>
              ) : undefined
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const { payment, events } = load;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const asset = paymentAsset(payment);
  const role: Role = sameWallet(wallet.address, payment.sender, network)
    ? 'sender'
    : sameWallet(wallet.address, payment.recipient, network)
      ? 'recipient'
      : 'viewer';
  const status = deriveStatus(payment, role, nowSeconds);
  const step = stepSeconds(payment);
  const everyDays = Math.max(1, Math.round(step / DAY_SECONDS));
  const count = totalPayments(payment);
  const paidCount = Math.min(count, Number(payment.payment_count || 0));
  const perPayment = Number(payment.amount_per_period || 0);
  const total = perPayment * count;
  const claimed = Number(payment.total_paid || 0);
  const dueNow = payment.status === 'ACTIVE' ? dueCount(payment, nowSeconds) : 0;
  const ready = dueNow * perPayment;
  const later = Math.max(0, total - claimed - ready);
  const firstPayment = payment.next_payment_date - paidCount * step;
  const lastPayment = firstPayment + (count - 1) * step;
  const recipientShort = formatAddress(payment.recipient);
  const senderShort = formatAddress(payment.sender);
  const recipientLabel = payment.recipient_name?.trim() || recipientShort;
  const title = role === 'recipient' ? paymentFrom(senderShort) : payment.recipient_name?.trim() || paymentTo(recipientShort);
  const money = (value: number) => formatAmount(units(value, asset), asset);
  const perText = money(perPayment) ?? '';
  const totalText = money(total);
  const backText = money(Math.max(0, total - claimed));
  const claimedText = money(claimed);
  const nextDate = formatDate(payment.next_payment_date);
  const pageUrl = typeof window !== 'undefined' ? window.location.href : `/payments/${payment.id}`;
  const funded = payment.status !== 'PENDING';
  const live = payment.status === 'ACTIVE' || payment.status === 'PAUSED';

  const plan = (
    <PlanSentence
      recipient={{ address: payment.recipient, name: payment.recipient_name ?? undefined }}
      schedule={{
        kind: 'recurring',
        perRelease: units(perPayment, asset),
        asset,
        everyDays,
        count,
        start: firstPayment * 1000,
      }}
    />
  );

  const description =
    role === 'sender'
      ? PAYMENT_DETAIL.description.sender(recipientLabel)
      : role === 'recipient'
        ? PAYMENT_DETAIL.description.recipient(senderShort)
        : PAYMENT_DETAIL.description.viewer(senderShort, recipientLabel);

  const stateParts = [paymentsCount(paidCount, count)];
  if ((status === 'active' || status === 'scheduled' || status === 'readyToClaim') && nextDate && perText) {
    stateParts.push(PAYMENT_DETAIL.nextState(perText, nextDate));
  }

  const blocks = Array.from({ length: count }, (_, index) => {
    const at = firstPayment + index * step;
    const state: 'claimed' | 'ready' | 'later' =
      index < paidCount ? 'claimed' : payment.status === 'ACTIVE' && at + CLAIM_LAG_SECONDS <= nowSeconds ? 'ready' : 'later';
    return { at: at * 1000, amount: units(perPayment, asset), state };
  });

  const stateNotice = (() => {
    if (status === 'notFunded') {
      return (
        <Notice tone="warning" title={PAYMENT_DETAIL.notFundedNotice.title}>
          {role === 'sender'
            ? PAYMENT_DETAIL.notFundedNotice.sender(
                recipientLabel,
                formatDate(payment.start_date) ?? '',
                payment.start_date <= nowSeconds,
              )
            : PAYMENT_DETAIL.notFundedNotice.others}
        </Notice>
      );
    }
    if (status === 'paused') {
      const body =
        role === 'recipient'
          ? PAYMENT_DETAIL.pausedNotice.recipient
          : role === 'sender'
            ? PAYMENT_DETAIL.pausedNotice.sender(recipientLabel)
            : PAYMENT_DETAIL.pausedNotice.viewer;
      return (
        <Notice tone="warning" title={PAYMENT_DETAIL.pausedNotice.title}>
          {body}
        </Notice>
      );
    }
    if (status === 'cancelled') return <Notice tone="neutral" title={PAYMENT_DETAIL.cancelledNotice} />;
    if (status === 'finished') return <Notice tone="neutral" title={PAYMENT_DETAIL.finishedNotice} />;
    return null;
  })();

  const action = (() => {
    if (role === 'sender' && status === 'notFunded' && !payment.contract_address) {
      return <Notice tone="danger" title={errorMessage('MISCONFIGURED')} />;
    }
    if (role === 'sender' && status === 'notFunded') {
      return (
        <div className="flex flex-col gap-2">
          <div>
            <Button variant="primary" size="lg" onClick={() => setReview('fund')}>
              {totalText ? PAYMENT_DETAIL.fund(totalText) : PAYMENT_DETAIL.fundGeneric}
            </Button>
          </div>
          <p className="text-small text-ink-secondary">
            {totalText ? CREATE_PAYMENT.next(totalText) : CREATE_PAYMENT.nextUnknown}
          </p>
        </div>
      );
    }
    if (role === 'recipient' && dueNow > 0 && perText) {
      return (
        <div className="flex flex-col gap-2">
          <div>
            <Button variant="primary" size="lg" onClick={() => setReview('claim')}>
              {PAYMENT_DETAIL.claim(perText)}
            </Button>
          </div>
          {dueNow > 1 ? <p className="text-small text-ink-secondary">{PAYMENT_DETAIL.manyDue(dueNow)}</p> : null}
        </div>
      );
    }
    if (role === 'recipient' && (status === 'active' || status === 'scheduled')) {
      return (
        <p className="text-body text-ink-secondary">
          {nextDate && perText ? PAYMENT_DETAIL.nextLine(perText, nextDate) : PAYMENT_DETAIL.noNext}
        </p>
      );
    }
    if (role === 'sender' && live) {
      return (
        <div className="flex flex-col gap-2">
          <Heading level="item" as="h2">{PAYMENT_DETAIL.share.title}</Heading>
          <p className="text-small text-ink-secondary">{PAYMENT_DETAIL.share.body(recipientLabel)}</p>
          <CopyField label={PAYMENT_DETAIL.share.field} value={pageUrl} />
        </div>
      );
    }
    return null;
  })();

  const headline = role === 'recipient' && ready > 0 ? { label: PAYMENT_DETAIL.readyToClaim, value: ready } : { label: PAYMENT_DETAIL.eachPayment, value: perPayment };

  const main = (
    <>
      <Panel>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-label text-ink-secondary">{headline.label}</span>
            <Amount value={units(headline.value, asset)} asset={asset} size="xl" />
          </div>
          <ReleaseBar asset={asset} claimed={units(claimed, asset)} ready={units(ready, asset)} later={units(later, asset)} />
          {syncing ? <Notice tone="info" title={MOMENTS.sentPending} live="polite" /> : null}
          {stateNotice}
          {action}
        </div>
      </Panel>
      <Panel title={PAYMENT_DETAIL.schedule}>
        {count <= MAX_TIMELINE_BLOCKS ? (
          <ScheduleTimeline asset={asset} blocks={blocks} now={nowSeconds * 1000} />
        ) : (
          <p className="text-body text-ink-secondary">
            {PAYMENT_DETAIL.scheduleTooLong(count, INTERVAL_WORD[payment.interval])}
          </p>
        )}
      </Panel>
      <Panel title={PAYMENT_DETAIL.activity}>
        <ActivityList
          events={toActivity(
            events.slice(0, ACTIVITY_LIMIT),
            wallet.address,
            asset,
            { address: payment.recipient, name: payment.recipient_name },
            network,
          )}
          state="ready"
          network={network}
          seeAllHref={events.length > ACTIVITY_LIMIT ? '/explorer' : undefined}
        />
      </Panel>
    </>
  );

  const details = [
    { label: PAYMENT_DETAIL.detailLabels.from, value: <Address value={payment.sender} isYou={role === 'sender'} /> },
    {
      label: PAYMENT_DETAIL.detailLabels.to,
      value: (
        <Address
          value={payment.recipient}
          name={role === 'recipient' ? undefined : payment.recipient_name ?? undefined}
          isYou={role === 'recipient'}
        />
      ),
    },
    { label: PAYMENT_DETAIL.detailLabels.token, value: <AssetName asset={asset} /> },
    { label: PAYMENT_DETAIL.detailLabels.each, value: <Amount value={units(perPayment, asset)} asset={asset} /> },
    { label: PAYMENT_DETAIL.detailLabels.howOften, value: INTERVAL_WORD[payment.interval] },
    { label: PAYMENT_DETAIL.detailLabels.starts, value: formatDate(payment.start_date) },
    { label: PAYMENT_DETAIL.detailLabels.firstPayment, value: formatDate(firstPayment) },
    { label: PAYMENT_DETAIL.detailLabels.lastPayment, value: formatDate(lastPayment) },
    { label: PAYMENT_DETAIL.detailLabels.payments, value: String(count) },
    { label: PAYMENT_DETAIL.detailLabels.canStop, value: PAYMENT_DETAIL.canStopValue },
    {
      label: PAYMENT_DETAIL.detailLabels.contract,
      value: payment.contract_address ? <Address value={payment.contract_address} /> : null,
    },
    {
      label: PAYMENT_DETAIL.detailLabels.funding,
      value: funded && payment.tx_hash ? <TxLink txid={payment.tx_hash} network={network} /> : null,
    },
  ];

  const side = (
    <>
      <Panel title={PAYMENT_DETAIL.details}>
        <DetailList items={details} />
      </Panel>
      <Card>
        <div className="flex flex-col gap-2">
          <Heading level="item" as="h2">
            {LABELS.whoCanMoveTheMoney}
          </Heading>
          <p className="text-small text-ink-secondary">
            {role === 'recipient'
              ? PAYMENT_DETAIL.whoCanMoveYou
              : role === 'sender'
                ? PAYMENT_DETAIL.whoCanMoveSender(recipientLabel)
                : PAYMENT_DETAIL.whoCanMove(recipientLabel)}
          </p>
        </div>
      </Card>
      {role === 'sender' && live ? (
        <Card>
          <div className="flex flex-col gap-3">
            <Heading level="item" as="h2">
              {PAYMENT_DETAIL.manage}
            </Heading>
            <ManageActions
              actions={[
                payment.status === 'ACTIVE'
                  ? { key: 'pause', label: PAYMENT_DETAIL.pause, onClick: () => setReview('pause') }
                  : { key: 'resume', label: PAYMENT_DETAIL.resume, onClick: () => setReview('resume') },
                { key: 'cancel', label: PAYMENT_DETAIL.cancel, danger: true, onClick: () => setReview('cancel') },
              ]}
            />
          </div>
        </Card>
      ) : null}
    </>
  );

  const reserveText = formatAmount(asset.kind === 'bch' ? BCH_CONTRACT_RESERVE : TOKEN_CONTRACT_BCH, BCH);

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[...breadcrumbs, { label: title }]}
        status={status}
        role={role}
        plan={role === 'sender' ? plan : undefined}
        stateLine={stateParts.join(' · ')}
      />
      <TwoColumn main={main} side={side} />

      {payment.contract_address ? (
        <TransactionReview
          open={review === 'fund'}
          onClose={closeReview}
          plan={plan}
          steps={asset.kind === 'token' ? 2 : 1}
          summary={{
            direction: 'out',
            leavesWallet: { amount: units(total, asset), asset },
            goesTo: { address: payment.contract_address, name: PAYMENT_DETAIL.review.contractName },
            feeEstimate: reserveText ? PAYMENT_DETAIL.review.reserveFee(reserveText) : null,
            network,
          }}
          run={async (report) => {
            const result = await fundPaymentContract(wallet, payment.id);
            if (result.confirmation === 'confirmed') report({ step: 'confirmed', status: 'done' });
            else void waitForFunding();
            return { txid: result.txHash };
          }}
          next={PAYMENT_DETAIL.review.fundedNext(recipientLabel)}
        />
      ) : null}
      <TransactionReview
        open={review === 'claim'}
        onClose={closeReview}
        summary={{
          direction: 'in',
          youReceive: { amount: units(perPayment, asset), asset },
          from: { address: payment.sender },
          feeEstimate: PAYMENT_DETAIL.review.claimFee,
          network,
        }}
        run={async () => ({ txid: await claimPaymentFunds(wallet, payment.id) })}
        next={PAYMENT_DETAIL.review.claimedNext}
      />
      <TransactionReview
        open={review === 'pause'}
        onClose={closeReview}
        title={PAYMENT_DETAIL.review.pauseTitle}
        consequence={{ tone: 'warning', body: PAYMENT_DETAIL.review.pauseBody(recipientLabel) }}
        confirmLabel={PAYMENT_DETAIL.pause}
        keepLabel={PAYMENT_DETAIL.keep}
        summary={{ direction: 'fee-only', whoCanStop: PAYMENT_DETAIL.review.whoCanStop, network }}
        run={async () => ({ txid: await pausePaymentOnChain(wallet, payment.id) })}
        next={PAYMENT_DETAIL.review.pausedNext}
      />
      <TransactionReview
        open={review === 'resume'}
        onClose={closeReview}
        title={PAYMENT_DETAIL.review.resumeTitle}
        confirmLabel={PAYMENT_DETAIL.resume}
        summary={{ direction: 'fee-only', network }}
        run={async () => ({ txid: await resumePaymentOnChain(wallet, payment.id) })}
        next={PAYMENT_DETAIL.review.resumedNext(recipientLabel)}
      />
      <TransactionReview
        open={review === 'cancel'}
        onClose={closeReview}
        title={PAYMENT_DETAIL.review.cancelTitle}
        consequence={{ tone: 'danger', body: PAYMENT_DETAIL.review.cancelBody(recipientLabel, claimedText, backText) }}
        confirmLabel={PAYMENT_DETAIL.cancel}
        keepLabel={PAYMENT_DETAIL.keep}
        summary={{
          direction: 'returns',
          comesBack: { amount: units(Math.max(0, total - claimed), asset), asset },
          recipientKeeps: { amount: units(claimed, asset), asset },
          network,
        }}
        run={async () => ({ txid: await cancelPaymentOnChain(wallet, payment.id) })}
        next={PAYMENT_DETAIL.review.cancelledNext}
      />
    </PageContainer>
  );
}
