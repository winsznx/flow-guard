import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { Address } from '../components/ui/Address';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AssetName } from '../components/ui/AssetName';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Code } from '../components/ui/Code';
import { CopyField } from '../components/ui/CopyField';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { Heading } from '../components/ui/Heading';
import { MilestoneList } from '../components/ui/MilestoneList';
import { ManageActions } from '../components/ui/ManageActions';
import { Notice } from '../components/ui/Notice';
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
  fetchGrant,
  type GrantActivityEvent,
  type GrantDetailResponse,
  type GrantMilestoneRow,
  type GrantRow,
} from '../services/grantApi';
import {
  cancelGrantOnChain,
  fundGrantContract,
  pauseGrantOnChain,
  releaseGrantMilestone,
  resumeGrantOnChain,
  transferGrantOnChain,
} from '../utils/blockchain';
import { resolveTokenMeta } from '../utils/tokenMeta';
import { asFlowError } from '../copy/errors';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { assetDecimals, formatAmount, formatDate } from '../copy/format';
import {
  CREATE_GRANT,
  GRANT_DETAIL,
  GRANT_DETAILS_LABELS,
  GRANT_REVIEW,
  PAUSED_NOTICE,
  cancelConsequence,
  detailStateLine,
  grantAsset,
  grantTo,
  milestonesPaid,
  nextMilestoneLine,
  pauseConsequence,
  promisedLine,
  releaseConsequence,
  releasePlan,
  resumeConsequence,
  roleDescription,
  shareLine,
  waitingLine,
  whoCanMoveTheMoney,
  type GrantParty,
  type GrantRole,
} from '../copy/grants';
import { lifecycleStatus } from '../copy/status';

type ReviewKind = 'fund' | 'release' | 'pause' | 'resume' | 'cancel' | 'changeRecipient';

type DetailLoad =
  | { kind: 'loading' }
  | { kind: 'error'; notFound: boolean }
  | { kind: 'ready'; data: GrantDetailResponse };

type Report = (step: TxStep) => void;

const POLL_ATTEMPTS = 8;
const POLL_DELAY_MS = 1500;
const CONFIRMED: TxStep = { step: 'confirmed', status: 'done' };

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

/** Display units to smallest units, rounded to the asset's precision. */
function toUnits(value: number | null | undefined, asset: Asset): bigint {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n * 10 ** assetDecimals(asset)));
}

/** Smallest units back to a display string ("0.5"), for the review sheet. */
function unitsToText(units: bigint, asset: Asset): string {
  const decimals = assetDecimals(asset);
  if (decimals === 0) return units.toString();
  const digits = units.toString().padStart(decimals + 1, '0');
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  const whole = digits.slice(0, -decimals);
  return fraction ? `${whole}.${fraction}` : whole;
}

function sortedMilestones(milestones: GrantMilestoneRow[]): GrantMilestoneRow[] {
  return [...milestones].sort((a, b) => a.milestone_index - b.milestone_index);
}

function milestoneState(milestone: GrantMilestoneRow, grant: GrantRow): 'pending' | 'released' | 'cancelled' {
  if (milestone.status === 'RELEASED') return 'released';
  if (milestone.status === 'CANCELLED' || grant.status === 'CANCELLED') return 'cancelled';
  return 'pending';
}

function toActivity(event: GrantActivityEvent, me: string, asset: Asset): ActivityEvent {
  const kind = toEventKind(event.event_type);
  const showsAmount = (kind === 'funded' || kind === 'milestoneReleased') && typeof event.amount === 'number';
  return {
    id: event.id,
    kind,
    object: { kind: 'grant' },
    at: event.created_at,
    actor: event.actor ? { address: event.actor, isYou: sameAddress(event.actor, me) } : undefined,
    amount: showsAmount ? { value: event.amount ?? 0, asset } : undefined,
    txid: event.tx_hash ?? undefined,
  };
}

