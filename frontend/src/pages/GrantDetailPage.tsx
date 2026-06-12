/**
 * GrantDetailPage - A-Z lifecycle UI for a single GrantCovenant.
 *
 * Renders the canonical detail layout (back link → header + action cluster →
 * feedback banner → progress card → stats → details/schedule → on-chain links
 * + activity timeline → milestone table → history table). Action buttons are
 * role- and state-gated against the API state machine documented in
 * `backend/src/api/grants.ts`:
 *
 *   Creator + status === PENDING       → Fund (one-shot)
 *   Creator + status === ACTIVE        → Release next milestone, Pause, Cancel
 *   Creator + status === PAUSED        → Cancel (Resume is not yet exposed by the API)
 *   Recipient + status === ACTIVE      → Transfer (when transferable)
 *
 * Every on-chain action funnels through utils/blockchain.ts helpers
 * (`fundGrantContract`, `releaseGrantMilestone`, `pauseGrantOnChain`,
 * `cancelGrantOnChain`, `transferGrantOnChain`) which already implement the
 * wallet-signs / backend-broadcasts / poll-for-confirmation lifecycle.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  History,
  ListChecks,
  Pause,
  Send,
  Target,
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
import {
  cancelGrantOnChain,
  fundGrantContract,
  getExplorerTxUrl,
  pauseGrantOnChain,
  releaseGrantMilestone,
  transferGrantOnChain,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { formatTokenAmount } from '../utils/tokenFormat';
import { toUserFacingError } from '../utils/userError';
import {
  fetchGrant,
  type GrantActivityEvent,
  type GrantDetailResponse,
  type GrantMilestoneRow,
  type GrantRow,
} from '../services/grantApi';

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  details?: string;
  txHash?: string;
}

type ActionKey = 'fund' | 'release' | 'pause' | 'cancel' | 'transfer';

const FEEDBACK_TONE_CLASSES: Record<FeedbackTone, string> = {
  success: 'border-primary/30 bg-primary/5 text-primary',
  warning: 'border-secondary/30 bg-secondary/5 text-secondary',
  error: 'border-primary/40 bg-primary/5 text-primary',
  info: 'border-border bg-surfaceAlt text-textPrimary',
};

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return ' - ';
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Grant Created';
    case 'funded':
      return 'Grant Funded';
    case 'release':
    case 'released':
    case 'milestone_released':
      return 'Milestone Released';
    case 'paused':
      return 'Grant Paused';
    case 'resumed':
      return 'Grant Resumed';
    case 'cancelled':
      return 'Grant Cancelled';
    case 'transferred':
      return 'Recipient Transferred';
    case 'completed':
      return 'Grant Completed';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function getStatusBadgeClasses(status: GrantRow['status']): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'PENDING':
    case 'PAUSED':
      return 'bg-secondary/15 text-textPrimary border-secondary/40';
    case 'COMPLETED':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'CANCELLED':
    default:
      return 'bg-surfaceAlt text-textMuted border-border';
  }
}

function getMilestoneBadgeClasses(status: GrantMilestoneRow['status']): string {
  switch (status) {
    case 'RELEASED':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'CANCELLED':
      return 'bg-surfaceAlt text-textMuted border-border';
    case 'PENDING':
    default:
      return 'bg-secondary/15 text-textPrimary border-secondary/40';
  }
}

function buildErrorFeedback(title: string, error: unknown, fallback: string): FeedbackState {
  const parsed = toUserFacingError(error, fallback);
  return {
    tone: 'error',
    title,
    description: parsed.message,
    details: parsed.details,
  };
}

/**
 * Detail page for a single grant. Surfaces lifecycle controls, milestone
 * history, and activity events for the connected wallet.
 */
