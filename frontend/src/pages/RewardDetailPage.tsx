import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { TwoColumn } from '../components/layout/TwoColumn';
import { ActivityList } from '../components/ui/ActivityList';
import { Address } from '../components/ui/Address';
import { AddressInput } from '../components/ui/AddressInput';
import { Amount } from '../components/ui/Amount';
import { AssetName } from '../components/ui/AssetName';
import { AmountInput } from '../components/ui/AmountInput';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { Code } from '../components/ui/Code';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { ErrorSummary } from '../components/ui/ErrorSummary';
import { Heading } from '../components/ui/Heading';
import { ArrowUpFromLine } from '../components/ui/Icon';
import { InsetBlock } from '../components/ui/InsetBlock';
import { List, type Column } from '../components/ui/List';
import { Notice } from '../components/ui/Notice';
import { ManageActions } from '../components/ui/ManageActions';
import { Panel } from '../components/ui/Panel';
import { ProgressMeter } from '../components/ui/ProgressMeter';
import { Skeleton } from '../components/ui/Skeleton';
import { TransactionReview, type TxStep } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import type { Asset } from '../components/ui/types';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { asFlowError, type FlowError } from '../copy/errors';
import { toEventKind, type ActivityEvent } from '../copy/events';
import { formatAmount, formatDate } from '../copy/format';
import {
  REWARD_DETAIL,
  REWARD_TYPE,
  budgetUsed,
  cancelConsequence,
  endedLine,
  fundButton,
  fundLine,
  overBudget,
  overLimit,
  sendButton,
  sendLine,
  sendPlan,
  sendsFrom,
  stateLine,
  tooManyDecimals,
  upTo,
  viewerLine,
  viewerWho,
} from '../copy/rewards';
import {
  fetchReward,
  type RewardActivityEvent,
  type RewardDistributionRow,
  type RewardRow,
  type RewardStatus,
} from '../services/rewardApi';
import { cancelRewardOnChain, distributeRewardOnChain, fundRewardContract, setPausedOnChain } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import {
  amountEntry,
  campaignAsset,
  campaignStatus,
  parseAmount,
  parsedUnits,
  storedUnits,
  unitsToStored,
} from '../utils/campaignAmounts';
import { resolveTokenMeta, type TokenMeta } from '../utils/tokenMeta';

const ADDRESS_PREFIX = { mainnet: 'bitcoincash', chipnet: 'bchtest' } as const;
const BCH: Asset = { kind: 'bch' };

type ActionResult = { txHash: string; confirmed: boolean };

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function withPrefix(address: string, network: 'mainnet' | 'chipnet'): string {
  const value = address.trim();
  return value.includes(':') ? value : `${ADDRESS_PREFIX[network]}:${value}`;
}

function toActivity(
  events: RewardActivityEvent[],
  campaign: RewardRow,
  asset: Asset,
  viewer: string | null,
): ActivityEvent[] {
  return events
    .map((event) => {
      const kind = toEventKind(event.event_type, 'rewardProgram');
      const withAmount = (kind === 'funded' || kind === 'cancelled' || kind === 'rewardSent') && event.amount !== null;
      return {
        id: event.id,
        kind,
        object: {
          kind: 'rewardProgram' as const,
          owner: { address: campaign.creator, isYou: sameAddress(campaign.creator, viewer) },
        },
        at: event.created_at,
        actor: event.actor ? { address: event.actor, isYou: sameAddress(event.actor, viewer) } : undefined,
        amount: withAmount
          ? { value: formatAmount(storedUnits(event.amount, campaign), asset, { unit: false }) ?? '0', asset }
          : undefined,
        txid: event.tx_hash ?? undefined,
      };
    });
}

type Load =
  | { state: 'loading' }
  | { state: 'error'; error: FlowError }
  | { state: 'ready'; campaign: RewardRow; distributions: RewardDistributionRow[]; events: RewardActivityEvent[] };

type Review = 'fund' | 'send' | 'pause' | 'resume' | 'cancel' | null;
type SendInput = { recipient: string; amount: number; units: bigint };

