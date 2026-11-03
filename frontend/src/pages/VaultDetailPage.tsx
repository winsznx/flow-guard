import { useCallback, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Stack } from '../components/layout/Stack';
import { TwoColumn } from '../components/layout/TwoColumn';
import { Address } from '../components/ui/Address';
import { Amount } from '../components/ui/Amount';
import { ApprovalMeter } from '../components/ui/ApprovalMeter';
import { Button } from '../components/ui/Button';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DetailList } from '../components/ui/DetailList';
import { ErrorState } from '../components/ui/ErrorState';
import { Eyebrow } from '../components/ui/Eyebrow';
import { Heading } from '../components/ui/Heading';
import { Plus, Users, Waves } from '../components/ui/Icon';
import { List, type Column, type ListState } from '../components/ui/List';
import { Panel } from '../components/ui/Panel';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { TransactionReview } from '../components/ui/TransactionReview';
import { TxLink } from '../components/ui/TxLink';
import { useToast } from '../components/ui/Toast';
import type { Asset } from '../components/ui/types';
import { AddSignerModal } from '../components/vaults/AddSignerModal';
import { LABELS } from '../copy/common';
import { asFlowError, type FlowError } from '../copy/errors';
import { formatAmount, formatDate, formatRelative } from '../copy/format';
import { spendingRequestStatus } from '../copy/status';
import { VAULT_REQUESTS } from '../copy/requests';
import {
  VAULT_DETAIL,
  everyDays,
  sameAddress,
  signersRequiredLine,
  signersRequiredShort,
  vaultTitle,
} from '../copy/vaults';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import { fetchProposals, fetchVault, throwApiError } from '../utils/api';
import { authFetch } from '../utils/auth';
import { requestAnchor } from '../utils/requestLink';
import { approveProposalOnChain, executePayoutOnChain } from '../utils/blockchain';

