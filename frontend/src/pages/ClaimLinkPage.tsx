import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '../components/layout/Logo';
import { PageMeta } from '../components/seo/PageMeta';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { ErrorState } from '../components/ui/ErrorState';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { Check, Icon } from '../components/ui/Icon';
import { NetworkCapsule } from '../components/ui/NetworkCapsule';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { TransactionReview } from '../components/ui/TransactionReview';
import type { Asset } from '../components/ui/types';
import { useNetwork, type Network } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { AIRDROP_DETAIL, airdropPill, airdropPoolEmpty } from '../copy/airdrops';
import { CLAIM_PAGE } from '../copy/claim';
import { sameWallet } from '../utils/address';
import { errorMessage } from '../copy/errors';
import { formatAddress, formatAmount, formatDate } from '../copy/format';
import { claimAirdropFunds } from '../utils/blockchain';
import { SkipToMain } from '../components/layout/SkipToMain';
import { getCachedTokenMeta } from '../utils/tokenMeta';

export interface AirdropRecord {
  id: string;
  creator: string;
  title: string;
  description?: string | null;
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
  max_claims_per_address?: number | null;
  contract_address?: string | null;
  tx_hash?: string | null;
}

export interface AirdropClaim {
  id: string;
  claimer: string;
  amount: number;
  claimed_at: number;
  tx_hash?: string | null;
}

type ClaimState =
  | 'notFunded'
  | 'notStarted'
  | 'paused'
  | 'closed'
  | 'claimed'
  | 'empty'
  | 'checking'
  | 'notOnList'
  | 'checkFailed'
  | 'eligible';

type Resolve =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; campaign: AirdropRecord; claims: AirdropClaim[] };

const BCH: Asset = { kind: 'bch' };
const CLAIM_TOKEN = /^[a-zA-Z0-9-]{8,128}$/;

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

function baseClaimState(
  campaign: AirdropRecord,
  claims: AirdropClaim[],
  viewer: string,
  nowSeconds: number,
  network: Network,
): ClaimState | null {
  const pill = airdropPill(campaign, nowSeconds);
  if (pill === 'notFunded') return 'notFunded';
  if (pill === 'paused') return 'paused';
  const mine = claims.filter((claim) => sameWallet(claim.claimer, viewer, network)).length;
  if (mine >= Math.max(1, Number(campaign.max_claims_per_address ?? 1))) return 'claimed';
  if (pill === 'closed' && airdropPoolEmpty(campaign)) return 'empty';
  if (pill === 'closed' || pill === 'expired' || pill === 'cancelled') return 'closed';
  if (pill === 'scheduled') return 'notStarted';
  return null;
}

export type AirdropClaimActionProps = {
  campaign: AirdropRecord;
  claims: AirdropClaim[];
  onClaimed: () => void;
  showConnect?: boolean;
};