export default function RewardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();

  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [tokenMeta, setTokenMeta] = useState<TokenMeta | null>(null);
  const [review, setReview] = useState<Review>(null);
  const [recipient, setRecipient] = useState('');
  const [recipientValid, setRecipientValid] = useState(false);
  const [amount, setAmount] = useState('');
  const [sendErrors, setSendErrors] = useState<{ recipient?: string; amount?: string }>({});
  const [sendSummary, setSendSummary] = useState<string | null>(null);
  const [sendInput, setSendInput] = useState<SendInput | null>(null);

  const refresh = useCallback(async (): Promise<RewardStatus | null> => {
    if (!id) return null;
    const data = await fetchReward(id);
    setLoad({ state: 'ready', campaign: data.campaign, distributions: data.distributions, events: data.events });
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

  const tokenCategory = load.state === 'ready' && load.campaign.token_type !== 'BCH' ? load.campaign.token_category : null;

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
  const campaign = ready?.campaign ?? null;
  const asset = useMemo(() => (campaign ? campaignAsset(campaign, tokenMeta) : BCH), [campaign, tokenMeta]);

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

  if (load.state === 'error' || !ready || !campaign) {
    const error = load.state === 'error' ? load.error : null;
    return (
      <PageContainer>
        <Panel>
          <ErrorState
            title={REWARD_DETAIL.loadFailed}
            reason={error?.message}
            onRetry={error?.code === 'NOT_FOUND' ? undefined : reload}
            action={
              error?.code === 'NOT_FOUND' ? (
                <ButtonLink variant="secondary" to="/rewards">
                  {REWARD_DETAIL.back}
                </ButtonLink>
              ) : undefined
            }
          />
        </Panel>
      </PageContainer>
    );
  }

  const { distributions, events } = ready;
  const isSender = sameAddress(wallet.address, campaign.creator);
  const title = campaign.title?.trim() || REWARD_DETAIL.untitled;
  const budgetUnits = storedUnits(campaign.total_pool, campaign);
  const paidUnits = storedUnits(campaign.distributed_total, campaign);
  const limitUnits = storedUnits(campaign.max_reward_amount, campaign);
  const leftUnits = budgetUnits > paidUnits ? budgetUnits - paidUnits : 0n;
  const maxUnits = leftUnits < limitUnits ? leftUnits : limitUnits;
  const budget = formatAmount(budgetUnits, asset) ?? '';
  const left = formatAmount(leftUnits, asset) ?? '';
  const limit = formatAmount(limitUnits, asset) ?? '';
  const paid = formatAmount(paidUnits, asset) ?? '';
  const budgetValue = formatAmount(budgetUnits, asset, { unit: false }) ?? '0';
  const leftValue = formatAmount(leftUnits, asset, { unit: false }) ?? '0';
  const sentCount = campaign.distributed_count ?? distributions.length;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const notStarted = Boolean(campaign.start_date && nowSeconds < campaign.start_date);
  const ended = Boolean(campaign.end_date && campaign.end_date > 0 && nowSeconds > campaign.end_date);
  const status = campaignStatus(campaign);
  const canCancel = isSender && (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') && leftUnits > 0n;
  const canPause = canCancel && campaign.status === 'ACTIVE' && !ended;
  const canResume = isSender && campaign.status === 'PAUSED';
  const startText = formatDate(campaign.start_date);
  const endText = formatDate(campaign.end_date ?? null);
  const contract = campaign.contract_address ?? null;
  const entry = amountEntry(campaign, asset);
  const parsed = parseAmount(amount, entry.decimals);
  const typed = parsedUnits(parsed);

  const submitSend = (event: FormEvent): void => {
    event.preventDefault();
    const nextErrors: { recipient?: string; amount?: string } = {};
    if (!recipient.trim()) nextErrors.recipient = REWARD_DETAIL.send.recipientMissing;
    else if (!recipientValid) nextErrors.recipient = REWARD_DETAIL.send.recipientHelper;
    if (parsed && 'tooPrecise' in parsed) nextErrors.amount = tooManyDecimals(entry.decimals);
    else if (typed === null || typed <= 0n) nextErrors.amount = REWARD_DETAIL.send.amountMissing;
    else if (typed > limitUnits) nextErrors.amount = overLimit(limit);
    else if (typed > leftUnits) nextErrors.amount = overBudget(left);
    setSendErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || typed === null) {
      setSendSummary(REWARD_DETAIL.send.fixFields);
      return;
    }
    setSendSummary(null);
    setSendInput({ recipient: withPrefix(recipient, network), amount: unitsToStored(typed, campaign), units: typed });
    setReview('send');
  };

  const runAction = (action: () => Promise<ActionResult>, after?: (result: ActionResult) => void) =>
    async (report: (step: TxStep) => void): Promise<{ txid?: string }> => {
      const result = await action();
      if (result.confirmed) report({ step: 'confirmed', status: 'done' });
      refreshQuietly();
      after?.(result);
      return { txid: result.txHash };
    };

  const sentColumns: Column<RewardDistributionRow>[] = [
    {
      key: 'recipient',
      header: REWARD_DETAIL.sent.recipient,
      primary: true,
      cell: (row) => <Address value={row.recipient} isYou={sameAddress(row.recipient, wallet.address)} />,
    },
    {
      key: 'amount',
      header: REWARD_DETAIL.sent.amount,
      align: 'end',
      mobile: 'bottom-start',
      cell: (row) => <Amount value={storedUnits(row.amount, campaign)} asset={asset} />,
    },
    {
      key: 'sent',
      header: REWARD_DETAIL.sent.sentOn,
      mobile: 'bottom-end',
      cell: (row) => formatDate(row.distributed_at),
    },
    {
      key: 'tx',
      header: REWARD_DETAIL.sent.transaction,
      mobile: 'top',
      cell: (row) => (row.tx_hash ? <TxLink txid={row.tx_hash} network={network} /> : null),
    },
  ];

  const cancelButton = (
    <Button variant="danger-quiet" onClick={() => setReview('cancel')}>
      {REWARD_DETAIL.manage.cancel}
    </Button>
  );

  const actionCard = (() => {
    if (!isSender) return null;
    if (campaign.status === 'PENDING') {
      return (
        <Panel title={REWARD_DETAIL.fund.title} description={fundLine(budget)}>
          <Stack gap={4}>
            <p className="text-small text-ink-secondary">{REWARD_DETAIL.fund.twoSteps}</p>
            <div>
              {contract ? (
                <Button variant="primary" size="lg" leadingIcon={ArrowUpFromLine} onClick={() => setReview('fund')}>
                  {fundButton(budget)}
                </Button>
              ) : (
                <Button variant="primary" size="lg" leadingIcon={ArrowUpFromLine} disabled disabledReason={REWARD_DETAIL.fund.noAddress}>
                  {fundButton(budget)}
                </Button>
              )}
            </div>
          </Stack>
        </Panel>
      );
    }
    if (campaign.status === 'PAUSED') {
      return (
        <Panel title={REWARD_DETAIL.send.title}>
          <Stack gap={4}>
            <Notice tone="warning" title={REWARD_DETAIL.send.pausedTitle}>
              {REWARD_DETAIL.send.pausedLine}
            </Notice>
            <div className="flex flex-wrap gap-3">
              {canResume ? (
                <Button variant="primary" onClick={() => setReview('resume')}>
                  {REWARD_DETAIL.manage.resume}
                </Button>
              ) : null}
              {canCancel ? cancelButton : null}
            </div>
          </Stack>
        </Panel>
      );
    }
    if (campaign.status !== 'ACTIVE') return null;
    if (leftUnits === 0n) return <Notice tone="success" title={REWARD_DETAIL.send.usedUp} />;
    if (ended) {
      return (
        <Panel title={REWARD_DETAIL.send.title}>
          <Stack gap={4}>
            <p className="text-body text-ink-secondary">{endedLine(left)}</p>
            {canCancel ? <div>{cancelButton}</div> : null}
          </Stack>
        </Panel>
      );
    }
    if (notStarted) {
      return (
        <Panel title={REWARD_DETAIL.send.title} description={sendLine(limit, left)}>
          <Notice tone="info" title={sendsFrom(startText ?? '')} />
        </Panel>
      );
    }
    const sendLabel = typed !== null && typed > 0n ? sendButton(formatAmount(typed, asset) ?? '') : REWARD_DETAIL.send.submit;
    return (
      <Panel title={REWARD_DETAIL.send.title} description={sendLine(limit, left)}>
        <form noValidate onSubmit={submitSend}>
          <Stack gap={4}>
            <AddressInput
              id="reward-recipient"
              label={REWARD_DETAIL.send.recipientLabel}
              value={recipient}
              onChange={(value) => {
                setRecipient(value);
                setSendErrors((prev) => ({ ...prev, recipient: undefined }));
              }}
              onValidChange={setRecipientValid}
              network={network}
              accept="p2pkh"
              helper={REWARD_DETAIL.send.recipientHelper}
              error={sendErrors.recipient}
            />
            <AmountInput
              id="reward-amount"
              label={REWARD_DETAIL.send.amountLabel}
              asset={entry.asset}
              unit={entry.unit}
              value={amount}
              onChange={(value) => {
                setAmount(value);
                setSendErrors((prev) => ({ ...prev, amount: undefined }));
              }}
              helper={upTo(formatAmount(maxUnits, asset) ?? '')}
              error={sendErrors.amount}
            />
            {sendSummary ? (
              <ErrorSummary
                title={REWARD_DETAIL.send.errorTitle}
                message={sendSummary}
                fields={[
                  ...(sendErrors.recipient ? [{ label: REWARD_DETAIL.send.recipientLabel, id: 'reward-recipient' }] : []),
                  ...(sendErrors.amount ? [{ label: REWARD_DETAIL.send.amountLabel, id: 'reward-amount' }] : []),
                ]}
              />
            ) : null}
            <div>
              <Button variant="primary" type="submit">
                {sendLabel}
              </Button>
            </div>
          </Stack>
        </form>
      </Panel>
    );
  })();

  const showManage = canCancel && campaign.status === 'ACTIVE' && !ended;

  const details = [
    { label: REWARD_DETAIL.details.sentBy, value: <Address value={campaign.creator} isYou={isSender} /> },
    { label: REWARD_DETAIL.details.type, value: REWARD_TYPE[campaign.reward_category] ?? REWARD_TYPE.CUSTOM },
    {
      label: REWARD_DETAIL.details.paidIn,
      value: <AssetName asset={asset} />,
    },
    { label: REWARD_DETAIL.details.budget, value: <Amount value={budgetUnits} asset={asset} /> },
    { label: REWARD_DETAIL.details.limit, value: <Amount value={limitUnits} asset={asset} /> },
    { label: REWARD_DETAIL.details.starts, value: startText },
    { label: REWARD_DETAIL.details.ends, value: endText ?? REWARD_DETAIL.details.noEnd },
    { label: REWARD_DETAIL.details.programId, value: campaign.campaign_id ? <Code>{formatLogicalId(campaign.campaign_id)}</Code> : null },
    { label: REWARD_DETAIL.details.address, value: contract ? <Address value={contract} /> : null },
    { label: REWARD_DETAIL.details.funding, value: campaign.tx_hash ? <TxLink txid={campaign.tx_hash} network={network} /> : null },
  ];

  const activity = toActivity(events, campaign, asset, wallet.address ?? null);
  const description = isSender ? REWARD_DETAIL.senderLine : viewerLine(campaign.creator);

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ label: REWARD_DETAIL.breadcrumb, to: '/rewards' }, { label: title }]}
        status={status}
        role={isSender ? 'sender' : 'viewer'}
        stateLine={campaign.status === 'PENDING' ? undefined : stateLine(left, sentCount)}
      />
      <TwoColumn
        main={
          <>
            {actionCard}
            {campaign.description?.trim() ? (
              <Panel title={REWARD_DETAIL.about}>
                <p className="whitespace-pre-line break-words text-body text-ink-secondary">{campaign.description}</p>
              </Panel>
            ) : null}
            <Panel title={REWARD_DETAIL.sent.title}>
              <Stack gap={4}>
                <ProgressMeter
                  label={budgetUsed(paid, budget)}
                  value={Number(paidUnits)}
                  max={Number(budgetUnits)}
                />
                <List
                  label={REWARD_DETAIL.sent.label}
                  columns={sentColumns}
                  rows={distributions}
                  rowKey={(row) => row.id}
                  state={distributions.length > 0 ? 'ready' : 'empty'}
                  empty={<p className="px-4 py-6 text-body text-ink-secondary">{REWARD_DETAIL.sent.empty}</p>}
                  noResults={null}
                  error={null}
                />
              </Stack>
            </Panel>
            <Panel title={REWARD_DETAIL.activity}>
              <ActivityList events={activity} state="ready" network={network} />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={REWARD_DETAIL.details.title}>
              <DetailList items={details} />
            </Panel>
            <Card>
              <div className="flex flex-col gap-2">
                <Heading level="item" as="h2">
                  {REWARD_DETAIL.who.title}
                </Heading>
                <p className="text-small text-ink-secondary">
                  {isSender ? REWARD_DETAIL.who.sender : viewerWho(campaign.creator)}
                </p>
              </div>
            </Card>
            {showManage ? (
              <Card>
                <div className="flex flex-col gap-3">
                  <Heading level="item" as="h2">
                    {REWARD_DETAIL.manage.title}
                  </Heading>
                  <ManageActions
                    actions={[
                      ...(canPause ? [{ key: 'pause', label: REWARD_DETAIL.manage.pause, onClick: () => setReview('pause') }] : []),
                      { key: 'cancel', label: REWARD_DETAIL.manage.cancel, danger: true, onClick: () => setReview('cancel') },
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
          summary={{
            direction: 'out',
            leavesWallet: { amount: budgetValue, asset },
            goesTo: { address: contract, name: REWARD_DETAIL.thisProgram },
            network,
          }}
          run={runAction(
            async () => {
              const result = await fundRewardContract(wallet, campaign.id);
              return { txHash: result.txHash, confirmed: result.confirmation === 'confirmed' };
            },
            (result) => {
              if (!result.confirmed) void waitForActive();
            },
          )}
          next={<p>{REWARD_DETAIL.fund.next}</p>}
        />
      ) : null}

      {sendInput ? (
        <TransactionReview
          open={review === 'send'}
          onClose={() => setReview(null)}
          plan={
            <InsetBlock>
              <p className="text-body text-ink">
                {sendPlan(formatAmount(sendInput.units, asset) ?? '', sendInput.recipient)}
              </p>
            </InsetBlock>
          }
          summary={{
            direction: 'out',
            leavesLabel: REWARD_DETAIL.leavesProgram,
            leavesWallet: { amount: formatAmount(sendInput.units, asset, { unit: false }) ?? '0', asset },
            goesTo: { address: sendInput.recipient },
            network,
          }}
          run={runAction(
            async () => {
              const result = await distributeRewardOnChain(wallet, campaign.id, sendInput.recipient, sendInput.amount);
              return { txHash: result.txHash, confirmed: result.confirmation === 'confirmed' };
            },
            () => {
              setRecipient('');
              setAmount('');
            },
          )}
          next={<p>{REWARD_DETAIL.send.next}</p>}
        />
      ) : null}

      {canPause ? (
        <TransactionReview
          open={review === 'pause'}
          onClose={() => setReview(null)}
          title={REWARD_DETAIL.manage.pauseTitle}
          consequence={{ tone: 'warning', body: REWARD_DETAIL.manage.pauseBody }}
          confirmLabel={REWARD_DETAIL.manage.pause}
          keepLabel={REWARD_DETAIL.manage.keep}
          summary={{ direction: 'fee-only', network }}
          run={runAction(async () => ({
            txHash: await setPausedOnChain(wallet, 'rewards', campaign.id, 'pause'),
            confirmed: true,
          }))}
          next={<p>{REWARD_DETAIL.manage.paused}</p>}
        />
      ) : null}

      {canResume ? (
        <TransactionReview
          open={review === 'resume'}
          onClose={() => setReview(null)}
          title={REWARD_DETAIL.manage.resumeTitle}
          consequence={{ tone: 'info', body: REWARD_DETAIL.manage.resumeBody }}
          confirmLabel={REWARD_DETAIL.manage.resume}
          summary={{ direction: 'fee-only', network }}
          run={runAction(async () => ({
            txHash: await setPausedOnChain(wallet, 'rewards', campaign.id, 'resume'),
            confirmed: true,
          }))}
          next={<p>{REWARD_DETAIL.manage.resumed}</p>}
        />
      ) : null}

      {canCancel ? (
        <TransactionReview
          open={review === 'cancel'}
          onClose={() => setReview(null)}
          title={REWARD_DETAIL.manage.cancelTitle}
          consequence={{ tone: 'danger', body: cancelConsequence(left, campaign.creator) }}
          confirmLabel={REWARD_DETAIL.manage.cancel}
          keepLabel={REWARD_DETAIL.manage.keep}
          summary={{ direction: 'returns', comesBack: { amount: leftValue, asset }, network }}
          run={runAction(async () => {
            const result = await cancelRewardOnChain(wallet, campaign.id);
            return { txHash: result.txHash, confirmed: result.confirmation === 'confirmed' };
          })}
          next={<p>{REWARD_DETAIL.manage.cancelled}</p>}
        />
      ) : null}
    </PageContainer>
  );
}