const BCH: Asset = { kind: 'bch' };
type Vault = {
  id: string;
  name: string;
  description: string;
  creator: string;
  signers: string[];
  approvalThreshold: number;
  contractAddress: string | null;
  balanceSats: bigint | null;
  releaseAmount: number;
  cycleSeconds: number;
  spendingCap: number;
  isPublic: boolean;
  role: 'creator' | 'signer' | 'viewer';
  startsAt: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type SpendingRequest = {
  id: string;
  amount: number;
  recipient: string;
  reason: string;
  status: string;
  approvals: string[];
};

type HistoryRow = {
  id: string;
  txType: string;
  amount: number | null;
  createdAt: string | null;
  txHash: string;
};

type Load<T> =
  | { state: 'loading' }
  | { state: 'error'; error: FlowError }
  | { state: 'ready'; data: T };

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toVault(raw: Record<string, unknown>): Vault {
  const id = str(raw.id);
  const balance =
    typeof raw.balance === 'number' && Number.isFinite(raw.balance) ? raw.balance : null;
  const role = raw.role === 'creator' || raw.role === 'signer' ? raw.role : 'viewer';
  const start = Date.parse(str(raw.startTime) || str(raw.createdAt));
  return {
    id,
    name: vaultTitle({ id, name: str(raw.name) || null }),
    description: str(raw.description),
    creator: str(raw.creator),
    signers: Array.isArray(raw.signers)
      ? raw.signers.filter((s): s is string => typeof s === 'string')
      : [],
    approvalThreshold: Number(raw.approvalThreshold) || 0,
    contractAddress: str(raw.contractAddress) || null,
    balanceSats: raw.contractAddress && balance !== null ? BigInt(Math.trunc(balance)) : null,
    releaseAmount: Number(raw.unlockAmount) || 0,
    cycleSeconds: Number(raw.cycleDuration) || 0,
    spendingCap: Number(raw.spendingCap) || 0,
    isPublic: raw.isPublic === true,
    role,
    startsAt: Number.isFinite(start) ? start : null,
    createdAt: str(raw.createdAt) || null,
    updatedAt: str(raw.updatedAt) || null,
  };
}

function toRequest(raw: Record<string, unknown>): SpendingRequest {
  return {
    id: str(raw.id),
    amount: Number(raw.amount) || 0,
    recipient: str(raw.recipient),
    reason: str(raw.reason),
    status: str(raw.status).toLowerCase(),
    approvals: Array.isArray(raw.approvals)
      ? raw.approvals.filter((a): a is string => typeof a === 'string')
      : [],
  };
}

function toHistory(raw: Record<string, unknown>): HistoryRow {
  const amount = Number(raw.amount);
  return {
    id: str(raw.id) || str(raw.txHash),
    txType: str(raw.txType),
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    createdAt: str(raw.createdAt) || null,
    txHash: str(raw.txHash),
  };
}

const bch = (value: number) => formatAmount(value, BCH) ?? '';

function historyWord(txType: string): string {
  const events = VAULT_DETAIL.history.events;
  return txType in events ? events[txType as keyof typeof events] : events.other;
}

export default function VaultDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const wallet = useWallet();
  const network = useNetwork();
  const { toast } = useToast();
  const [vault, setVault] = useState<Load<Vault>>({ state: 'loading' });
  const [requests, setRequests] = useState<Load<SpendingRequest[]>>({ state: 'loading' });
  const [history, setHistory] = useState<Load<HistoryRow[]>>({ state: 'loading' });
  const [eligible, setEligible] = useState<number[]>([]);
  const [releasing, setReleasing] = useState<number | null>(null);
  const [approving, setApproving] = useState<SpendingRequest | null>(null);
  const [sending, setSending] = useState<SpendingRequest | null>(null);
  const [sendWaiting, setSendWaiting] = useState<string[] | null>(null);
  const [signersOpen, setSignersOpen] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);

  const loadVault = useCallback(async () => {
    try {
      const raw = await fetchVault(id, wallet.address || undefined);
      setVault({ state: 'ready', data: toVault(raw) });
    } catch (error) {
      setVault({ state: 'error', error: asFlowError(error) });
    }
  }, [id, wallet.address]);

  const loadRequests = useCallback(async () => {
    try {
      const rows = await fetchProposals(id, wallet.address);
      setRequests({ state: 'ready', data: rows.map(toRequest) });
    } catch (error) {
      setRequests({ state: 'error', error: asFlowError(error) });
    }
  }, [id, wallet.address]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/vaults/${id}/transactions`);
      if (!response.ok) await throwApiError(response, 'LOAD_FAILED');
      const body: { transactions?: Record<string, unknown>[] } = await response.json();
      setHistory({ state: 'ready', data: (body.transactions ?? []).map(toHistory) });
    } catch (error) {
      setHistory({ state: 'error', error: asFlowError(error) });
    }
  }, [id]);

  const loadEligible = useCallback(async () => {
    try {
      const response = await fetch(`/api/vaults/${id}/cycles/eligible`);
      if (!response.ok) return;
      const body: { eligibleCycles?: unknown } = await response.json();
      setEligible(
        Array.isArray(body.eligibleCycles)
          ? body.eligibleCycles.filter((n): n is number => typeof n === 'number')
          : []
      );
    } catch (error) {
      console.warn('Spending budget periods did not load', error);
    }
  }, [id]);

  useEffect(() => {
    void loadVault();
    void loadRequests();
    void loadHistory();
    void loadEligible();
  }, [loadVault, loadRequests, loadHistory, loadEligible]);

  const checkBalance = async () => {
    setCheckingBalance(true);
    await loadVault();
    setCheckingBalance(false);
  };

  if (vault.state === 'loading') {
    return (
      <PageContainer>
        <Stack>
          <Skeleton kind="text" lines={2} />
          <Skeleton kind="tile" />
          <Skeleton kind="row" lines={4} />
        </Stack>
      </PageContainer>
    );
  }

  if (vault.state === 'error') {
    const { code, message } = vault.error;
    const title =
      code === 'NOT_FOUND'
        ? VAULT_DETAIL.notFoundTitle
        : code === 'NO_ACCESS'
          ? VAULT_DETAIL.noAccessTitle
          : VAULT_DETAIL.loadFailedTitle;
    const retryable = code !== 'NOT_FOUND' && code !== 'NO_ACCESS';
    return (
      <PageContainer>
        <ErrorState
          title={title}
          reason={message}
          onRetry={retryable ? loadVault : undefined}
          action={
            retryable ? undefined : (
              <ButtonLink to="/vaults" variant="secondary">
                {VAULT_DETAIL.backToVaults}
              </ButtonLink>
            )
          }
        />
      </PageContainer>
    );
  }

  const v = vault.data;
  const isSigner = v.role !== 'viewer';
  const isCreator = v.role === 'creator';
  const interval = everyDays(v.cycleSeconds);
  const periodStart = (n: number) =>
    v.startsAt ? formatDate(v.startsAt + n * v.cycleSeconds * 1000) : null;
  const updated = v.updatedAt ? formatRelative(v.updatedAt) : null;
  const releasingDate = releasing !== null ? periodStart(releasing) : null;

  const releaseBudget = async () => {
    if (releasing === null) return;
    const response = await authFetch(`/api/vaults/${id}/unlock`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleNumber: releasing }),
    });
    if (!response.ok) await throwApiError(response, 'UNKNOWN');
    setReleasing(null);
    toast({ tone: 'success', title: VAULT_DETAIL.budget.done });
    void loadVault();
    void loadEligible();
    void loadHistory();
  };

  const nextReleaseDate = (() => {
    if (!v.startsAt || v.cycleSeconds <= 0) return null;
    const elapsed = Math.floor((Date.now() - v.startsAt) / (v.cycleSeconds * 1000));
    return formatDate(v.startsAt + (elapsed + 1) * v.cycleSeconds * 1000);
  })();

  const actionCard = (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-label text-ink-secondary">{VAULT_DETAIL.held}</p>
          {v.contractAddress ? (
            v.balanceSats === null ? (
              <p className="text-body text-ink-secondary">{VAULT_DETAIL.heldUnknown}</p>
            ) : (
              <Amount value={v.balanceSats} asset={BCH} size="xl" />
            )
          ) : (
            <p className="text-body text-ink-secondary">{VAULT_DETAIL.notSetUp}</p>
          )}
        </div>
        {v.contractAddress ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-muted">
            {updated ? <span>{VAULT_DETAIL.updated(updated)}</span> : null}
            <Button
              variant="link"
              standalone
              onClick={() => void checkBalance()}
              busy={checkingBalance}
              busyLabel={VAULT_DETAIL.refreshing}
            >
              {VAULT_DETAIL.refresh}
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );

  const budgetPanel =
    v.contractAddress && v.releaseAmount > 0 && interval ? (
      <Panel
        title={VAULT_DETAIL.budget.title}
        description={VAULT_DETAIL.budget.line(bch(v.releaseAmount), interval)}
      >
        <p className="text-small text-ink-secondary">{VAULT_DETAIL.budget.explainer}</p>
        {!isSigner ? (
          <p className="text-small text-ink-muted">{VAULT_DETAIL.budget.signersOnly}</p>
        ) : eligible.length === 0 ? (
          <p className="text-small text-ink-secondary">
            {VAULT_DETAIL.budget.nothingReady(nextReleaseDate)}
          </p>
        ) : (
          <ul className="flex flex-col">
            {eligible.map((n) => {
              const from = periodStart(n);
              return (
                <li
                  key={n}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0"
                >
                  <span className="flex flex-col gap-0.5">
                    <Amount value={v.releaseAmount} asset={BCH} />
                    {from ? (
                      <span className="text-small text-ink-muted">
                        {VAULT_DETAIL.budget.readyFrom(from)}
                      </span>
                    ) : null}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => setReleasing(n)}>
                    {VAULT_DETAIL.budget.release}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    ) : null;

  const requestsPanel = (
    <Panel title={VAULT_REQUESTS.title} description={VAULT_REQUESTS.description}>
      <Stack gap={4}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1 text-small text-ink-secondary">
            {v.balanceSats !== null ? (
              <p>{VAULT_REQUESTS.balanceLine(formatAmount(v.balanceSats, BCH) ?? '')}</p>
            ) : null}
            {v.spendingCap > 0 ? <p>{VAULT_REQUESTS.limitLine(bch(v.spendingCap))}</p> : null}
          </div>
          {isSigner ? (
            <ButtonLink
              to={`/vaults/${id}/proposals/create`}
              variant="primary"
              size="sm"
              leadingIcon={Plus}
            >
              {VAULT_REQUESTS.newRequest}
            </ButtonLink>
          ) : null}
        </div>
        {!isSigner ? (
          <p className="text-small text-ink-muted">{VAULT_REQUESTS.signersOnly}</p>
        ) : requests.state === 'loading' ? (
          <Skeleton kind="row" lines={2} />
        ) : requests.state === 'error' ? (
          <ErrorState
            title={VAULT_REQUESTS.title}
            reason={VAULT_REQUESTS.loadFailed}
            onRetry={loadRequests}
          />
        ) : requests.data.length === 0 ? (
          <p className="text-small text-ink-secondary">{VAULT_REQUESTS.empty}</p>
        ) : (
          <RequestGroups
            requests={requests.data}
            vault={v}
            viewer={wallet.address}
            onApprove={(request) => setApproving(request)}
            onSend={(request) => setSending(request)}
          />
        )}
      </Stack>
    </Panel>
  );

  const historyColumns: Column<HistoryRow>[] = [
    {
      key: 'what',
      header: VAULT_DETAIL.history.what,
      primary: true,
      cell: (row) => historyWord(row.txType),
    },
    {
      key: 'amount',
      header: VAULT_DETAIL.history.amount,
      align: 'end',
      mobile: 'bottom-end',
      cell: (row) =>
        row.amount === null ? (
          <span className="text-ink-muted">{LABELS.notSet}</span>
        ) : (
          <Amount value={row.amount} asset={BCH} precision="list" />
        ),
    },
    {
      key: 'when',
      header: VAULT_DETAIL.history.when,
      mobile: 'bottom-start',
      cell: (row) => (row.createdAt ? formatRelative(row.createdAt) : LABELS.notSet),
    },
    {
      key: 'link',
      header: VAULT_DETAIL.history.link,
      mobile: 'top',
      cell: (row) =>
        row.txHash ? (
          <TxLink
            txid={row.txHash}
            network={network}
            context={[historyWord(row.txType), row.createdAt ? formatRelative(row.createdAt) : null]
              .filter(Boolean)
              .join(', ')}
          />
        ) : null,
    },
  ];

  const historyState: ListState =
    history.state === 'loading'
      ? 'loading'
      : history.state === 'error'
        ? 'error'
        : history.data.length === 0
          ? 'empty'
          : 'ready';

  const historyPanel = v.contractAddress ? (
    <section className="flex flex-col gap-4">
      <Heading level="section" as="h2">
        {VAULT_DETAIL.history.title}
      </Heading>
      <List
        label={VAULT_DETAIL.history.listLabel}
        columns={historyColumns}
        rows={history.state === 'ready' ? history.data : []}
        rowKey={(row) => row.id}
        state={historyState}
        empty={
          <p className="px-4 py-6 text-small text-ink-secondary">{VAULT_DETAIL.history.empty}</p>
        }
        noResults={null}
        error={
          <ErrorState
            title={VAULT_DETAIL.history.title}
            reason={VAULT_DETAIL.history.failed}
            onRetry={loadHistory}
          />
        }
      />
    </section>
  ) : null;

  const side = (
    <>
      <Panel title={VAULT_DETAIL.details.title}>
        <DetailList
          items={[
            {
              label: VAULT_DETAIL.details.address,
              value: v.contractAddress ? <Address value={v.contractAddress} /> : null,
            },
            {
              label: VAULT_DETAIL.details.approvals,
              value: signersRequiredShort(v.approvalThreshold, v.signers.length),
            },
            {
              label: VAULT_DETAIL.details.budget,
              value:
                v.releaseAmount > 0 && interval
                  ? VAULT_DETAIL.details.budgetValue(bch(v.releaseAmount), interval)
                  : null,
            },
            {
              label: VAULT_DETAIL.details.limit,
              value:
                v.spendingCap > 0
                  ? VAULT_DETAIL.details.limitValue(bch(v.spendingCap))
                  : VAULT_DETAIL.details.noLimit,
            },
            {
              label: VAULT_DETAIL.details.visibility,
              value: v.isPublic
                ? VAULT_DETAIL.details.publicValue
                : VAULT_DETAIL.details.privateValue,
            },
            {
              label: VAULT_DETAIL.details.created,
              value: v.createdAt ? formatDate(v.createdAt) : null,
            },
          ]}
        />
      </Panel>
      <Panel title={VAULT_DETAIL.signers.title} description={VAULT_DETAIL.signers.fixed}>
        <Stack gap={4}>
          <ul className="flex flex-col">
            {v.signers.map((signer) => (
              <li
                key={signer}
                className="flex flex-col gap-0.5 border-t border-line py-3 first:border-t-0"
              >
                <Address value={signer} isYou={sameAddress(signer, wallet.address)} />
                {sameAddress(signer, v.creator) ? (
                  <span className="text-small text-ink-muted">{VAULT_DETAIL.signers.setUpBy}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {isCreator ? (
            <div>
              <Button variant="link" standalone onClick={() => setSignersOpen(true)}>
                {VAULT_DETAIL.signers.howToChange}
              </Button>
            </div>
          ) : null}
        </Stack>
      </Panel>
      <Card>
        <div className="flex flex-col gap-2">
          <Heading level="item" as="h2">
            {VAULT_DETAIL.whoCanMove.title}
          </Heading>
          <p className="text-body text-ink-secondary">
            {VAULT_DETAIL.whoCanMove.line(v.approvalThreshold, v.signers.length)}
          </p>
        </div>
      </Card>
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        title={v.name}
        description={
          isSigner
            ? `${signersRequiredLine(v.approvalThreshold, v.signers.length)} ${VAULT_DETAIL.listedHereLine}`
            : signersRequiredLine(v.approvalThreshold, v.signers.length)
        }
        breadcrumbs={[{ label: VAULT_DETAIL.breadcrumb, to: '/vaults' }, { label: v.name }]}
        role={isSigner ? 'signer' : 'viewer'}
        stateLine={v.isPublic ? VAULT_DETAIL.publicVault : VAULT_DETAIL.privateVault}
        secondaryActions={
          isSigner
            ? [
                <ButtonLink
                  key="stream"
                  to={`/vaults/${id}/create-stream`}
                  variant="secondary"
                  leadingIcon={Waves}
                >
                  {VAULT_DETAIL.createStream}
                </ButtonLink>,
                <ButtonLink
                  key="batch"
                  to={`/vaults/${id}/batch-create`}
                  variant="secondary"
                  leadingIcon={Users}
                >
                  {VAULT_DETAIL.payManyPeople}
                </ButtonLink>,
              ]
            : []
        }
      />
      <TwoColumn
        main={
          <>
            {actionCard}
            {requestsPanel}
            {budgetPanel}
            {historyPanel}
          </>
        }
        side={side}
      />

      <ConfirmDialog
        open={releasing !== null}
        title={VAULT_DETAIL.budget.confirmTitle(bch(v.releaseAmount))}
        body={
          releasingDate
            ? VAULT_DETAIL.budget.confirmBody(bch(v.releaseAmount), releasingDate)
            : VAULT_DETAIL.budget.line(bch(v.releaseAmount), interval ?? '')
        }
        confirmLabel={VAULT_DETAIL.budget.release}
        keepLabel={VAULT_DETAIL.budget.keep}
        tone="primary"
        busyLabel={VAULT_DETAIL.budget.busy}
        onConfirm={releaseBudget}
        onClose={() => setReleasing(null)}
      />

      {approving ? (
        <TransactionReview
          open
          onClose={() => setApproving(null)}
          title={VAULT_REQUESTS.approveReview.title}
          consequence={{ tone: 'info', body: VAULT_REQUESTS.approveReview.consequence }}
          summary={{ direction: 'fee-only', network }}
          plan={
            <div className="flex flex-col gap-1">
              <Amount value={approving.amount} asset={BCH} size="lg" />
              <Address value={approving.recipient} variant="full" />
              {approving.reason ? (
                <p className="text-body text-ink-secondary">{approving.reason}</p>
              ) : null}
            </div>
          }
          run={async () => {
            const txid = await approveProposalOnChain(
              wallet,
              approving.id,
              wallet.publicKey || '',
              {
                vaultId: id,
                proposalId: approving.id,
              }
            );
            void loadRequests();
            void loadHistory();
            return { txid };
          }}
          next={<p>{VAULT_REQUESTS.approveReview.done}</p>}
        />
      ) : null}

      {sending ? (
        <TransactionReview
          open
          onClose={() => {
            setSending(null);
            setSendWaiting(null);
          }}
          title={VAULT_REQUESTS.sendReview.title}
          consequence={{ tone: 'info', body: VAULT_REQUESTS.sendReview.consequence }}
          summary={{
            direction: 'out',
            source: 'contract',
            leavesLabel: VAULT_REQUESTS.sendReview.leaves,
            leavesWallet: { amount: String(sending.amount), asset: BCH },
            goesTo: { address: sending.recipient },
            network,
          }}
          plan={sending.reason ? <p className="text-body text-ink-secondary">{sending.reason}</p> : undefined}
          run={async () => {
            const result = await executePayoutOnChain(wallet, sending.id, {
              vaultId: id,
              proposalId: sending.id,
              amount: sending.amount,
              toAddress: sending.recipient,
            });
            setSendWaiting(result.status === 'pending' ? result.remainingSigners ?? [] : null);
            void loadRequests();
            void loadHistory();
            return { txid: result.txid };
          }}
          next={
            sendWaiting ? (
              <p>{VAULT_REQUESTS.sendReview.waiting}</p>
            ) : (
              <p>{VAULT_REQUESTS.sendReview.done}</p>
            )
          }
        />
      ) : null}

      <AddSignerModal open={signersOpen} onClose={() => setSignersOpen(false)} />
    </PageContainer>
  );
}

type RequestGroupsProps = {
  requests: SpendingRequest[];
  vault: Vault;
  viewer: string | null;
  onApprove: (request: SpendingRequest) => void;
  onSend: (request: SpendingRequest) => void;
};

function RequestGroups({ requests, vault, viewer, onApprove, onSend }: RequestGroupsProps) {
  const groups: { key: string; label: string; rows: SpendingRequest[] }[] = [
    {
      key: 'pending',
      label: VAULT_REQUESTS.groups.needsApproval,
      rows: requests.filter((r) => r.status === 'pending'),
    },
    {
      key: 'approved',
      label: VAULT_REQUESTS.groups.readyToSend,
      rows: requests.filter((r) => r.status === 'approved'),
    },
    {
      key: 'executed',
      label: VAULT_REQUESTS.groups.sent,
      rows: requests.filter((r) => r.status === 'executed'),
    },
    {
      key: 'rejected',
      label: VAULT_REQUESTS.groups.rejected,
      rows: requests.filter((r) => r.status === 'rejected'),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <section key={group.key} className="flex flex-col gap-3">
            <Eyebrow>{group.label}</Eyebrow>
            <ul className="flex flex-col gap-3">
              {group.rows.map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  vault={vault}
                  viewer={viewer}
                  onApprove={onApprove}
                  onSend={onSend}
                />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

type RequestCardProps = {
  request: SpendingRequest;
  vault: Vault;
  viewer: string | null;
  onApprove: (request: SpendingRequest) => void;
  onSend: (request: SpendingRequest) => void;
};

function RequestCard({ request, vault, viewer, onApprove, onSend }: RequestCardProps) {
  const { hash } = useLocation();
  const anchor = requestAnchor(request.id);
  const linkedTo = hash === `#${anchor}`;
  const status = spendingRequestStatus(request.status);
  const youApproved = request.approvals.some((a) => sameAddress(a, viewer));
  const isSigner = vault.signers.some((s) => sameAddress(s, viewer));
  const canApprove = request.status === 'pending' && !youApproved && isSigner;
  const canSend = request.status === 'approved' && isSigner;
  const signers = vault.signers.map((address) => ({
    address,
    approved: request.approvals.some((a) => sameAddress(a, address)),
  }));

  return (
    <Card
      as="li"
      id={anchor}
      highlighted={linkedTo}
      className="scroll-mt-24"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Amount value={request.amount} asset={BCH} size="lg" />
            <Address value={request.recipient} />
          </div>
          {status ? <StatusPill status={status} size="sm" /> : null}
        </div>
        <p className="text-body text-ink-secondary">{request.reason || VAULT_REQUESTS.noReason}</p>
        {request.status === 'pending' ? (
          <ApprovalMeter required={vault.approvalThreshold} signers={signers} />
        ) : null}
        {canApprove ? (
          <div>
            <Button variant="secondary" size="sm" onClick={() => onApprove(request)}>
              {VAULT_REQUESTS.approve}
            </Button>
          </div>
        ) : youApproved && request.status === 'pending' ? (
          <p className="text-small text-ink-muted">{VAULT_REQUESTS.youApproved}</p>
        ) : canSend ? (
          <div className="flex flex-col gap-2">
            <p className="text-small text-ink-secondary">{VAULT_REQUESTS.sendLine}</p>
            <div>
              <Button variant="primary" size="sm" onClick={() => onSend(request)}>
                {VAULT_REQUESTS.send}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