export default function GrantDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetwork();
  const routeState = location.state as { freshCreate?: boolean } | null;

  const [grant, setGrant] = useState<GrantRow | null>(null);
  const [milestones, setMilestones] = useState<GrantMilestoneRow[]>([]);
  const [events, setEvents] = useState<GrantActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<ActionKey | null>(null);
  const [transferRecipient, setTransferRecipient] = useState('');
  const [isFundingSyncing, setIsFundingSyncing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(
    routeState?.freshCreate
      ? {
          tone: 'info',
          title: 'Grant created. Funding is the next step.',
          description: 'The grant record and contract are live. Fund the contract from this page to activate milestone releases.',
        }
      : null,
  );

  const applyDetail = useCallback((data: GrantDetailResponse) => {
    setGrant(data.grant);
    setMilestones(data.milestones);
    setEvents(data.events);
  }, []);

  const refreshGrant = useCallback(async (): Promise<GrantRow | null> => {
    if (!id) return null;
    const data = await fetchGrant(id);
    applyDetail(data);
    return data.grant;
  }, [id, applyDetail]);

  const pollForGrantStatus = useCallback(
    async (targetStatuses: GrantRow['status'][], attempts = 8, delayMs = 1500): Promise<GrantRow | null> => {
      setIsFundingSyncing(true);
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const latest = await refreshGrant();
          if (latest && targetStatuses.includes(latest.status)) return latest;
          if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
        return null;
      } finally {
        setIsFundingSyncing(false);
      }
    },
    [refreshGrant],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchGrant(id);
        if (!cancelled) applyDetail(data);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load grant:', error);
        setFeedback(buildErrorFeedback('Failed to load grant.', error, 'Try refreshing the page.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, applyDetail]);

  const isCreator = useMemo(() => {
    if (!grant || !wallet.address) return false;
    return wallet.address.toLowerCase() === String(grant.creator || '').toLowerCase();
  }, [grant, wallet.address]);

  const isRecipient = useMemo(() => {
    if (!grant || !wallet.address) return false;
    return wallet.address.toLowerCase() === String(grant.recipient || '').toLowerCase();
  }, [grant, wallet.address]);

  const milestoneProgress = useMemo(() => {
    if (!grant || grant.milestones_total <= 0) return 0;
    return Math.min(100, (grant.milestones_completed / grant.milestones_total) * 100);
  }, [grant]);

  const remainingMilestones = useMemo(() => {
    if (!grant) return 0;
    return Math.max(0, grant.milestones_total - grant.milestones_completed);
  }, [grant]);

  const nextMilestoneNumber = useMemo(() => {
    if (!grant) return 0;
    return Math.min(grant.milestones_total, grant.milestones_completed + 1);
  }, [grant]);

  const ensureWalletConnected = (): boolean => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can run lifecycle actions on this grant.',
      });
      return false;
    }
    return true;
  };

  const handleFund = async () => {
    if (!grant || !ensureWalletConnected()) return;
    setActionLoading('fund');
    try {
      const result = await fundGrantContract(wallet, grant.id);
      await refreshGrant();

      if (result.confirmation === 'confirmed') {
        setFeedback({
          tone: 'success',
          title: 'Grant funded successfully.',
          description: 'The contract output is confirmed and the grant is ready for milestone releases.',
          txHash: result.txHash,
        });
      } else {
        setFeedback({
          tone: 'warning',
          title: 'Funding broadcast. Waiting for backend confirmation.',
          description:
            result.detail || 'The contract transaction is on-chain but not yet indexed. This page will keep checking.',
          txHash: result.txHash,
        });
      }

      const activated =
        result.confirmation === 'confirmed' ? await refreshGrant() : await pollForGrantStatus(['ACTIVE', 'PAUSED', 'CANCELLED']);

      if (activated?.status === 'ACTIVE') {
        setFeedback({
          tone: 'success',
          title: 'Grant is now active.',
          description: 'Releases can begin from the next milestone.',
          txHash: result.txHash,
        });
      }
    } catch (error: unknown) {
      console.error('Failed to fund grant:', error);
      setFeedback(buildErrorFeedback('Failed to fund grant.', error, 'Unable to fund grant'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = async () => {
    if (!grant || !ensureWalletConnected()) return;
    setActionLoading('release');
    try {
      const result = await releaseGrantMilestone(wallet, grant.id);
      await refreshGrant();
      setFeedback({
        tone: 'success',
        title: `Released milestone ${result.milestoneNumber}.`,
        description: `Paid ${formatTokenAmount(result.releaseAmount, grant.token_type, grant.token_category)} to the recipient.`,
        txHash: result.txHash,
      });
    } catch (error: unknown) {
      console.error('Failed to release milestone:', error);
      setFeedback(buildErrorFeedback('Failed to release milestone.', error, 'Unable to release milestone'));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    if (!grant || !ensureWalletConnected()) return;
    setActionLoading('pause');
    try {
      const txHash = await pauseGrantOnChain(wallet, grant.id);
      await refreshGrant();
      setFeedback({
        tone: 'success',
        title: 'Grant paused on-chain.',
        description: 'Milestone releases are blocked until the grant resumes.',
        txHash,
      });
    } catch (error: unknown) {
      console.error('Failed to pause grant:', error);
      setFeedback(buildErrorFeedback('Failed to pause grant.', error, 'Unable to pause grant'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!grant || !ensureWalletConnected()) return;
    const remaining = Math.max(0, grant.total_amount - grant.total_released);
    const confirmed = window.confirm(
      `Cancel this grant?\n\nRemaining ${formatTokenAmount(remaining, grant.token_type, grant.token_category)} will be refunded to the authority address derived from the contract. This action cannot be undone.`,
    );
    if (!confirmed) return;

    setActionLoading('cancel');
    try {
      const result = await cancelGrantOnChain(wallet, grant.id);
      await refreshGrant();

      const description = result.warning
        ? result.warning
        : `Remaining funds were refunded to ${result.authorityReturnAddress || result.cancelReturnAddress || 'the authority address'}.`;

      setFeedback({
        tone: 'success',
        title: 'Grant cancelled on-chain.',
        description,
        txHash: result.txHash,
      });

      navigate('/grants');
    } catch (error: unknown) {
      console.error('Failed to cancel grant:', error);
      setFeedback(buildErrorFeedback('Failed to cancel grant.', error, 'Unable to cancel grant'));
      setActionLoading(null);
    }
  };

  const handleTransfer = async () => {
    if (!grant || !ensureWalletConnected()) return;
    const next = transferRecipient.trim();
    if (!next) {
      setFeedback({
        tone: 'warning',
        title: 'Enter a new recipient address.',
        description: 'Provide a BCH P2PKH cash address to hand this grant off.',
      });
      return;
    }

    setActionLoading('transfer');
    try {
      const result = await transferGrantOnChain(wallet, grant.id, next);
      setTransferRecipient('');
      await refreshGrant();
      setFeedback({
        tone: 'success',
        title: 'Grant transferred.',
        description: `Recipient updated to ${result.newRecipientAddress}.`,
        txHash: result.txHash,
      });
    } catch (error: unknown) {
      console.error('Failed to transfer grant:', error);
      setFeedback(buildErrorFeedback('Failed to transfer grant.', error, 'Unable to transfer grant'));
    } finally {
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

  if (!grant) {
    return (
      <div className="p-8">
        <Card padding="xl" className="text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary mb-2">Grant not found</h2>
          <p className="text-textMuted font-mono mb-6">This grant does not exist or you don't have access.</p>
          <Button onClick={() => navigate('/grants')}>Back to Grants</Button>
        </Card>
      </div>
    );
  }

  const canFund = isCreator && grant.status === 'PENDING';
  const canRelease =
    isCreator && grant.status === 'ACTIVE' && grant.milestones_completed < grant.milestones_total;
  const canPause = isCreator && grant.cancelable && grant.status === 'ACTIVE';
  const canCancel = isCreator && grant.cancelable && (grant.status === 'ACTIVE' || grant.status === 'PAUSED');
  const canTransfer = isRecipient && grant.transferable && grant.status === 'ACTIVE';

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <button
            type="button"
            onClick={() => navigate('/grants')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Grants
          </button>

          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center flex-wrap gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary">
                  {grant.title}
                </h1>
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase border ${getStatusBadgeClasses(grant.status)}`}>
                  {grant.status}
                </span>
              </div>
              {grant.description && <p className="text-textMuted font-mono mb-2 max-w-3xl">{grant.description}</p>}
              <p className="text-sm text-textMuted font-mono">{formatLogicalId(grant.grant_number)}</p>
            </div>

            <div className="flex flex-wrap gap-2 md:gap-3 md:justify-end">
              {canFund && (
                <Button
                  variant="primary"
                  onClick={handleFund}
                  disabled={actionLoading === 'fund'}
                  loading={actionLoading === 'fund'}
                  className="flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  {actionLoading === 'fund' ? 'Funding...' : 'Fund Grant'}
                </Button>
              )}
              {canRelease && (
                <Button
                  variant="primary"
                  onClick={handleRelease}
                  disabled={actionLoading === 'release'}
                  loading={actionLoading === 'release'}
                  className="flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {actionLoading === 'release' ? 'Releasing...' : `Release Milestone ${nextMilestoneNumber}`}
                </Button>
              )}
              {canPause && (
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={actionLoading === 'pause'}
                  loading={actionLoading === 'pause'}
                  className="flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={actionLoading === 'cancel'}
                  loading={actionLoading === 'cancel'}
                  className="flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>

        {feedback && (
          <Card padding="lg" className={`mb-6 border ${FEEDBACK_TONE_CLASSES[feedback.tone]}`}>
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{feedback.title}</p>
                {feedback.description && (
                  <p className="mt-1 text-sm leading-6 text-textSecondary whitespace-pre-wrap break-words">{feedback.description}</p>
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
                {feedback.txHash && (
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
                  <p className="mt-3 text-xs font-mono uppercase tracking-[0.18em] text-textMuted">Syncing grant status…</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Progress hero */}
        <Card padding="lg" className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-xl font-display font-bold text-textPrimary mb-1">Milestone Progress</h3>
              <p className="text-sm font-mono text-textMuted">
                {grant.milestones_completed} of {grant.milestones_total} milestones released
                {remainingMilestones > 0 && (
                  <span> · {remainingMilestones} remaining</span>
                )}
              </p>
            </div>
            <span className="text-2xl md:text-3xl font-display font-bold text-primary">{milestoneProgress.toFixed(1)}%</span>
          </div>
          <div className="w-full h-4 bg-surfaceAlt rounded-full overflow-hidden mb-3">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${milestoneProgress}%` }} />
          </div>
          <div className="flex justify-between text-sm font-mono text-textMuted">
            <span>{formatTokenAmount(grant.total_released, grant.token_type, grant.token_category)} released</span>
            <span>{formatTokenAmount(grant.total_amount, grant.token_type, grant.token_category)} total</span>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <SimpleStat label="Per Milestone" value={formatTokenAmount(grant.amount_per_milestone, grant.token_type, grant.token_category)} icon={Target} />
          <SimpleStat label="Total Locked" value={formatTokenAmount(grant.total_amount, grant.token_type, grant.token_category)} icon={DollarSign} />
          <SimpleStat label="Released" value={formatTokenAmount(grant.total_released, grant.token_type, grant.token_category)} icon={CheckCircle2} />
          <SimpleStat label="Milestones" value={`${grant.milestones_completed} / ${grant.milestones_total}`} icon={ListChecks} />
        </div>

        {/* Details + Schedule */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Grant Details</h3>
            <div className="space-y-3">
              <DetailRow label="Creator" value={grant.creator} mono />
              <DetailRow label="Recipient" value={grant.recipient} mono />
              <DetailRow label="Token Type" value={grant.token_type} />
              {grant.token_category && <DetailRow label="Token Category" value={grant.token_category} mono />}
              {grant.vault_id && <DetailRow label="Vault" value={grant.vault_id} mono />}
              <DetailRow label="Cancelable" value={grant.cancelable ? 'Yes' : 'No'} />
              <DetailRow label="Transferable" value={grant.transferable ? 'Yes' : 'No'} />
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Schedule</h3>
            <div className="space-y-3">
              <DetailRow label="Status" value={grant.status} />
              <DetailRow label="Created" value={formatTimestamp(grant.created_at)} />
              <DetailRow label="Last update" value={formatTimestamp(grant.updated_at)} />
              <DetailRow label="Total milestones" value={String(grant.milestones_total)} />
              <DetailRow label="Released milestones" value={String(grant.milestones_completed)} />
            </div>
          </Card>
        </div>

        {/* Transfer panel - only for current recipient when transferable */}
        {canTransfer && (
          <Card padding="lg" className="mb-6 md:mb-8 border-accent/30">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-2">Transfer Grant</h3>
            <p className="text-sm font-mono text-textMuted mb-4">
              You can hand this grant to a new recipient. Future milestone releases will pay them instead.
            </p>
            <div className="flex flex-col md:flex-row gap-3 md:items-end">
              <div className="flex-1">
                <Input
                  label="New recipient address"
                  placeholder="bitcoincash:q..."
                  value={transferRecipient}
                  onChange={(e) => setTransferRecipient(e.target.value)}
                />
              </div>
              <Button
                variant="primary"
                onClick={handleTransfer}
                disabled={actionLoading === 'transfer' || !transferRecipient.trim()}
                loading={actionLoading === 'transfer'}
                className="md:w-auto w-full flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {actionLoading === 'transfer' ? 'Transferring...' : 'Transfer'}
              </Button>
            </div>
          </Card>
        )}

        {/* On-chain links + Activity */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">On-Chain Links</h3>
            <div className="space-y-3">
              <DetailRow label="Contract" value={grant.contract_address || ' - '} mono />
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Funding transaction</span>
                {grant.tx_hash ? (
                  <a
                    href={getExplorerTxUrl(grant.tx_hash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                  >
                    {grant.tx_hash.slice(0, 12)}...{grant.tx_hash.slice(-10)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-sm font-mono text-textMuted">Not funded yet</p>
                )}
              </div>
              {/*
                Receipt-NFT card placeholder - the contract anchors a mutable
                state NFT to the contract output. A future iteration can resolve
                BCMR metadata and render an icon + decoded commitment here.
              */}
              <div className="rounded-lg border border-dashed border-border bg-surfaceAlt p-3">
                <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Receipt NFT</p>
                <p className="text-sm font-mono text-textMuted">
                  Mutable state NFT anchored to the contract output. BCMR metadata renders the receipt in any CashTokens-aware wallet.
                </p>
              </div>
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
                        <p className="text-sm font-display font-bold text-textPrimary">{formatEventLabel(event.event_type)}</p>
                        <p className="text-xs font-mono text-textMuted inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </p>
                        {event.actor && (
                          <p className="text-xs font-mono text-textMuted mt-1 break-all">actor: {event.actor}</p>
                        )}
                        {typeof event.amount === 'number' && (
                          <p className="text-xs font-mono text-textMuted mt-1">
                            amount: {formatTokenAmount(event.amount, grant.token_type, grant.token_category)}
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

        {/* Milestones */}
        <Card padding="lg" className="mb-6 md:mb-8">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
            <ListChecks className="w-5 h-5" />
            Milestone Plan
          </h3>
          {milestones.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-12 h-12 text-textMuted mx-auto mb-3" />
              <p className="text-textMuted font-mono">No milestone records found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">#</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Title</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Released At</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone) => (
                    <tr key={milestone.id} className="border-b border-border/40 hover:bg-surfaceAlt transition-colors">
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">{milestone.milestone_index}</td>
                      <td className="py-3 px-4 text-sm text-textPrimary">
                        <p className="font-sans font-medium">{milestone.title || `Milestone ${milestone.milestone_index}`}</p>
                        {milestone.description && (
                          <p className="text-xs font-mono text-textMuted line-clamp-2">{milestone.description}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getMilestoneBadgeClasses(milestone.status)}`}>
                          {milestone.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-textMuted">{formatTimestamp(milestone.released_at)}</td>
                      <td className="py-3 px-4">
                        {milestone.tx_hash ? (
                          <a
                            href={getExplorerTxUrl(milestone.tx_hash, network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                          >
                            {milestone.tx_hash.slice(0, 10)}...{milestone.tx_hash.slice(-8)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-sm font-mono text-textMuted"> - </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Roles footer */}
        <Card padding="lg">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            Your Role
          </h3>
          <div className="space-y-2 text-sm font-mono text-textMuted">
            <p>
              <Award className="inline w-4 h-4 mr-1 text-primary" />
              {isCreator
                ? 'You are the creator. You can authorize releases and (if cancelable) pause or cancel.'
                : 'You are not the creator of this grant.'}
            </p>
            <p>
              <Target className="inline w-4 h-4 mr-1 text-accent" />
              {isRecipient
                ? grant.transferable
                  ? 'You are the recipient. Released milestones pay your address; you can transfer the grant if needed.'
                  : 'You are the recipient. Released milestones pay your address.'
                : 'You are not the recipient of this grant.'}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function DetailRow({ label, value, mono = false }: DetailRowProps) {
  return (
    <div>
      <span className="block text-xs font-mono text-textMuted uppercase mb-1">{label}</span>
      <p className={`text-sm ${mono ? 'font-mono' : 'font-sans'} text-textPrimary break-all`}>{value}</p>
    </div>
  );
}

interface SimpleStatProps {
  label: string;
  value: string;
  icon: typeof Award;
}

function SimpleStat({ label, value, icon: Icon }: SimpleStatProps) {
  return (
    <Card padding="lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-mono text-textMuted uppercase tracking-wide">{label}</span>
        <Icon className="w-5 h-5 text-textMuted" />
      </div>
      <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary break-words">{value}</p>
    </Card>
  );
}
