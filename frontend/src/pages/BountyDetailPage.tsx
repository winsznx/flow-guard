import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { TwoColumn } from '../components/layout/TwoColumn';
import { Accordion } from '../components/ui/Accordion';
import { ActivityList } from '../components/ui/ActivityList';
import { Address } from '../components/ui/Address';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Code } from '../components/ui/Code';
import { CopyButton } from '../components/ui/CopyButton';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Heading } from '../components/ui/Heading';
import { ArrowUpFromLine } from '../components/ui/Icon';
import { Input } from '../components/ui/Input';
import { InsetBlock } from '../components/ui/InsetBlock';
import { List, type Column } from '../components/ui/List';
import { Notice } from '../components/ui/Notice';
import { ManageActions } from '../components/ui/ManageActions';
import { Panel } from '../components/ui/Panel';
import { PlanSentence } from '../components/ui/PlanSentence';
import { ProgressMeter } from '../components/ui/ProgressMeter';
import { Skeleton } from '../components/ui/Skeleton';
import { TransactionReview, type TxStep } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import {
  BOUNTY_DETAIL,
  cancelConsequence,
  cancelPlan,
  fundButton,
  fundLine,
  payLine,
  payPlan,
  paysFrom,
  prizeForWinner,
  viewerLine,
  viewerWho,
  winnersPaid,
} from '../copy/bounties';
import { ACTIONS } from '../copy/common';
import { apiFailure, asFlowError, flowFailure, type FlowError } from '../copy/errors';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { formatAmount, formatDate, formatShortId } from '../copy/format';
import { TX_NOTICES } from '../copy/wallets';
import {
  fetchBounty,
  submitBountyClaim,
  type BountyActivityEvent,
  type BountyClaim,
  type BountyRow,
  type BountyStatus,
} from '../services/bountyApi';
import { authFetch } from '../utils/auth';
import {
  deserializeWcSignOptions,
  resolveTxHashFromSignResult,
  runLifecycleAction,
  type SerializedWcTransaction,
  type WalletInterface,
  setPausedOnChain,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { campaignAsset, campaignStatus, storedUnits } from '../utils/campaignAmounts';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';

interface FundingInfoResponse {
  success?: boolean;
  fundingInfo?: unknown;
  wcTransaction?: SerializedWcTransaction;
  requiresPreparation?: boolean;
  preparationTransaction?: SerializedWcTransaction;
  message?: string;
  error?: string;
}

interface ClaimWinnerInput {
  bountyId: string;
  winnerAddress: string;
  proofHash: string;
  rewardAmount: number;
}

type ActionResult = { txHash: string; confirmed: boolean };

const PROOF_CODE = /^[0-9a-fA-F]{64}$/;
const NON_ZERO = /[1-9a-fA-F]/;
const ADDRESS_PREFIX = { mainnet: 'bitcoincash', chipnet: 'bchtest' } as const;
const BCH: Asset = { kind: 'bch' };

/**
 * Fund a bounty contract. Runs the optional preparation transaction first, then the
 * funding round-trip through `runLifecycleAction`.
 */
async function bountyActionFund(wallet: WalletInterface, bountyId: string): Promise<ActionResult> {
  if (!wallet.address) throw flowFailure('NOT_CONNECTED');
  if (!wallet.signCashScriptTransaction) throw flowFailure('WALLET_UNSUPPORTED');

  const fetchFundingInfo = async (): Promise<FundingInfoResponse> => {
    const response = await authFetch(`/api/bounties/${bountyId}/funding-info`, {
      wallet,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as FundingInfoResponse;
    if (!response.ok) throw apiFailure(payload, response.status, 'SERVER_PREPARE_FAILED');
    return payload;
  };

  let data = await fetchFundingInfo();

  if (data.requiresPreparation && data.preparationTransaction) {
    const prepOptions = {
      ...deserializeWcSignOptions(data.preparationTransaction),
      broadcast: false,
    };
    const prepResult = await wallet.signCashScriptTransaction(prepOptions);
    const preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed', wallet);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    data = await fetchFundingInfo();
    if (data.requiresPreparation) {
      throw flowFailure('STEP_PENDING', { txid: preparationTxId, details: 'Funding info still reports requiresPreparation.' });
    }
  }

  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.bountyFunded,
    signContext: 'Bounty funding signing failed',
    metadata: { txType: 'create', fromAddress: wallet.address || undefined },
    build: async () => {
      const wcTransaction = data.wcTransaction;
      if (!wcTransaction) {
        throw flowFailure('SERVER_PREPARE_FAILED', { details: 'Bounty funding: no transaction to sign.' });
      }
      return { wcTransaction, payload: data };
    },
    confirm: ({ txHash }) =>
      authFetch(`/api/bounties/${bountyId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      }),
  });

  return { txHash: confirm.txHash, confirmed: confirm.state === 'confirmed' };
}

/**
 * Build, sign and confirm a winner payment. Only the sender's wallet can approve it;
 * FlowGuard's server co-signs the contract input.
 */
async function bountyActionPayWinner(wallet: WalletInterface, input: ClaimWinnerInput): Promise<ActionResult> {
  if (!wallet.address) throw flowFailure('NOT_CONNECTED');

  const { confirm } = await runLifecycleAction<{ claimAmount: number; wcTransaction: SerializedWcTransaction }>({
    wallet,
    actionLabel: TX_NOTICES.bountyWinnerPaid,
    syncedOutcome: 'payment',
    signContext: 'Bounty claim signing failed',
    build: async (signerAddress) => {
      const payload = await submitBountyClaim(input.bountyId, {
        winnerAddress: input.winnerAddress,
        proofHash: input.proofHash,
        signerAddress,
      });
      if (!payload?.wcTransaction) {
        throw flowFailure('SERVER_PREPARE_FAILED', { details: 'Bounty claim: no transaction to sign.' });
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: { claimAmount: payload.claimAmount, wcTransaction: payload.wcTransaction as SerializedWcTransaction },
      };
    },
    confirm: ({ txHash }) =>
      authFetch(`/api/bounties/${input.bountyId}/confirm-claim`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          winnerAddress: input.winnerAddress,
          amount: input.rewardAmount,
          proofHash: input.proofHash,
          txHash,
        }),
      }),
  });

  return { txHash: confirm.txHash, confirmed: confirm.state === 'confirmed' };
}

async function bountyActionCancel(wallet: WalletInterface, bountyId: string): Promise<ActionResult> {
  if (!wallet.address) throw flowFailure('NOT_CONNECTED');
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.bountyCancelled,
    syncedOutcome: 'bountyCancelled',
    signContext: 'Bounty cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`/api/bounties/${bountyId}/cancel`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-address': signerAddress },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        wcTransaction?: SerializedWcTransaction;
        warning?: string;
        error?: string;
        message?: string;
      };
      if (!response.ok) throw apiFailure(payload, response.status, 'SERVER_PREPARE_FAILED');
      if (!payload.wcTransaction) {
        throw flowFailure('SERVER_PREPARE_FAILED', { details: 'Bounty cancel: no transaction to sign.' });
      }
      return { wcTransaction: payload.wcTransaction, payload };
    },
    confirm: ({ txHash, signerAddress }) =>
      authFetch(`/api/bounties/${bountyId}/confirm-cancel`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-address': signerAddress },
        body: JSON.stringify({ txHash }),
      }),
  });
  return { txHash: confirm.txHash, confirmed: confirm.state === 'confirmed' };
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A proof code pasted as is, or one made from the link or note the sender typed. */
async function toProofCode(submission: string): Promise<string> {
  const value = submission.trim();
  if (PROOF_CODE.test(value) && NON_ZERO.test(value)) return value.toLowerCase();
  return sha256Hex(value);
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function withPrefix(address: string, network: 'mainnet' | 'chipnet'): string {
  const value = address.trim();
  return value.includes(':') ? value : `${ADDRESS_PREFIX[network]}:${value}`;
}

function toActivity(
  events: BountyActivityEvent[],
  bounty: BountyRow,
  asset: Asset,
  viewer: string | null,
): ActivityEvent[] {
  return events
    .map((event) => {
      const kind = toEventKind(event.event_type, 'bounty');
      const withAmount = (kind === 'funded' || kind === 'cancelled' || kind === 'winnerPaid') && event.amount !== null;
      return {
        id: event.id,
        kind,
        object: {
          kind: 'bounty' as const,
          owner: { address: bounty.creator, isYou: sameAddress(bounty.creator, viewer) },
        },
        at: event.created_at,
        actor: event.actor ? { address: event.actor, isYou: sameAddress(event.actor, viewer) } : undefined,
        amount: withAmount
          ? { value: formatAmount(storedUnits(event.amount, bounty), asset, { unit: false }) ?? '0', asset }
          : undefined,
        txid: event.tx_hash ?? undefined,
      };
    });
}

type Load =
  | { state: 'loading' }
  | { state: 'error'; error: FlowError }
  | { state: 'ready'; bounty: BountyRow; claims: BountyClaim[]; events: BountyActivityEvent[] };

type Review = 'fund' | 'pay' | 'pause' | 'resume' | 'cancel' | null;
type PayInput = { winner: string; proofHash: string };

export default function BountyDetailPage() {
  const { id } = useParams();
  const wallet = useWallet();
  const network = useNetwork();

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [review, setReview] = useState<Review>(null);
  const [winner, setWinner] = useState('');
  const [winnerValid, setWinnerValid] = useState(false);
  const [submission, setSubmission] = useState('');
  const [payErrors, setPayErrors] = useState<{ winner?: string; submission?: string }>({});
  const [paySummary, setPaySummary] = useState<string | null>(null);
  const [payInput, setPayInput] = useState<PayInput | null>(null);

  const refresh = useCallback(async (): Promise<BountyStatus | null> => {
    if (!id) return null;
    const data = await fetchBounty(id);
    setLoad({ state: 'ready', bounty: data.campaign, claims: data.claims, events: data.events });
    return data.campaign.status;
  }, [id]);

  const reload = useCallback(async (): Promise<void> => {
    setLoad({ state: 'loading' });
    try {
      await refresh();
    } catch (error) {
      setLoad({ state: 'error', error: asFlowError(error) });
    }
  }, [refresh]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const tokenCategory = load.state === 'ready' && load.bounty.token_type !== 'BCH' ? load.bounty.token_category : null;

  useEffect(() => {
    if (!tokenCategory) return undefined;
    let current = true;
    resolveTokenMeta(tokenCategory, network)
      .then((meta) => {
        if (current) setTokenMeta(meta);
      })
      .catch(() => {
        if (current) setTokenMeta(null);
      });
    return () => {
      current = false;
    };
  }, [tokenCategory, network]);

  const refreshQuietly = useCallback(() => {
    void refresh().catch(() => null);
  }, [refresh]);

  const waitForActive = useCallback(async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const status = await refresh().catch(() => null);
      if (status && status !== 'PENDING') return;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }, [refresh]);

  const ready = load.state === 'ready' ? load : null;
  const bounty = ready?.bounty ?? null;
  const asset = useMemo(() => (bounty ? campaignAsset(bounty, tokenMeta) : BCH), [bounty, tokenMeta]);

  if (load.state === 'loading') {
    return (
      <PageContainer>
        <Stack>
          <Skeleton kind="text" lines={2} />
          <TwoColumn
            main={
              <Panel>
                <Skeleton kind="text" lines={4} />
              </Panel>
            }
            side={
              <Panel>
                <Skeleton kind="text" lines={5} />
              </Panel>
            }
          />
        </Stack>
      </PageContainer>
    );
  }

  if (load.state === 'error' || !ready || !bounty) {
    const error = load.state === 'error' ? load.error : null;
    return (
      <PageContainer>
        <Panel>
          <ErrorState
            title={BOUNTY_DETAIL.loadFailed}
            reason={error?.message}
            onRetry={error?.code === 'NOT_FOUND' ? undefined : reload}
            action={
              error?.code === 'NOT_FOUND' ? (
                <ButtonLink variant="secondary" to="/bounties">
                  {BOUNTY_DETAIL.back}
                </ButtonLink>
              ) : undefined
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const { claims, events } = ready;
  const isSender = sameAddress(wallet.address, bounty.creator);
  const title = bounty.title?.trim() || BOUNTY_DETAIL.untitled;
  const prizeUnits = storedUnits(bounty.reward_per_winner, bounty);
  const remainingWinners = Math.max(0, bounty.max_winners - bounty.winners_count);
  const prize = formatAmount(prizeUnits, asset) ?? '';
  const total = formatAmount(prizeUnits * BigInt(bounty.max_winners), asset) ?? '';
  const remainingUnits = prizeUnits * BigInt(remainingWinners);
  const remaining = formatAmount(remainingUnits, asset) ?? '';
  const remainingValue = formatAmount(remainingUnits, asset, { unit: false }) ?? '0';
  const prizeValue = formatAmount(prizeUnits, asset, { unit: false }) ?? '0';
  const totalValue = formatAmount(prizeUnits * BigInt(bounty.max_winners), asset, { unit: false }) ?? '0';

  const nowSeconds = Math.floor(Date.now() / 1000);
  const notStarted = Boolean(bounty.start_date && nowSeconds < bounty.start_date);
  const ended = Boolean(bounty.end_date && bounty.end_date > 0 && nowSeconds > bounty.end_date);
  const status = campaignStatus(bounty);
  const canCancel = isSender && bounty.cancelable && (bounty.status === 'ACTIVE' || bounty.status === 'PAUSED') && remainingWinners > 0;
  const canPause = canCancel && bounty.status === 'ACTIVE' && !ended;
  const canResume = isSender && bounty.status === 'PAUSED';
  const startText = formatDate(bounty.start_date);
  const endText = formatDate(bounty.end_date ?? null);
  const contract = bounty.contract_address ?? null;

  const plan = (
    <PlanSentence
      schedule={{
        kind: 'prize',
        perWinner: formatAmount(prizeUnits, asset, { unit: false }) ?? '',
        winners: bounty.max_winners,
        asset,
        endsAt: bounty.end_date ?? undefined,
      }}
    />
  );

  const submitPay = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const nextErrors: { winner?: string; submission?: string } = {};
    if (!winner.trim()) nextErrors.winner = BOUNTY_DETAIL.pay.winnerMissing;
    else if (!winnerValid) nextErrors.winner = BOUNTY_DETAIL.pay.winnerHelper;
    if (!submission.trim()) nextErrors.submission = BOUNTY_DETAIL.pay.submissionMissing;
    setPayErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setPaySummary(BOUNTY_DETAIL.pay.fixFields);
      return;
    }
    setPaySummary(null);
    const proofHash = await toProofCode(submission);
    setPayInput({ winner: withPrefix(winner, network), proofHash });
    setReview('pay');
  };

  const runAction = (action: () => Promise<ActionResult>, after?: (result: ActionResult) => void) =>
    async (report: (step: TxStep) => void): Promise<{ txid?: string }> => {
      const result = await action();
      if (result.confirmed) report({ step: 'confirmed', status: 'done' });
      refreshQuietly();
      after?.(result);
      return { txid: result.txHash };
    };

  const winnerColumns: Column<BountyClaim>[] = [
    {
      key: 'winner',
      header: BOUNTY_DETAIL.winners.winner,
      primary: true,
      cell: (claim) =>
        claim.winner ? <Address value={claim.winner} isYou={sameAddress(claim.winner, wallet.address)} /> : null,
    },
    {
      key: 'amount',
      header: BOUNTY_DETAIL.winners.amount,
      align: 'end',
      mobile: 'bottom-start',
      cell: (claim) => <Amount value={storedUnits(claim.amount, bounty)} asset={asset} />,
    },
    {
      key: 'paid',
      header: BOUNTY_DETAIL.winners.paidOn,
      mobile: 'bottom-end',
      cell: (claim) => formatDate(claim.claimed_at),
    },
    {
      key: 'tx',
      header: BOUNTY_DETAIL.winners.transaction,
      mobile: 'top',
      cell: (claim) => (claim.tx_hash ? <TxLink txid={claim.tx_hash} network={network} /> : null),
    },
  ];

  const cancelButton = (
    <Button variant="danger-quiet" onClick={() => setReview('cancel')}>
      {BOUNTY_DETAIL.manage.cancel}
    </Button>
  );

  const actionCard = (() => {
    if (!isSender) return null;
    if (bounty.status === 'PENDING') {
      return (
        <Panel title={BOUNTY_DETAIL.fund.title} description={fundLine(total)}>
          <Stack gap={4}>
            <p className="text-small text-ink-secondary">{BOUNTY_DETAIL.fund.twoSteps}</p>
            <div>
              {contract ? (
                <Button variant="primary" size="lg" leadingIcon={ArrowUpFromLine} onClick={() => setReview('fund')}>
                  {fundButton(total)}
                </Button>
              ) : (
                <Button variant="primary" size="lg" leadingIcon={ArrowUpFromLine} disabled disabledReason={BOUNTY_DETAIL.fund.noAddress}>
                  {fundButton(total)}
                </Button>
              )}
            </div>
          </Stack>
        </Panel>
      );
    }
    if (bounty.status === 'PAUSED') {
      return (
        <Panel title={BOUNTY_DETAIL.pay.title}>
          <Stack gap={4}>
            <Notice tone="warning" title={BOUNTY_DETAIL.pay.pausedTitle}>
              {BOUNTY_DETAIL.pay.pausedLine}
            </Notice>
            <div className="flex flex-wrap gap-3">
              {canResume ? (
                <Button variant="primary" onClick={() => setReview('resume')}>
                  {BOUNTY_DETAIL.manage.resume}
                </Button>
              ) : null}
              {canCancel ? cancelButton : null}
            </div>
          </Stack>
        </Panel>
      );
    }
    if (bounty.status !== 'ACTIVE') return null;
    if (remainingWinners === 0) {
      return <Notice tone="success" title={BOUNTY_DETAIL.pay.allPaid} />;
    }
    if (ended) {
      return (
        <Panel title={BOUNTY_DETAIL.pay.title}>
          <Stack gap={4}>
            <p className="text-body text-ink-secondary">{BOUNTY_DETAIL.pay.ended}</p>
            {canCancel ? <div>{cancelButton}</div> : null}
          </Stack>
        </Panel>
      );
    }
    if (notStarted) {
      return (
        <Panel title={BOUNTY_DETAIL.pay.title} description={payLine(prize)}>
          <Notice tone="info" title={paysFrom(startText ?? '')} />
        </Panel>
      );
    }
    return (
      <Panel title={BOUNTY_DETAIL.pay.title} description={payLine(prize)}>
        <form noValidate onSubmit={(event) => void submitPay(event)}>
          <Stack gap={4}>
            <AddressInput
              id="bounty-winner"
              label={BOUNTY_DETAIL.pay.winnerLabel}
              value={winner}
              onChange={(value) => {
                setWinner(value);
                setPayErrors((prev) => ({ ...prev, winner: undefined }));
              }}
              onValidChange={setWinnerValid}
              network={network}
              accept="p2pkh"
              helper={BOUNTY_DETAIL.pay.winnerHelper}
              error={payErrors.winner}
            />
            <Input
              id="bounty-submission"
              label={BOUNTY_DETAIL.pay.submissionLabel}
              placeholder={BOUNTY_DETAIL.pay.submissionPlaceholder}
              helper={BOUNTY_DETAIL.pay.submissionHelper}
              value={submission}
              onChange={(event) => {
                setSubmission(event.target.value);
                setPayErrors((prev) => ({ ...prev, submission: undefined }));
              }}
              error={payErrors.submission}
            />
            <Accordion
              items={[{ id: 'bounty-proof-code', title: BOUNTY_DETAIL.pay.proofDetails, content: BOUNTY_DETAIL.pay.proofDetailsLine }]}
            />
            <InsetBlock>
              <p className="text-body text-ink">{prizeForWinner(prize)}</p>
            </InsetBlock>
            {paySummary ? (
              <ErrorSummary
                title={BOUNTY_DETAIL.pay.errorTitle}
                message={paySummary}
                fields={[
                  ...(payErrors.winner ? [{ label: BOUNTY_DETAIL.pay.winnerLabel, id: 'bounty-winner' }] : []),
                  ...(payErrors.submission ? [{ label: BOUNTY_DETAIL.pay.submissionLabel, id: 'bounty-submission' }] : []),
                ]}
              />
            ) : null}
            <div>
              <Button variant="primary" type="submit">
                {BOUNTY_DETAIL.pay.submit}
              </Button>
            </div>
          </Stack>
        </form>
      </Panel>
    );
  })();

  const showManage = canCancel && bounty.status === 'ACTIVE' && !ended;

  const details = [
    { label: BOUNTY_DETAIL.details.sentBy, value: <Address value={bounty.creator} isYou={isSender} /> },
    {
      label: BOUNTY_DETAIL.details.paidIn,
      value: asset.kind === 'bch' ? 'BCH' : asset.symbol || BOUNTY_DETAIL.details.tokenId,
    },
    ...(asset.kind === 'token'
      ? [
          {
            label: BOUNTY_DETAIL.details.tokenId,
            value: (
              <span className="inline-flex items-center gap-1">
                <Code>{formatShortId(asset.tokenId)}</Code>
                <CopyButton value={asset.tokenId} label={ACTIONS.copyId} />
              </span>
            ),
          },
        ]
      : []),
    { label: BOUNTY_DETAIL.details.perWinner, value: <Amount value={prizeUnits} asset={asset} /> },
    { label: BOUNTY_DETAIL.details.winners, value: String(bounty.max_winners) },
    { label: BOUNTY_DETAIL.details.starts, value: startText },
    { label: BOUNTY_DETAIL.details.ends, value: endText ?? BOUNTY_DETAIL.details.noEnd },
    { label: BOUNTY_DETAIL.details.canCancel, value: bounty.cancelable ? BOUNTY_DETAIL.details.yes : BOUNTY_DETAIL.details.no },
    { label: BOUNTY_DETAIL.details.bountyId, value: bounty.campaign_id ? <Code>{formatLogicalId(bounty.campaign_id)}</Code> : null },
    { label: BOUNTY_DETAIL.details.address, value: contract ? <Address value={contract} /> : null },
    { label: BOUNTY_DETAIL.details.funding, value: bounty.tx_hash ? <TxLink txid={bounty.tx_hash} network={network} /> : null },
  ];

  const activity = toActivity(events, bounty, asset, wallet.address ?? null);

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={isSender ? BOUNTY_DETAIL.senderLine : viewerLine(bounty.creator, prize)}
        breadcrumbs={[{ label: BOUNTY_DETAIL.breadcrumb, to: '/bounties' }, { label: title }]}
        status={status}
        role={isSender ? 'sender' : 'viewer'}
        plan={isSender ? plan : undefined}
        stateLine={winnersPaid(bounty.winners_count, bounty.max_winners)}
        metaDescription={isSender ? BOUNTY_DETAIL.senderLine : viewerLine(bounty.creator, prize)}
      />
      <TwoColumn
        main={
          <>
            {actionCard}
            {bounty.description?.trim() ? (
              <Panel title={BOUNTY_DETAIL.about}>
                <p className="whitespace-pre-line break-words text-body text-ink-secondary">{bounty.description}</p>
              </Panel>
            ) : null}
            <Panel title={BOUNTY_DETAIL.winners.title}>
              <Stack gap={4}>
                <ProgressMeter
                  label={winnersPaid(bounty.winners_count, bounty.max_winners)}
                  value={bounty.winners_count}
                  max={bounty.max_winners}
                />
                <List
                  label={BOUNTY_DETAIL.winners.label}
                  columns={winnerColumns}
                  rows={claims}
                  rowKey={(claim) => claim.id}
                  state={claims.length > 0 ? 'ready' : 'empty'}
                  empty={<p className="px-4 py-6 text-body text-ink-secondary">{BOUNTY_DETAIL.winners.empty}</p>}
                  noResults={null}
                  error={null}
                />
              </Stack>
            </Panel>
            <Panel title={BOUNTY_DETAIL.activity}>
              <ActivityList events={activity} state="ready" network={network} />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={BOUNTY_DETAIL.details.title}>
              <DetailList items={details} />
            </Panel>
            <Card>
              <div className="flex flex-col gap-2">
                <Heading level="item" as="h2">
                  {BOUNTY_DETAIL.who.title}
                </Heading>
                <p className="text-small text-ink-secondary">
                  {isSender
                    ? bounty.cancelable
                      ? BOUNTY_DETAIL.who.sender
                      : BOUNTY_DETAIL.who.senderNoCancel
                    : viewerWho(bounty.creator)}
                </p>
              </div>
            </Card>
            {showManage ? (
              <Card>
                <div className="flex flex-col gap-3">
                  <Heading level="item" as="h2">
                    {BOUNTY_DETAIL.manage.title}
                  </Heading>
                  <ManageActions
                    actions={[
                      ...(canPause ? [{ key: 'pause', label: BOUNTY_DETAIL.manage.pause, onClick: () => setReview('pause') }] : []),
                      { key: 'cancel', label: BOUNTY_DETAIL.manage.cancel, danger: true, onClick: () => setReview('cancel') },
                    ]}
                  />
                </div>
              </Card>
            ) : null}
          </>
        }
      />

      {contract ? (
        <TransactionReview
          open={review === 'fund'}
          onClose={() => setReview(null)}
          plan={plan}
          summary={{
            direction: 'out',
            leavesWallet: { amount: totalValue, asset },
            goesTo: { address: contract, name: BOUNTY_DETAIL.thisBounty },
            network,
          }}
          run={runAction(
            () => bountyActionFund(wallet, bounty.id),
            (result) => {
              if (!result.confirmed) void waitForActive();
            },
          )}
          next={<p>{BOUNTY_DETAIL.fund.next}</p>}
        />
      ) : null}

      {payInput ? (
        <TransactionReview
          open={review === 'pay'}
          onClose={() => setReview(null)}
          plan={
            <InsetBlock>
              <p className="text-body text-ink">{payPlan(prize, payInput.winner)}</p>
            </InsetBlock>
          }
          summary={{
            direction: 'out',
            leavesLabel: BOUNTY_DETAIL.leavesBounty,
            leavesWallet: { amount: prizeValue, asset },
            goesTo: { address: payInput.winner },
            network,
          }}
          run={runAction(
            () =>
              bountyActionPayWinner(wallet, {
                bountyId: bounty.id,
                winnerAddress: payInput.winner,
                proofHash: payInput.proofHash,
                rewardAmount: bounty.reward_per_winner,
              }),
            () => {
              setWinner('');
              setSubmission('');
            },
          )}
          next={<p>{BOUNTY_DETAIL.pay.next}</p>}
        />
      ) : null}

      {canPause ? (
        <TransactionReview
          open={review === 'pause'}
          onClose={() => setReview(null)}
          title={BOUNTY_DETAIL.manage.pauseTitle}
          consequence={{ tone: 'warning', body: BOUNTY_DETAIL.manage.pauseBody }}
          confirmLabel={BOUNTY_DETAIL.manage.pause}
          keepLabel={BOUNTY_DETAIL.manage.keep}
          summary={{ direction: 'fee-only', network }}
          run={runAction(async () => ({
            txHash: await setPausedOnChain(wallet, 'bounties', bounty.id, 'pause'),
            confirmed: true,
          }))}
          next={<p>{BOUNTY_DETAIL.manage.paused}</p>}
        />
      ) : null}

      {canResume ? (
        <TransactionReview
          open={review === 'resume'}
          onClose={() => setReview(null)}
          title={BOUNTY_DETAIL.manage.resumeTitle}
          consequence={{ tone: 'info', body: BOUNTY_DETAIL.manage.resumeBody }}
          confirmLabel={BOUNTY_DETAIL.manage.resume}
          summary={{ direction: 'fee-only', network }}
          run={runAction(async () => ({
            txHash: await setPausedOnChain(wallet, 'bounties', bounty.id, 'resume'),
            confirmed: true,
          }))}
          next={<p>{BOUNTY_DETAIL.manage.resumed}</p>}
        />
      ) : null}

      {canCancel ? (
        <TransactionReview
          open={review === 'cancel'}
          onClose={() => setReview(null)}
          title={BOUNTY_DETAIL.manage.cancelTitle}
          plan={
            <InsetBlock>
              <p className="text-body text-ink">{cancelPlan(remaining)}</p>
            </InsetBlock>
          }
          consequence={{ tone: 'danger', body: cancelConsequence(remaining, bounty.creator) }}
          confirmLabel={BOUNTY_DETAIL.manage.cancel}
          keepLabel={BOUNTY_DETAIL.manage.keep}
          summary={{ direction: 'returns', comesBack: { amount: remainingValue, asset }, network }}
          run={runAction(() => bountyActionCancel(wallet, bounty.id))}
          next={<p>{BOUNTY_DETAIL.manage.cancelled}</p>}
        />
      ) : null}
    </PageContainer>
  );
}

