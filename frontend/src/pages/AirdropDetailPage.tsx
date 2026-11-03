import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Code } from '../components/ui/Code';
import { CopyButton } from '../components/ui/CopyButton';
import { CopyField } from '../components/ui/CopyField';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { Heading } from '../components/ui/Heading';
import { ManageActions } from '../components/ui/ManageActions';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { ProgressMeter } from '../components/ui/ProgressMeter';
import { Skeleton } from '../components/ui/Skeleton';
import { TransactionReview } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { useNetwork, type Network } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import {
  AIRDROP_ACCESS,
  AIRDROP_DETAIL,
  CREATE_AIRDROP,
  airdropPill,
  airdropShareCount,
  sharesClaimed,
} from '../copy/airdrops';
import { sameWallet } from '../utils/address';
import { ACTIONS, LABELS, MOMENTS } from '../copy/common';
import { errorMessage } from '../copy/errors';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { assetDecimals, formatAddress, formatAmount, formatDate, formatShortId } from '../copy/format';
import { cancelAirdropOnChain, fundAirdropContract, setPausedOnChain } from '../utils/blockchain';
import { getCachedTokenMeta } from '../utils/tokenMeta';
import { AirdropClaimAction, type AirdropClaim, type AirdropRecord } from './ClaimLinkPage';

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
  | { kind: 'ready'; campaign: AirdropRecord; claims: AirdropClaim[]; events: StoredEvent[] };

type Review = 'fund' | 'pause' | 'resume' | 'cancel' | null;

const BCH: Asset = { kind: 'bch' };
const POLL_ATTEMPTS = 8;
const ACTIVITY_LIMIT = 8;
const POLL_DELAY_MS = 1_500;
/** Server defaults in backend fundingConfig.ts: 5,000 satoshis on top of a BCH contract, 20,000 satoshis of BCH in a token contract. */
const BCH_CONTRACT_RESERVE = '0.00005';
const TOKEN_CONTRACT_BCH = '0.0002';

function airdropAsset(campaign: AirdropRecord): Asset {
  if (campaign.token_type === 'BCH' || !campaign.token_category) return BCH;
  const meta = getCachedTokenMeta(campaign.token_category);
  return {
    kind: 'token',
    tokenId: campaign.token_category,
    symbol: meta?.symbol,
    decimals: campaign.token_decimals ?? meta?.decimals ?? 0,
  };
}

function units(value: number, asset: Asset): string {
  return Math.max(0, value).toFixed(assetDecimals(asset));
}

function toActivity(events: StoredEvent[], viewer: string | null | undefined, asset: Asset, network: Network): ActivityEvent[] {
  return events.map((event) => ({
    id: event.id,
    kind: toEventKind(event.event_type),
    object: { kind: 'airdrop' },
    at: event.created_at * 1000,
    actor: event.actor ? { address: event.actor, isYou: sameWallet(event.actor, viewer, network) } : undefined,
    amount: event.amount !== null && event.amount !== undefined ? { value: event.amount, asset } : undefined,
    txid: event.tx_hash ?? undefined,
  }));
}

function TokenId({ id, symbol }: { id: string; symbol?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {symbol ? <span>{symbol}</span> : null}
      <Code>{formatShortId(id)}</Code>
      <CopyButton value={id} label={ACTIONS.copyId} />
    </span>
  );
}

async function fetchAirdrop(id: string): Promise<Load> {
  const response = await fetch(`/api/airdrops/${encodeURIComponent(id)}`);
  if (response.status === 404 || response.status === 400) return { kind: 'missing' };
  if (!response.ok) throw new Error(`Airdrop request failed with ${response.status}`);
  const data: { campaign?: AirdropRecord; claims?: AirdropClaim[]; events?: StoredEvent[] } = await response.json();
  if (!data.campaign) return { kind: 'missing' };
  return { kind: 'ready', campaign: data.campaign, claims: data.claims ?? [], events: data.events ?? [] };
}

