/**
 * BountyDetailPage
 *
 * Detail + lifecycle controller for a single bounty. Mirrors the canonical
 * AirdropDetailPage / StreamDetailPage shape:
 *   - Header with status badge + back link
 *   - Inline FeedbackState banner (success / warning / error / info)
 *   - Hero metrics + progress + entity details cards
 *   - Role-gated action cluster: Fund (PENDING -> ACTIVE), Pay Winner
 *     (creator-only claim), Pause (ACTIVE -> PAUSED), Cancel (ACTIVE/PAUSED ->
 *     CANCELLED). Resume is NOT exposed because the backend has not shipped
 *     /api/bounties/:id/resume yet - the API extract calls this out explicitly.
 *   - Activity timeline + claim history table + receipt-NFT placeholder card
 *
 * Lifecycle calls are routed through `runLifecycleAction` from
 * `utils/blockchain.ts`, the same helper used by every other product family.
 * Once the formal `fundBountyContract`, `payBountyWinner`, `pauseBountyOnChain`,
 * and `cancelBountyOnChain` wrappers are added to `utils/blockchain.ts`, the
 * inline `bountyAction*` helpers here become a one-line import swap.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  ExternalLink,
  History,
  Pause,
  Send,
  Sparkles,
  Target,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { SkeletonCard, SkeletonStats } from '../components/ui/Skeleton';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import { authFetch } from '../utils/auth';
import {
  deserializeWcSignOptions,
  getExplorerTxUrl,
  runLifecycleAction,
  type SerializedWcTransaction,
  type WalletInterface,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { formatTokenAmount } from '../utils/tokenFormat';
import { toUserFacingError } from '../utils/userError';
import {
  fetchBounty,
  submitBountyClaim,
  type BountyActivityEvent,
  type BountyClaim,
  type BountyRow,
  type BountyStatus,
} from '../services/bountyApi';

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  details?: string;
  txHash?: string;
}

type ActionKey = 'fund' | 'claim' | 'pause' | 'cancel';

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

const TX_HASH_REGEX = /^[0-9a-fA-F]{64}$/;
const PROOF_HASH_REGEX = /^[0-9a-fA-F]{64}$/;
const NON_ZERO_PROOF_REGEX = /[1-9a-fA-F]/;

function formatBountyEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Bounty Created';
    case 'funded':
      return 'Bounty Funded';
    case 'claim':
      return 'Winner Paid';
    case 'paused':
      return 'Bounty Paused';
    case 'resumed':
      return 'Bounty Resumed';
    case 'cancelled':
      return 'Bounty Cancelled';
    case 'completed':
      return 'Bounty Completed';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function getStatusBadgeClasses(status: BountyStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-accent/20 text-accent';
    case 'PENDING':
      return 'bg-secondary/20 text-textPrimary border border-secondary/40';
    case 'PAUSED':
      return 'bg-secondary/20 text-textPrimary border border-secondary/40';
    case 'COMPLETED':
      return 'bg-primary/20 text-primary';
    case 'CANCELLED':
    default:
      return 'bg-surfaceAlt text-textMuted border border-border';
  }
}

/**
 * Fund a bounty contract. Mirrors `fundAirdropContract` - runs the optional
 * preparation tx, then the funding round-trip via `runLifecycleAction`.
 */