function DetailSkeleton() {
  return (
    <PageContainer>
      <div className="mb-8 flex flex-col gap-4">
        <Skeleton kind="text" lines={1} />
        <Skeleton kind="tile" />
      </div>
      <TwoColumn
        main={
          <Card>
            <Skeleton kind="row" lines={4} />
          </Card>
        }
        side={
          <Card>
            <Skeleton kind="row" lines={5} />
          </Card>
        }
      />
    </PageContainer>
  );
}

export default function GrantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetwork();
  const me = wallet.address ?? '';

  const [load, setLoad] = useState<DetailLoad>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState<ReviewKind | null>(null);
  const [autoFund, setAutoFund] = useState(() => Boolean((location.state as { freshCreate?: boolean } | null)?.freshCreate));
  const [newRecipient, setNewRecipient] = useState('');
  const [newRecipientValid, setNewRecipientValid] = useState(false);
  const [, setTokenMetaLoaded] = useState(0);

  useEffect(() => {
    if (!id) return undefined;
    let ignore = false;
    setLoad({ kind: 'loading' });
    fetchGrant(id)
      .then((data) => {
        if (!ignore) setLoad({ kind: 'ready', data });
      })
      .catch((error: unknown) => {
        if (ignore) return;
        console.error('Grant did not load', error);
        setLoad({ kind: 'error', notFound: asFlowError(error).code === 'NOT_FOUND' });
      });
    return () => {
      ignore = true;
    };
  }, [id, attempt]);

  const grant = load.kind === 'ready' ? load.data.grant : null;
  const tokenCategory = grant?.token_type !== 'BCH' ? grant?.token_category : null;

  useEffect(() => {
    if (!tokenCategory) return undefined;
    let ignore = false;
    resolveTokenMeta(tokenCategory, network)
      .then((meta) => {
        if (!ignore && meta) setTokenMetaLoaded((n) => n + 1);
      })
      .catch((error: unknown) => console.warn('Token details did not load', error));
    return () => {
      ignore = true;
    };
  }, [tokenCategory, network]);

  const refresh = useCallback(async (): Promise<GrantRow | null> => {
    if (!id) return null;
    try {
      const data = await fetchGrant(id);
      setLoad({ kind: 'ready', data });
      return data.grant;
    } catch (error) {
      console.warn('Grant refresh did not load', error);
      return null;
    }
  }, [id]);

  const pollUntilActive = useCallback(async () => {
    for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
      const latest = await refresh();
      if (latest && latest.status !== 'PENDING') return;
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    }
  }, [refresh]);

  const isSender = Boolean(grant && sameAddress(grant.creator, me));
  const isRecipient = Boolean(grant && sameAddress(grant.recipient, me));
  const canFund = Boolean(grant && isSender && grant.status === 'PENDING');

  useEffect(() => {
    if (!autoFund || load.kind !== 'ready') return;
    setAutoFund(false);
    navigate(location.pathname, { replace: true, state: null });
    if (canFund) setReview('fund');
  }, [autoFund, load.kind, canFund, navigate, location.pathname]);

  if (load.kind === 'loading') return <DetailSkeleton />;

  if (load.kind === 'error' || !grant) {
    const notFound = load.kind === 'error' && load.notFound;
    return (
      <PageContainer>
        <Card>
          <ErrorState
            title={notFound ? GRANT_DETAIL.notFound : GRANT_DETAIL.loadFailed}
            reason={notFound ? GRANT_DETAIL.notFoundReason : undefined}
            onRetry={notFound ? undefined : () => setAttempt((n) => n + 1)}
            action={
              <ButtonLink variant="ghost" to="/grants">
                {GRANT_DETAIL.backToGrants}
              </ButtonLink>
            }
          />
        </Card>
      </PageContainer>
    );
  }

  const { milestones: rawMilestones, events } = load.data;
  const milestones = sortedMilestones(rawMilestones);
  const asset = grantAsset(grant);
  const role: GrantRole = isSender ? 'sender' : isRecipient ? 'recipient' : 'viewer';
  const sender: GrantParty = { address: grant.creator, isYou: isSender };
  const recipient: GrantParty = { address: grant.recipient, isYou: isRecipient };
  const statusKey = lifecycleStatus(grant.status) ?? 'notFunded';

  const perMilestone = toUnits(grant.amount_per_milestone, asset);
  const left = Math.max(0, grant.milestones_total - grant.milestones_completed);
  const totalUnits = toUnits(grant.total_amount, asset);
  const releasedUnits = toUnits(grant.total_released, asset);
  const stillToComeUnits = grant.status === 'CANCELLED' || grant.status === 'COMPLETED' ? 0n : perMilestone * BigInt(left);
  const comesBackUnits = totalUnits > releasedUnits ? totalUnits - releasedUnits : 0n;
  const perMilestoneText = unitsToText(perMilestone, asset);
  const money = (units: bigint) => formatAmount(unitsToText(units, asset), asset);

  const nextMilestone = milestones.find((milestone) => milestoneState(milestone, grant) === 'pending') ?? null;
  const nextNumber = nextMilestone?.milestone_index ?? grant.milestones_completed + 1;
  const nextTitle = nextMilestone?.title?.trim() || null;

  const canRelease = isSender && grant.status === 'ACTIVE' && grant.milestones_completed < grant.milestones_total;
  const canPause = isSender && grant.cancelable && grant.status === 'ACTIVE';
  const canResume = isSender && grant.status === 'PAUSED';
  const canCancel = isSender && grant.cancelable && (grant.status === 'ACTIVE' || grant.status === 'PAUSED');
  const canChangeRecipient = isRecipient && grant.transferable && grant.status === 'ACTIVE';
  const hasManage = canPause || canCancel || canChangeRecipient;

  const title = grant.title?.trim() || grantTo(grant.recipient);
  const contractAddress = grant.contract_address ?? '';
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const whoCanStop = grant.cancelable ? GRANT_REVIEW.whoCanStopSender : GRANT_REVIEW.whoCanStopNobody;

  const milestoneSchedule = {
    kind: 'milestones' as const,
    asset,
    milestones: milestones.map((milestone) => ({
      title: milestone.title ?? CREATE_GRANT.milestoneTitle(milestone.milestone_index),
      amount: perMilestoneText,
    })),
  };
  const plan = <PlanSentence recipient={{ address: grant.recipient }} schedule={milestoneSchedule} />;

  const closeReview = () => setReview(null);

  const finish = async (report: Report, run: () => Promise<string>): Promise<{ txid: string }> => {
    try {
      const txid = await run();
      report(CONFIRMED);
      return { txid };
    } finally {
      void refresh();
    }
  };

  const runFund = async (report: Report) => {
    try {
      const result = await fundGrantContract(wallet, grant.id);
      if (result.confirmation === 'confirmed') {
        report(CONFIRMED);
        void refresh();
      } else {
        void pollUntilActive();
      }
      return { txid: result.txHash };
    } catch (error) {
      void refresh();
      throw error;
    }
  };

  const runRelease = (report: Report) => finish(report, async () => (await releaseGrantMilestone(wallet, grant.id)).txHash);
  const runPause = (report: Report) => finish(report, () => pauseGrantOnChain(wallet, grant.id));
  const runResume = (report: Report) => finish(report, () => resumeGrantOnChain(wallet, grant.id));
  const runCancel = (report: Report) => finish(report, async () => (await cancelGrantOnChain(wallet, grant.id)).txHash);
  const runChangeRecipient = (report: Report) =>
    finish(report, async () => {
      const result = await transferGrantOnChain(wallet, grant.id, newRecipient.trim());
      setNewRecipient('');
      setNewRecipientValid(false);
      return result.txHash;
    });

  const changingToSelf = sameAddress(newRecipient, grant.recipient);
  const progress = (
    <ProgressMeter
      label={milestonesPaid(grant.milestones_completed, grant.milestones_total)}
      value={grant.milestones_completed}
      max={grant.milestones_total}
    />
  );

  const actionCard = (
    <Panel>
      <div className="flex flex-col gap-1">
        <p className="text-label text-ink-secondary">
          {role === 'recipient' && stillToComeUnits === 0n ? GRANT_DETAIL.receivedSoFar : GRANT_DETAIL.stillToCome}
        </p>
        <Amount
          value={unitsToText(role === 'recipient' && stillToComeUnits === 0n ? releasedUnits : stillToComeUnits, asset)}
          asset={asset}
          size="xl"
        />
        <p className="text-small text-ink-muted">{promisedLine(money(totalUnits))}</p>
      </div>
      {progress}
      {grant.status === 'PAUSED' ? (
        <Notice tone="warning" title={PAUSED_NOTICE.title}>
          {isSender ? PAUSED_NOTICE.sender : PAUSED_NOTICE.recipient}
        </Notice>
      ) : null}
      {grant.status === 'COMPLETED' ? <p className="text-body text-ink">{GRANT_DETAIL.allPaid}</p> : null}
      {grant.status === 'CANCELLED' ? <p className="text-body text-ink">{GRANT_DETAIL.cancelledLine}</p> : null}
      {grant.status === 'PENDING' && !isSender ? (
        <p className="text-body text-ink-secondary">{waitingLine(role, 'notFunded', sender, null)}</p>
      ) : null}
      {grant.status === 'ACTIVE' && !isSender && nextMilestone ? (
        <p className="text-body text-ink-secondary">{waitingLine(role, 'active', sender, money(perMilestone))}</p>
      ) : null}
      {canRelease ? <p className="text-body text-ink-secondary">{nextMilestoneLine(nextNumber, nextTitle)}</p> : null}
      {canFund || canRelease || canResume ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {canFund && contractAddress ? (
            <Button variant="primary" size="lg" onClick={() => setReview('fund')}>
              {GRANT_DETAIL.fund(money(totalUnits) ?? '')}
            </Button>
          ) : null}
          {canFund && !contractAddress ? (
            <Button variant="primary" size="lg" disabled disabledReason={GRANT_DETAIL.contractNotReady}>
              {GRANT_DETAIL.fund(money(totalUnits) ?? '')}
            </Button>
          ) : null}
          {canRelease ? (
            <Button variant="primary" size="lg" onClick={() => setReview('release')}>
              {GRANT_DETAIL.release(money(perMilestone) ?? '')}
            </Button>
          ) : null}
          {canResume ? (
            <Button variant="primary" size="lg" onClick={() => setReview('resume')}>
              {GRANT_DETAIL.resume}
            </Button>
          ) : null}
        </div>
      ) : null}
      {isSender && grant.status !== 'PENDING' && grant.status !== 'CANCELLED' && shareUrl ? (
        <div className="flex flex-col gap-1.5">
          <CopyField label={GRANT_DETAIL.shareLink} value={shareUrl} />
          <p className="text-small text-ink-secondary">{shareLine(recipient)}</p>
        </div>
      ) : null}
    </Panel>
  );

  const milestoneRows = milestones.map((milestone) => ({
    id: milestone.id,
    title: milestone.title?.trim() || CREATE_GRANT.milestoneTitle(milestone.milestone_index),
    amount: perMilestoneText,
    status: milestoneState(milestone, grant),
  }));

  const details = (
    <Panel title={GRANT_DETAIL.detailsPanel}>
      <DetailList
        items={[
          { label: GRANT_DETAILS_LABELS.from, value: <Address value={grant.creator} isYou={isSender} /> },
          { label: GRANT_DETAILS_LABELS.to, value: <Address value={grant.recipient} isYou={isRecipient} /> },
          {
            label: GRANT_DETAILS_LABELS.paysIn,
            value: <AssetName asset={asset} />,
          },
          { label: GRANT_DETAILS_LABELS.perMilestone, value: <Amount value={perMilestoneText} asset={asset} /> },
          { label: GRANT_DETAILS_LABELS.total, value: <Amount value={grant.total_amount} asset={asset} /> },
          {
            label: GRANT_DETAILS_LABELS.pauseOrCancel,
            value: grant.cancelable ? GRANT_DETAILS_LABELS.yesBySender : GRANT_DETAILS_LABELS.no,
          },
          {
            label: GRANT_DETAILS_LABELS.changeRecipient,
            value: grant.transferable ? GRANT_DETAILS_LABELS.yesByRecipient : GRANT_DETAILS_LABELS.no,
          },
          { label: GRANT_DETAILS_LABELS.created, value: formatDate(grant.created_at) },
          { label: GRANT_DETAIL.contract, value: contractAddress ? <Address value={contractAddress} /> : null },
          {
            label: GRANT_DETAIL.fundingTransaction,
            value: grant.tx_hash ? <TxLink txid={grant.tx_hash} network={network} /> : GRANT_DETAIL.notFundedYet,
          },
          { label: GRANT_DETAILS_LABELS.reference, value: grant.grant_number ? <Code>{grant.grant_number}</Code> : null },
        ]}
      />
    </Panel>
  );

  const whoCard = (
    <Card as="section">
      <div className="flex flex-col gap-2">
        <Heading level="item" as="h2">
          {GRANT_DETAIL.whoPanel}
        </Heading>
        {whoCanMoveTheMoney(role, sender, recipient, grant.cancelable).map((line) => (
          <p key={line} className="text-small text-ink-secondary">
            {line}
          </p>
        ))}
      </div>
    </Card>
  );

  const manageCard = hasManage ? (
    <Card as="section">
      <div className="flex flex-col gap-3">
        <Heading level="item" as="h2">
          {GRANT_DETAIL.managePanel}
        </Heading>
        <ManageActions
          actions={[
            ...(canPause ? [{ key: 'pause', label: GRANT_DETAIL.pause, onClick: () => setReview('pause') }] : []),
            ...(canCancel
              ? [{ key: 'cancel', label: GRANT_DETAIL.cancel, danger: true, onClick: () => setReview('cancel') }]
              : []),
          ]}
        />
        {canChangeRecipient ? (
          <div className="flex flex-col gap-3">
            <AddressInput
              label={GRANT_DETAIL.newRecipient}
              helper={GRANT_DETAIL.newRecipientHelper}
              value={newRecipient}
              onChange={setNewRecipient}
              onValidChange={setNewRecipientValid}
              network={network}
              error={changingToSelf ? GRANT_DETAIL.sameRecipient : undefined}
            />
            {newRecipientValid && !changingToSelf ? (
              <Button variant="secondary" onClick={() => setReview('changeRecipient')}>
                {GRANT_DETAIL.changeRecipient}
              </Button>
            ) : (
              <Button variant="secondary" disabled disabledReason={GRANT_DETAIL.newRecipientNeeded}>
                {GRANT_DETAIL.changeRecipient}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Card>
  ) : null;

  const releaseAmountText = money(perMilestone) ?? '';

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={roleDescription(role, sender, recipient)}
        breadcrumbs={[{ label: GRANT_DETAIL.breadcrumb, to: '/grants' }, { label: title }]}
        status={statusKey}
        role={role}
        plan={isSender ? plan : undefined}
        stateLine={detailStateLine(grant.milestones_completed, grant.milestones_total, stillToComeUnits > 0n ? money(stillToComeUnits) : null)}
      />
      <TwoColumn
        main={
          <>
            {actionCard}
            <section aria-label={GRANT_DETAIL.milestonesPanel} className="flex min-w-0 flex-col gap-4">
              <Heading level="section">{GRANT_DETAIL.milestonesPanel}</Heading>
              <MilestoneList asset={asset} milestones={milestoneRows} />
            </section>
            <Panel title={GRANT_DETAIL.activityPanel}>
              <ActivityList
                events={events.map((event) => toActivity(event, me, asset))}
                state={events.length === 0 ? 'empty' : 'ready'}
                network={network}
              />
            </Panel>
          </>
        }
        side={
          <>
            {details}
            {whoCard}
            {manageCard}
          </>
        }
      />

      <TransactionReview
        open={review === 'fund' && Boolean(contractAddress)}
        onClose={closeReview}
        plan={plan}
        summary={{
          direction: 'out',
          leavesWallet: { amount: unitsToText(totalUnits, asset), asset },
          goesTo: { address: contractAddress, name: GRANT_DETAIL.contractName },
          whoCanStop,
          network,
        }}
        run={runFund}
        next={GRANT_REVIEW.fundNext}
      />
      <TransactionReview
        open={review === 'release'}
        onClose={closeReview}
        plan={<p className="text-body text-ink">{releasePlan(nextNumber, nextTitle, releaseAmountText, recipient)}</p>}
        consequence={{ tone: 'info', body: releaseConsequence(releaseAmountText, recipient) }}
        summary={{
          direction: 'out',
          source: 'contract',
          leavesWallet: { amount: unitsToText(perMilestone, asset), asset },
          goesTo: { address: grant.recipient },
          network,
        }}
        run={runRelease}
        next={GRANT_REVIEW.releaseNext}
      />
      <TransactionReview
        open={review === 'pause'}
        onClose={closeReview}
        title={GRANT_REVIEW.pauseTitle}
        consequence={{ tone: 'warning', body: pauseConsequence(recipient) }}
        confirmLabel={GRANT_DETAIL.pause}
        keepLabel={GRANT_DETAIL.keep}
        summary={{ direction: 'fee-only', network }}
        run={runPause}
        next={GRANT_REVIEW.pauseNext}
      />
      <TransactionReview
        open={review === 'resume'}
        onClose={closeReview}
        title={GRANT_REVIEW.resumeTitle}
        consequence={{ tone: 'info', body: resumeConsequence(recipient) }}
        confirmLabel={GRANT_DETAIL.resume}
        summary={{ direction: 'fee-only', network }}
        run={runResume}
        next={GRANT_REVIEW.resumeNext}
      />
      <TransactionReview
        open={review === 'cancel'}
        onClose={closeReview}
        title={GRANT_REVIEW.cancelTitle}
        consequence={{
          tone: 'danger',
          body: cancelConsequence(
            recipient,
            releasedUnits > 0n ? money(releasedUnits) : null,
            comesBackUnits > 0n ? money(comesBackUnits) : null,
          ),
        }}
        confirmLabel={GRANT_DETAIL.cancel}
        keepLabel={GRANT_DETAIL.keep}
        summary={{
          direction: 'returns',
          comesBack: { amount: unitsToText(comesBackUnits, asset), asset },
          recipientKeeps: releasedUnits > 0n ? { amount: unitsToText(releasedUnits, asset), asset } : undefined,
          network,
        }}
        run={runCancel}
        next={GRANT_REVIEW.cancelNext}
      />
      <TransactionReview
        open={review === 'changeRecipient'}
        onClose={closeReview}
        title={GRANT_REVIEW.changeRecipientTitle}
        plan={
          <DetailList
            items={[{ label: GRANT_DETAIL.newRecipient, value: newRecipient.trim() ? <Address value={newRecipient.trim()} variant="full" /> : null }]}
          />
        }
        consequence={{ tone: 'danger', body: GRANT_REVIEW.changeRecipientBody }}
        confirmLabel={GRANT_DETAIL.changeRecipient}
        keepLabel={GRANT_DETAIL.keep}
        summary={{ direction: 'fee-only', network }}
        run={runChangeRecipient}
        next={GRANT_REVIEW.changeRecipientNext}
      />
    </PageContainer>
  );
}