export default function AirdropDetailPage() {
  const { id = '' } = useParams();
  const wallet = useWallet();
  const network = useNetwork();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [review, setReview] = useState<Review>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async (): Promise<AirdropRecord | null> => {
    try {
      const next = await fetchAirdrop(id);
      setLoad(next);
      return next.kind === 'ready' ? next.campaign : null;
    } catch (error) {
      console.error('Airdrop did not load', error);
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

  if (load.kind === 'loading') {
    return (
      <PageContainer>
        <div className="flex flex-col gap-6" aria-busy="true" aria-label={AIRDROP_DETAIL.loading}>
          <Skeleton kind="text" lines={3} />
          <Skeleton kind="tile" />
          <Skeleton kind="row" lines={4} />
        </div>
      </PageContainer>
    );
  }

  if (load.kind === 'failed' || load.kind === 'missing') {
    const copy = load.kind === 'failed' ? AIRDROP_DETAIL.loadFailed : AIRDROP_DETAIL.notFound;
    return (
      <PageContainer>
        <Panel>
          <ErrorState
            title={copy.title}
            reason={copy.reason}
            onRetry={load.kind === 'failed' ? retry : undefined}
            action={
              load.kind === 'missing' ? (
                <ButtonLink variant="secondary" to="/airdrops">
                  {AIRDROP_DETAIL.backToList}
                </ButtonLink>
              ) : undefined
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const { campaign, claims, events } = load;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const asset = airdropAsset(campaign);
  const isSender = sameWallet(wallet.address, campaign.creator, network);
  const status = airdropPill(campaign, nowSeconds);
  const total = airdropShareCount(campaign);
  const claimedCount = Number(campaign.claimed_count || 0);
  const share = Number(campaign.amount_per_claim || 0);
  const pool = Number(campaign.total_amount || 0);
  const left = Math.max(0, pool - claimedCount * share);
  const shareText = formatAmount(units(share, asset), asset);
  const poolText = formatAmount(units(pool, asset), asset);
  const leftText = formatAmount(units(left, asset), asset);
  const senderShort = formatAddress(campaign.creator);
  const closes = formatDate(campaign.end_date);
  const live = campaign.status === 'ACTIVE' || campaign.status === 'PAUSED';
  const funded = campaign.status !== 'PENDING';

  const plan = (
    <PlanSentence
      schedule={{
        kind: 'per-claim',
        perClaim: units(share, asset),
        maxClaims: total > 0 ? total : null,
        asset,
        closesAt: campaign.end_date ? campaign.end_date * 1000 : undefined,
      }}
    />
  );

  const description = isSender
    ? AIRDROP_DETAIL.description.sender
    : shareText
      ? AIRDROP_DETAIL.description.viewer(senderShort, shareText)
      : AIRDROP_DETAIL.description.viewerNoShare(senderShort);

  const senderAction = (() => {
    if (status === 'notFunded' && !campaign.contract_address) {
      return <Notice tone="danger" title={errorMessage('MISCONFIGURED')} />;
    }
    if (status === 'notFunded') {
      return (
        <>
          <Notice tone="warning" title={AIRDROP_DETAIL.notFundedNotice.title}>
            {AIRDROP_DETAIL.notFundedNotice.sender}
          </Notice>
          <div className="flex flex-col gap-2">
            <div>
              <Button variant="primary" size="lg" onClick={() => setReview('fund')}>
                {poolText ? AIRDROP_DETAIL.fund(poolText) : AIRDROP_DETAIL.fundGeneric}
              </Button>
            </div>
            <p className="text-small text-ink-secondary">
              {poolText ? CREATE_AIRDROP.next(poolText) : CREATE_AIRDROP.nextUnknown}
            </p>
          </div>
        </>
      );
    }
    if (status === 'openForClaims' || status === 'scheduled') {
      return campaign.claim_link ? (
        <div className="flex flex-col gap-2">
          <p className="text-small text-ink-secondary">{AIRDROP_ACCESS}</p>
          <CopyField label={AIRDROP_DETAIL.shareField} value={campaign.claim_link} />
        </div>
      ) : null;
    }
    if (status === 'paused') return <Notice tone="warning" title={isSender ? AIRDROP_DETAIL.pausedSender : AIRDROP_DETAIL.paused} />;
    return null;
  })();

  const main = (
    <>
      <Panel>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <span className="text-label text-ink-secondary">
              {isSender ? AIRDROP_DETAIL.pool : AIRDROP_DETAIL.yourShare}
            </span>
            <Amount value={units(isSender ? pool : share, asset)} asset={asset} size="xl" />
          </div>
          <ProgressMeter label={sharesClaimed(claimedCount, total)} value={claimedCount} max={total} />
          {syncing ? <Notice tone="info" title={MOMENTS.sentPending} live="polite" /> : null}
          {isSender ? (
            senderAction
          ) : (
            <AirdropClaimAction campaign={campaign} claims={claims} onClaimed={() => void refresh()} />
          )}
        </div>
      </Panel>
      <Panel title={AIRDROP_DETAIL.activity}>
        <ActivityList events={toActivity(events.slice(0, ACTIVITY_LIMIT), wallet.address, asset, network)}
          state="ready"
          network={network}
          seeAllHref={events.length > ACTIVITY_LIMIT ? '/explorer' : undefined}
        />
      </Panel>
    </>
  );

  const details = [
    { label: AIRDROP_DETAIL.detailLabels.from, value: <Address value={campaign.creator} isYou={isSender} /> },
    { label: AIRDROP_DETAIL.detailLabels.token, value: asset.kind === 'bch' ? 'BCH' : <TokenId id={asset.tokenId} symbol={asset.symbol} /> },
    { label: AIRDROP_DETAIL.detailLabels.share, value: shareText },
    { label: AIRDROP_DETAIL.detailLabels.pool, value: poolText },
    { label: AIRDROP_DETAIL.detailLabels.claimed, value: sharesClaimed(claimedCount, total) },
    { label: AIRDROP_DETAIL.detailLabels.opens, value: formatDate(campaign.start_date) },
    { label: AIRDROP_DETAIL.detailLabels.closes, value: closes },
    {
      label: AIRDROP_DETAIL.detailLabels.contract,
      value: campaign.contract_address ? <Address value={campaign.contract_address} /> : null,
    },
    {
      label: AIRDROP_DETAIL.detailLabels.funding,
      value: funded && campaign.tx_hash ? <TxLink txid={campaign.tx_hash} network={network} /> : null,
    },
  ];

  const side = (
    <>
      <Panel title={AIRDROP_DETAIL.details}>
        <DetailList items={details} />
      </Panel>
      <Card>
        <div className="flex flex-col gap-2">
          <Heading level="item" as="h2">
            {LABELS.whoCanMoveTheMoney}
          </Heading>
          <p className="text-small text-ink-secondary">{AIRDROP_DETAIL.whoCanMove(isSender)}</p>
        </div>
      </Card>
      {isSender && live ? (
        <Card>
          <div className="flex flex-col gap-3">
            <Heading level="item" as="h2">
              {AIRDROP_DETAIL.manage}
            </Heading>
            <ManageActions
              actions={[
                campaign.status === 'PAUSED'
                  ? { key: 'resume', label: AIRDROP_DETAIL.resume, onClick: () => setReview('resume') }
                  : { key: 'pause', label: AIRDROP_DETAIL.pause, onClick: () => setReview('pause') },
                { key: 'cancel', label: AIRDROP_DETAIL.cancel, danger: true, onClick: () => setReview('cancel') },
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
        title={campaign.title}
        description={description}
        breadcrumbs={[{ label: AIRDROP_DETAIL.back, to: '/airdrops' }, { label: campaign.title }]}
        status={status}
        role={isSender ? 'sender' : 'viewer'}
        plan={isSender ? plan : undefined}
        stateLine={AIRDROP_DETAIL.stateLine(claimedCount, total, closes)}
      />
      <TwoColumn main={main} side={side} />

      {campaign.contract_address ? (
        <TransactionReview
          open={review === 'fund'}
          onClose={closeReview}
          plan={plan}
          steps={asset.kind === 'token' ? 2 : 1}
          summary={{
            direction: 'out',
            leavesWallet: { amount: units(pool, asset), asset },
            goesTo: { address: campaign.contract_address, name: AIRDROP_DETAIL.review.contractName },
            feeEstimate: reserveText ? AIRDROP_DETAIL.review.reserveFee(reserveText) : null,
            network,
          }}
          run={async (report) => {
            const result = await fundAirdropContract(wallet, campaign.id);
            if (result.confirmation === 'confirmed') report({ step: 'confirmed', status: 'done' });
            else void waitForFunding();
            return { txid: result.txHash };
          }}
          next={AIRDROP_DETAIL.review.fundedNext}
        />
      ) : null}
      <TransactionReview
        open={review === 'pause'}
        onClose={closeReview}
        title={AIRDROP_DETAIL.review.pauseTitle}
        consequence={{ tone: 'warning', body: AIRDROP_DETAIL.review.pauseBody }}
        confirmLabel={AIRDROP_DETAIL.pause}
        keepLabel={AIRDROP_DETAIL.keep}
        summary={{ direction: 'fee-only', network }}
        run={async () => ({ txid: await setPausedOnChain(wallet, 'airdrops', campaign.id, 'pause') })}
        next={AIRDROP_DETAIL.review.pausedNext}
      />
      <TransactionReview
        open={review === 'resume'}
        onClose={closeReview}
        title={AIRDROP_DETAIL.review.resumeTitle}
        consequence={{ tone: 'info', body: AIRDROP_DETAIL.review.resumeBody }}
        confirmLabel={AIRDROP_DETAIL.resume}
        summary={{ direction: 'fee-only', network }}
        run={async () => ({ txid: await setPausedOnChain(wallet, 'airdrops', campaign.id, 'resume') })}
        next={AIRDROP_DETAIL.review.resumedNext}
      />
      <TransactionReview
        open={review === 'cancel'}
        onClose={closeReview}
        title={AIRDROP_DETAIL.review.cancelTitle}
        consequence={{ tone: 'danger', body: AIRDROP_DETAIL.review.cancelBody(leftText) }}
        confirmLabel={AIRDROP_DETAIL.cancel}
        keepLabel={AIRDROP_DETAIL.keep}
        summary={{ direction: 'returns', comesBack: { amount: units(left, asset), asset }, whoCanStop: AIRDROP_DETAIL.review.whoCanStop, network }}
        run={async () => ({ txid: await cancelAirdropOnChain(wallet, campaign.id) })}
        next={AIRDROP_DETAIL.review.cancelledNext}
      />
    </PageContainer>
  );
}