/** What someone who didn't send the airdrop can do with it: connect, claim, or read why they can't. */
export function AirdropClaimAction({ campaign, claims, onClaimed, showConnect = false }: AirdropClaimActionProps) {
  const wallet = useWallet();
  const network = useNetwork();
  const openWalletModal = useWalletModal((state) => state.openModal);
  const [check, setCheck] = useState<{ key: string; state: ClaimState } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const asset = airdropAsset(campaign);
  const shareText = formatAmount(campaign.amount_per_claim, asset);
  const viewer = wallet.address ?? '';
  const known = viewer ? baseClaimState(campaign, claims, viewer, nowSeconds, network) : null;
  const checkKey = `${campaign.id}:${viewer.trim().toLowerCase()}`;

  useEffect(() => {
    if (!viewer || known !== null) return undefined;
    let cancelled = false;
    fetch(`/api/airdrops/${encodeURIComponent(campaign.id)}/proof/${encodeURIComponent(viewer)}`)
      .then((response) => {
        if (cancelled) return;
        const state: ClaimState = response.ok ? 'eligible' : response.status === 404 ? 'notOnList' : 'checkFailed';
        setCheck({ key: checkKey, state });
      })
      .catch((error: unknown) => {
        console.warn('Airdrop eligibility check failed', error);
        if (!cancelled) setCheck({ key: checkKey, state: 'checkFailed' });
      });
    return () => {
      cancelled = true;
    };
  }, [campaign.id, checkKey, known, viewer]);

  if (!wallet.isConnected || !viewer) {
    if (!showConnect) return null;
    return (
      <div className="flex flex-col gap-2">
        <Button variant="primary" size="lg" data-wallet-trigger onClick={openWalletModal}>
          {CLAIM_PAGE.connect}
        </Button>
        <p className="text-small text-ink-secondary">
          {CLAIM_PAGE.needWallet}{' '}
          <ButtonLink variant="link" to="/help">
            {CLAIM_PAGE.getWallet}
          </ButtonLink>
        </p>
      </div>
    );
  }

  const state: ClaimState = known ?? (check && check.key === checkKey ? check.state : 'checking');

  switch (state) {
    case 'notFunded':
      return <Notice tone="warning" title={AIRDROP_DETAIL.notFundedNotice.title}>{AIRDROP_DETAIL.notFundedNotice.others}</Notice>;
    case 'notStarted':
      return <Notice tone="info" title={AIRDROP_DETAIL.notStarted(formatDate(campaign.start_date) ?? '')} />;
    case 'paused':
      return <Notice tone="warning" title={AIRDROP_DETAIL.paused} />;
    case 'claimed':
      return <Notice tone="neutral" title={errorMessage('AIRDROP_ALREADY_CLAIMED')} />;
    case 'empty':
      return <Notice tone="neutral" title={errorMessage('AIRDROP_EMPTY')} />;
    case 'closed':
      return <Notice tone="neutral" title={errorMessage('AIRDROP_CLOSED')} />;
    case 'notOnList':
      return <Notice tone="neutral" title={AIRDROP_DETAIL.notOnList} />;
    case 'checkFailed':
      return <Notice tone="warning" title={AIRDROP_DETAIL.checkFailed} />;
    case 'checking':
      return (
        <div aria-busy="true" aria-label={AIRDROP_DETAIL.checking}>
          <Skeleton kind="text" lines={2} />
        </div>
      );
    case 'eligible':
      break;
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button variant="primary" size="lg" onClick={() => setReviewing(true)}>
          {shareText ? AIRDROP_DETAIL.claim(shareText) : AIRDROP_DETAIL.claimGeneric}
        </Button>
      </div>
      <p className="text-small text-ink-secondary">{AIRDROP_DETAIL.signInFirst}</p>
      <TransactionReview
        open={reviewing}
        onClose={() => {
          setReviewing(false);
          onClaimed();
        }}
        summary={{
          direction: 'in',
          youReceive: { amount: String(campaign.amount_per_claim), asset },
          from: { address: campaign.creator },
          feeEstimate: AIRDROP_DETAIL.review.claimFee,
          network,
        }}
        run={async () => ({ txid: await claimAirdropFunds(wallet, campaign.id) })}
        next={AIRDROP_DETAIL.review.claimedNext}
      />
    </div>
  );
}

async function resolveLink(token: string): Promise<Resolve> {
  if (!CLAIM_TOKEN.test(token)) return { kind: 'missing' };
  const response = await fetch(`/api/airdrops/claim/${encodeURIComponent(token)}`);
  if (response.status === 404 || response.status === 400) return { kind: 'missing' };
  if (response.status === 429) return { kind: 'failed', message: errorMessage('RATE_LIMITED') };
  if (!response.ok) throw new Error(`Claim link lookup failed with ${response.status}`);
  const data: { campaignId?: string; campaign?: AirdropRecord } = await response.json();
  if (!data.campaign) return { kind: 'missing' };
  const detail = await fetch(`/api/airdrops/${encodeURIComponent(data.campaign.id)}`);
  const claims: AirdropClaim[] = detail.ok ? ((await detail.json()) as { claims?: AirdropClaim[] }).claims ?? [] : [];
  return { kind: 'ready', campaign: data.campaign, claims };
}