async function bountyActionFund(
  wallet: WalletInterface,
  bountyId: string,
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending'; detail?: string | null }> {
  if (!wallet.address) throw new Error('Wallet not connected');
  if (!wallet.signCashScriptTransaction) {
    throw new Error('Connected wallet does not support CashScript transactions');
  }

  const fetchFundingInfo = async (): Promise<FundingInfoResponse> => {
    const response = await authFetch(`/api/bounties/${bountyId}/funding-info`, {
      wallet,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = (await response.json().catch(() => ({}))) as FundingInfoResponse;
    if (!response.ok) {
      throw new Error(payload?.message || payload?.error || 'Failed to get funding info');
    }
    return payload;
  };

  let data = await fetchFundingInfo();

  if (data.requiresPreparation && data.preparationTransaction) {
    const prepOptions = {
      ...deserializeWcSignOptions(data.preparationTransaction),
      broadcast: false,
    };
    await wallet.signCashScriptTransaction(prepOptions);
    await new Promise((resolve) => setTimeout(resolve, 8000));
    data = await fetchFundingInfo();
  }

  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: 'Bounty funded',
    signContext: 'Bounty funding signing failed',
    metadata: { txType: 'create', fromAddress: wallet.address || undefined },
    build: async () => {
      const wcTransaction = data.wcTransaction;
      if (!wcTransaction) {
        throw new Error('Bounty funding requires a CashScript-compatible wallet transaction object from backend.');
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

  return {
    txHash: confirm.txHash,
    confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
    detail: confirm.message || null,
  };
}

/**
 * Build + sign + confirm a bounty claim (pay-winner). Only the creator wallet
 * can authorize this; the backend co-signs the contract input with the stored
 * claim-authority key.
 */
async function bountyActionPayWinner(
  wallet: WalletInterface,
  input: ClaimWinnerInput,
): Promise<string> {
  if (!wallet.address) throw new Error('Wallet not connected');

  const { confirm } = await runLifecycleAction<{ claimAmount: number; wcTransaction: SerializedWcTransaction }>({
    wallet,
    actionLabel: 'Bounty winner paid',
    signContext: 'Bounty claim signing failed',
    build: async (signerAddress) => {
      const payload = await submitBountyClaim(input.bountyId, {
        winnerAddress: input.winnerAddress,
        proofHash: input.proofHash,
        signerAddress,
      });
      if (!payload?.wcTransaction) {
        throw new Error('Backend did not return claim transaction');
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

  return confirm.txHash;
}

async function bountyActionPause(wallet: WalletInterface, bountyId: string): Promise<string> {
  if (!wallet.address) throw new Error('Wallet not connected');
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: 'Bounty paused',
    signContext: 'Bounty pause signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`/api/bounties/${bountyId}/pause`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-address': signerAddress },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        wcTransaction?: SerializedWcTransaction;
        error?: string;
        message?: string;
      };
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Failed to build pause transaction');
      if (!payload.wcTransaction) throw new Error('Backend did not return pause transaction');
      return { wcTransaction: payload.wcTransaction, payload };
    },
    confirm: ({ txHash, signerAddress }) =>
      authFetch(`/api/bounties/${bountyId}/confirm-pause`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-address': signerAddress },
        body: JSON.stringify({ txHash }),
      }),
  });
  return confirm.txHash;
}

async function bountyActionCancel(wallet: WalletInterface, bountyId: string): Promise<string> {
  if (!wallet.address) throw new Error('Wallet not connected');
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: 'Bounty cancelled',
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
      if (!response.ok) throw new Error(payload?.message || payload?.error || 'Failed to build cancel transaction');
      if (!payload.wcTransaction) throw new Error('Backend did not return cancel transaction');
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
  return confirm.txHash;
}

const TONE_CLASSES: Record<FeedbackTone, string> = {
  success: 'border-primary/30 bg-primary/5 text-primary',
  warning: 'border-secondary/30 bg-secondary/5 text-secondary',
  error: 'border-error/30 bg-error/5 text-error',
  info: 'border-border bg-surfaceAlt text-textPrimary',
};

/**
 * Detail page for a single bounty. Drives the full lifecycle state machine
 * with role-gated actions and inline feedback.
 */
export default function BountyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetwork();
  const routeState = location.state as { freshCreate?: boolean } | null;

  const [bounty, setBounty] = useState<BountyRow | null>(null);
  const [claims, setClaims] = useState<BountyClaim[]>([]);
  const [events, setEvents] = useState<BountyActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [isFundingSyncing, setIsFundingSyncing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(
    routeState?.freshCreate
      ? {
          tone: 'info',
          title: 'Bounty created. Funding is the next step.',
          description: 'The bounty record is live. Fund the contract from this page to activate winner payouts.',
        }
      : null,
  );

  const [winnerAddress, setWinnerAddress] = useState('');
  const [proofHash, setProofHash] = useState('');

  const buildErrorFeedback = useCallback(
    (title: string, error: unknown, fallback: string): FeedbackState => {
      const parsed = toUserFacingError(error, fallback);
      return { tone: 'error', title, description: parsed.message, details: parsed.details };
    },
    [],
  );

  const refreshBounty = useCallback(async (): Promise<BountyRow | null> => {
    if (!id) return null;
    const data = await fetchBounty(id);
    setBounty(data.campaign);
    setClaims(data.claims);
    setEvents(data.events);
    return data.campaign;
  }, [id]);

  const pollForStatus = useCallback(
    async (targetStatuses: BountyStatus[], attempts = 8, delayMs = 1500): Promise<BountyRow | null> => {
      setIsFundingSyncing(true);
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const latest = await refreshBounty();
          if (latest && targetStatuses.includes(latest.status)) {
            return latest;
          }
          if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        return null;
      } finally {
        setIsFundingSyncing(false);
      }
    },
    [refreshBounty],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        await refreshBounty();
      } catch (error) {
        if (!cancelled) {
          setFeedback(buildErrorFeedback('Failed to load bounty.', error, 'Try refreshing the page.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (id) load();
    return () => {
      cancelled = true;
    };
  }, [id, refreshBounty, buildErrorFeedback]);

  const isCreator = useMemo(() => {
    if (!wallet.address || !bounty) return false;
    return wallet.address.toLowerCase() === bounty.creator.toLowerCase();
  }, [wallet.address, bounty]);

  const winnerProgress = useMemo(() => {
    if (!bounty || bounty.max_winners <= 0) return 0;
    return Math.min(100, (bounty.winners_count / bounty.max_winners) * 100);
  }, [bounty]);

  const remainingPrizes = useMemo(() => {
    if (!bounty) return 0;
    return Math.max(0, bounty.max_winners - bounty.winners_count);
  }, [bounty]);

  const submissionWindow = useMemo(() => {
    if (!bounty) return { open: false, reason: 'Loading' };
    const now = Math.floor(Date.now() / 1000);
    if (bounty.start_date && now < bounty.start_date) {
      return { open: false, reason: 'Submission window has not started yet' };
    }
    if (bounty.end_date && bounty.end_date > 0 && now > bounty.end_date) {
      return { open: false, reason: 'Submission window has ended' };
    }
    return { open: true, reason: '' };
  }, [bounty]);

  const canPayWinner = useMemo(() => {
    if (!bounty || !isCreator) return false;
    return bounty.status === 'ACTIVE' && remainingPrizes > 0 && submissionWindow.open;
  }, [bounty, isCreator, remainingPrizes, submissionWindow]);

  const handleFund = async (): Promise<void> => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required to fund this bounty.',
      });
      return;
    }
    if (!id) return;
    setActionLoading('fund');
    try {
      const result = await bountyActionFund(wallet, id);
      await refreshBounty();
      if (result.confirmation === 'confirmed') {
        setFeedback({
          tone: 'success',
          title: 'Bounty funded successfully.',
          description: 'The contract output is confirmed and winner payouts can begin.',
          txHash: result.txHash,
        });
      } else {
        setFeedback({
          tone: 'warning',
          title: 'Funding transaction broadcast. Waiting for backend confirmation.',
          description:
            result.detail || 'The funding tx is on-chain but the backend has not marked the bounty active yet.',
          txHash: result.txHash,
        });
      }
      const next =
        result.confirmation === 'confirmed'
          ? await refreshBounty()
          : await pollForStatus(['ACTIVE', 'PAUSED', 'CANCELLED']);
      if (next?.status === 'ACTIVE') {
        setFeedback({
          tone: 'success',
          title: 'Bounty is now active.',
          description: 'The funding output has been indexed. You can now pay winners.',
          txHash: result.txHash,
        });
      }
    } catch (error) {
      setFeedback(buildErrorFeedback('Failed to fund bounty.', error, 'Unable to fund bounty'));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePayWinner = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required to pay a winner.',
      });
      return;
    }
    if (!bounty || !id || !canPayWinner) return;

    const trimmedAddress = winnerAddress.trim();
    if (!trimmedAddress.startsWith('bitcoincash:') && !trimmedAddress.startsWith('bchtest:')) {
      setFeedback({
        tone: 'error',
        title: 'Invalid winner address.',
        description: 'Provide a cashaddr (bitcoincash:... or bchtest:...).',
      });
      return;
    }
    const trimmedProof = proofHash.trim().toLowerCase();
    if (!PROOF_HASH_REGEX.test(trimmedProof) || !NON_ZERO_PROOF_REGEX.test(trimmedProof)) {
      setFeedback({
        tone: 'error',
        title: 'Invalid proof hash.',
        description: 'Proof hash must be a non-zero 64-character hex string (32 bytes).',
      });
      return;
    }

    setActionLoading('claim');
    try {
      const txHash = await bountyActionPayWinner(wallet, {
        bountyId: id,
        winnerAddress: trimmedAddress,
        proofHash: trimmedProof,
        rewardAmount: bounty.reward_per_winner,
      });
      await refreshBounty();
      setWinnerAddress('');
      setProofHash('');
      setFeedback({
        tone: 'success',
        title: `Paid winner ${formatTokenAmount(bounty.reward_per_winner, bounty.token_type, bounty.token_category)}.`,
        description: 'The claim transaction was submitted and the bounty history is refreshed.',
        txHash,
      });
    } catch (error) {
      setFeedback(buildErrorFeedback('Failed to pay winner.', error, 'Unable to pay winner'));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async (): Promise<void> => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required to pause this bounty.',
      });
      return;
    }
    if (!id) return;
    setActionLoading('pause');
    try {
      const txHash = await bountyActionPause(wallet, id);
      await refreshBounty();
      setFeedback({
        tone: 'success',
        title: 'Bounty paused on-chain.',
        description: 'Winner payouts are paused until the bounty is resumed.',
        txHash,
      });
    } catch (error) {
      setFeedback(buildErrorFeedback('Failed to pause bounty.', error, 'Unable to pause bounty'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (): Promise<void> => {
    if (!bounty) return;
    const remainingPool = bounty.reward_per_winner * remainingPrizes;
    const confirmation = window.confirm(
      `Cancel this bounty?\n\nRemaining pool: ${formatTokenAmount(remainingPool, bounty.token_type, bounty.token_category)}\nThis amount will be refunded to your wallet.\n\nThis action cannot be undone.`,
    );
    if (!confirmation) return;
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required to cancel this bounty.',
      });
      return;
    }
    if (!id) return;
    setActionLoading('cancel');
    try {
      const txHash = await bountyActionCancel(wallet, id);
      setFeedback({
        tone: 'success',
        title: 'Bounty cancelled on-chain.',
        description: 'Remaining funds were returned to your wallet.',
        txHash,
      });
      navigate('/bounties');
    } catch (error) {
      setFeedback(buildErrorFeedback('Failed to cancel bounty.', error, 'Unable to cancel bounty'));
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
          <SkeletonCard lines={2} />
          <SkeletonStats count={4} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2 space-y-4">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={3} />
            </div>
            <SkeletonCard lines={5} />
          </div>
        </div>
      </div>
    );
  }

  if (!bounty) {
    return (
      <div className="p-8">
        <Card padding="xl" className="text-center">
          <Trophy className="w-12 h-12 text-textMuted mx-auto mb-4" />
          <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary mb-2">
            Bounty not found
          </h2>
          <p className="text-textMuted font-mono mb-6">This bounty does not exist or you do not have access.</p>
          <Button onClick={() => navigate('/bounties')}>Back to Bounties</Button>
        </Card>
      </div>
    );
  }

  const totalPool = bounty.reward_per_winner * bounty.max_winners;
  const isFundDisabled = actionLoading !== null;
  const isClaimDisabled = actionLoading !== null;
  const isPauseDisabled = actionLoading !== null;
  const isCancelDisabled = actionLoading !== null;

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            type="button"
            onClick={() => navigate('/bounties')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Bounties
          </button>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary">
                  {bounty.title}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${getStatusBadgeClasses(
                    bounty.status,
                  )}`}
                >
                  {bounty.status}
                </span>
              </div>
              {bounty.description && <p className="text-textMuted font-mono mb-2">{bounty.description}</p>}
              <p className="text-sm text-textMuted font-mono">{formatLogicalId(bounty.campaign_id)}</p>
            </div>

            <div className="flex flex-wrap items-start gap-3">
              {isCreator && bounty.status === 'PENDING' && (
                <Button
                  variant="primary"
                  onClick={handleFund}
                  disabled={isFundDisabled}
                  className="flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  {actionLoading === 'fund' ? 'Funding...' : 'Fund Bounty'}
                </Button>
              )}

              {isCreator && bounty.status === 'ACTIVE' && bounty.cancelable && (
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={isPauseDisabled}
                  className="flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
                </Button>
              )}

              {isCreator &&
                bounty.cancelable &&
                bounty.status !== 'CANCELLED' &&
                bounty.status !== 'COMPLETED' &&
                bounty.status !== 'PENDING' && (
                  <Button
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isCancelDisabled}
                    className="flex items-center gap-2 text-error border-error hover:bg-error/5"
                  >
                    <X className="w-4 h-4" />
                    {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel'}
                  </Button>
                )}
            </div>
          </div>
        </div>

        {feedback && (
          <Card padding="lg" className={`mb-6 border ${TONE_CLASSES[feedback.tone]}`}>
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{feedback.title}</p>
                {feedback.description && (
                  <p className="mt-1 text-sm leading-6 text-textSecondary whitespace-pre-wrap break-words">
                    {feedback.description}
                  </p>
                )}
                {feedback.details && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-mono uppercase tracking-[0.14em] text-textMuted">
                      Show technical details
                    </summary>
                    <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surfaceAlt p-3 text-xs text-textSecondary">
                      {feedback.details}
                    </pre>
                  </details>
                )}
                {feedback.txHash && TX_HASH_REGEX.test(feedback.txHash) && (
                  <a
                    href={getExplorerTxUrl(feedback.txHash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primaryHover"
                  >
                    View transaction
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                {(actionLoading === 'fund' || isFundingSyncing) && (
                  <p className="mt-3 text-xs font-mono uppercase tracking-[0.18em] text-textMuted">
                    Syncing bounty status…
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Pay Winner inline form (creator-only, ACTIVE bounties with remaining prizes) */}
        {isCreator && canPayWinner && (
          <Card padding="lg" className="mb-6 border border-accent/30 bg-accent/5">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Send className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Pay a Winner</h3>
                <p className="text-sm text-textMuted font-mono">
                  Each winner receives {formatTokenAmount(bounty.reward_per_winner, bounty.token_type, bounty.token_category)}. Backend
                  co-signs the claim path.
                </p>
              </div>
            </div>
            <form onSubmit={handlePayWinner} className="space-y-4">
              <Input
                label="Winner Address (cashaddr)"
                placeholder="bitcoincash:q... or bchtest:q..."
                value={winnerAddress}
                onChange={(event) => setWinnerAddress(event.target.value)}
                helpText="Where the prize is paid. Must be a P2PKH cashaddr."
                required
              />
              <Input
                label="Proof Hash (32-byte hex)"
                placeholder="64-character hex digest of the accepted submission"
                value={proofHash}
                onChange={(event) => setProofHash(event.target.value.trim())}
                helpText="Hash the winning submission off-chain (sha256). The covenant requires a non-zero 32-byte proof."
                required
              />
              <Button type="submit" disabled={isClaimDisabled} className="w-full sm:w-auto">
                {actionLoading === 'claim'
                  ? 'Paying winner...'
                  : `Pay ${formatTokenAmount(bounty.reward_per_winner, bounty.token_type, bounty.token_category)}`}
              </Button>
            </form>
          </Card>
        )}

        {isCreator && bounty.status === 'ACTIVE' && !submissionWindow.open && (
          <Card padding="lg" className="mb-6 border border-secondary/40 bg-secondary/5">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-secondary mt-0.5" />
              <div>
                <p className="font-display font-bold text-textPrimary">Submission window closed</p>
                <p className="text-sm font-mono text-textMuted mt-1">{submissionWindow.reason}.</p>
              </div>
            </div>
          </Card>
        )}

        {/* Progress */}
        <Card padding="lg" className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-display font-bold text-textPrimary">Payout Progress</h3>
            <span className="text-lg md:text-xl lg:text-2xl font-display font-bold text-primary">
              {winnerProgress.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-4 bg-surfaceAlt rounded-full overflow-hidden mb-4">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${winnerProgress}%` }} />
          </div>
          <div className="flex justify-between text-sm font-mono text-textMuted">
            <span>{bounty.winners_count} paid</span>
            <span>{remainingPrizes} remaining</span>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Total Pool</span>
              <DollarSign className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {formatTokenAmount(totalPool, bounty.token_type, bounty.token_category)}
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Per Winner</span>
              <Target className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {formatTokenAmount(bounty.reward_per_winner, bounty.token_type, bounty.token_category)}
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Paid So Far</span>
              <CheckCircle className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {formatTokenAmount(bounty.total_paid, bounty.token_type, bounty.token_category)}
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Winners</span>
              <Users className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {bounty.winners_count} / {bounty.max_winners}
            </p>
          </Card>
        </div>

        {/* Details + Schedule */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Bounty Details</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Creator</span>
                <p className="text-sm font-mono text-textPrimary break-all">{bounty.creator}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Token Type</span>
                <p className="text-sm font-mono text-textPrimary">{bounty.token_type}</p>
              </div>
              {bounty.token_category && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">Token Category</span>
                  <p className="text-sm font-mono text-textPrimary break-all">{bounty.token_category}</p>
                </div>
              )}
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Mutability</span>
                <p className="text-sm font-mono text-textPrimary">
                  {bounty.cancelable ? 'Pause / Cancel enabled' : 'Immutable'}
                </p>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Submission Window
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Starts</span>
                <p className="text-sm font-mono text-textPrimary">
                  {bounty.start_date
                    ? new Date(bounty.start_date * 1000).toLocaleString()
                    : 'Immediately on funding'}
                </p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Ends</span>
                <p className="text-sm font-mono text-textPrimary">
                  {bounty.end_date && bounty.end_date > 0
                    ? new Date(bounty.end_date * 1000).toLocaleString()
                    : 'No deadline'}
                </p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Status</span>
                <p className="text-sm font-mono text-textPrimary">{bounty.status}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* On-chain links + Activity */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">On-Chain Links</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Contract</span>
                <p className="text-sm font-mono text-textPrimary break-all">{bounty.contract_address || '-'}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Funding Transaction</span>
                {bounty.tx_hash ? (
                  <a
                    href={getExplorerTxUrl(bounty.tx_hash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                  >
                    {bounty.tx_hash.slice(0, 12)}...{bounty.tx_hash.slice(-10)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-sm font-mono text-textMuted">Not funded yet</p>
                )}
              </div>
              {bounty.on_chain_campaign_id && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">On-chain Campaign ID</span>
                  <p className="text-sm font-mono text-textPrimary break-all">{bounty.on_chain_campaign_id}</p>
                </div>
              )}
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
              <History className="w-5 h-5" />
              Activity Timeline
            </h3>
            {events.length === 0 ? (
              <p className="text-sm font-mono text-textMuted">No activity events recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-surfaceAlt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-display font-bold text-textPrimary">
                          {formatBountyEventLabel(event.event_type)}
                        </p>
                        <p className="text-xs font-mono text-textMuted">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </p>
                        {event.actor && (
                          <p className="text-xs font-mono text-textMuted mt-1 break-all">actor: {event.actor}</p>
                        )}
                        {typeof event.amount === 'number' && (
                          <p className="text-xs font-mono text-textMuted mt-1">
                            amount: {formatTokenAmount(event.amount, bounty.token_type, bounty.token_category)}
                          </p>
                        )}
                      </div>
                      {event.tx_hash && (
                        <a
                          href={getExplorerTxUrl(event.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-xs transition-colors"
                        >
                          tx
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Receipt NFT placeholder */}
        <Card padding="lg" className="mb-6 md:mb-8 border border-border">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-6 h-6 text-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-display font-bold text-textPrimary mb-1">Receipt NFT</h3>
              <p className="text-sm font-mono text-textMuted">
                Each bounty carries a 40-byte state NFT on the covenant output. Winner-facing receipt NFTs (per claim)
                will surface here once the indexer attaches mintable receipt metadata.
              </p>
            </div>
          </div>
        </Card>

        {/* Winner history */}
        <Card padding="lg">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Winner History</h3>

          {claims.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-textMuted mx-auto mb-3" />
              <p className="text-textMuted font-mono">No winners paid yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Winner</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {claims.map((claim) => (
                    <tr key={claim.id} className="border-b border-border/40 hover:bg-surfaceAlt transition-colors">
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">
                        {new Date(claim.claimed_at * 1000).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">
                        {claim.winner_address.slice(0, 10)}...{claim.winner_address.slice(-8)}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-sm text-textPrimary">
                        {formatTokenAmount(claim.amount, bounty.token_type, bounty.token_category)}
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={getExplorerTxUrl(claim.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                        >
                          {claim.tx_hash.slice(0, 10)}...{claim.tx_hash.slice(-8)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