export default function ClaimLinkPage() {
  const { token = '' } = useParams();
  const wallet = useWallet();
  const network = useNetwork();
  const [resolved, setResolved] = useState<Resolve>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      setResolved(await resolveLink(token));
    } catch (error) {
      console.error('Claim link did not open', error);
      setResolved({ kind: 'failed', message: CLAIM_PAGE.errors.failed });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async () => {
    setResolved({ kind: 'loading' });
    await load();
  };

  const body = (() => {
    if (resolved.kind === 'loading') {
      return (
        <Panel>
          <div className="flex flex-col gap-4" aria-busy="true">
            <p className="text-body text-ink-secondary">{CLAIM_PAGE.opening}</p>
            <Skeleton kind="text" lines={3} />
          </div>
        </Panel>
      );
    }
    if (resolved.kind === 'missing' || resolved.kind === 'failed') {
      return (
        <Panel>
          <ErrorState
            title={resolved.kind === 'missing' ? CLAIM_PAGE.errors.notFound : resolved.message}
            onRetry={resolved.kind === 'failed' ? retry : undefined}
            action={
              resolved.kind === 'missing' ? (
                <ButtonLink variant="secondary" to="/">
                  {CLAIM_PAGE.errors.goHome}
                </ButtonLink>
              ) : undefined
            }
          />
        </Panel>
      );
    }

    const { campaign, claims } = resolved;
    const asset = airdropAsset(campaign);
    const share = formatAmount(campaign.amount_per_claim, asset);
    const nowSeconds = Math.floor(Date.now() / 1000);
    return (
      <>
        <Panel>
          <div className="flex flex-col gap-4">
            <Eyebrow>{CLAIM_PAGE.eyebrow}</Eyebrow>
            <Heading level="page">{share ? CLAIM_PAGE.title(share) : CLAIM_PAGE.titleUnknown}</Heading>
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={airdropPill(campaign, nowSeconds)} />
              <span className="text-small text-ink-secondary">{CLAIM_PAGE.from(formatAddress(campaign.creator))}</span>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-title-item text-ink">{campaign.title}</p>
              {campaign.description ? <p className="text-body text-ink-secondary">{campaign.description}</p> : null}
            </div>
            <AirdropClaimAction campaign={campaign} claims={claims} onClaimed={() => void load()} showConnect />
            {wallet.isConnected ? (
              <div>
                <ButtonLink variant="link" to={`/airdrops/${campaign.id}`}>
                  {CLAIM_PAGE.openAirdrop}
                </ButtonLink>
              </div>
            ) : null}
          </div>
        </Panel>
        <section aria-label={CLAIM_PAGE.factsLabel}>
          <ul className="flex flex-col gap-2 text-small text-ink-secondary">
            {[CLAIM_PAGE.facts.once, CLAIM_PAGE.facts.fee, CLAIM_PAGE.facts.cosign].map((fact) => (
              <li key={fact} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex text-brand">
                  <Icon icon={Check} size={16} />
                </span>
                {fact}
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  })();

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <PageMeta title={CLAIM_PAGE.documentTitle} description={CLAIM_PAGE.metaDescription} />
      <header className="border-b border-line">
        <SkipToMain />
        <div className="mx-auto flex h-header w-full max-w-page items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" className="inline-flex min-h-touch shrink-0 items-center">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block">
              <ButtonLink variant="link" to="/how-it-works">
                {CLAIM_PAGE.whatIsFlowGuard}
              </ButtonLink>
            </span>
            <NetworkCapsule network={network} to="/status" />
          </div>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:px-6">
        <div className="flex w-full max-w-narrow flex-col gap-6">
          {body}
          <div className="sm:hidden">
            <ButtonLink variant="link" to="/how-it-works">
              {CLAIM_PAGE.whatIsFlowGuard}
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
