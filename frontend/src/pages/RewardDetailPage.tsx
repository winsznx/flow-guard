/**
 * RewardDetailPage - A→Z detail view for a single Reward campaign.
 *
 * Sections mirror AirdropDetailPage: back link, header + status badge, action
 * cluster (role + state gated), feedback banner, hero stats, two-column
 * details/schedule, on-chain links + activity timeline, distribution history.
 *
 * Role gates:
 *   - Creator: Fund (PENDING) → Distribute (ACTIVE) → Pause (ACTIVE) →
 *     Cancel (ACTIVE | PAUSED).
 *   - Non-creator: read-only. Rewards are creator-pushed, not pull-claimed.
 */

import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Calendar,
  Coins,
  DollarSign,
  ExternalLink,
  History,
  Pause,
  Send,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { SkeletonCard, SkeletonStats } from '../components/ui/Skeleton';
import { useNetwork } from '../hooks/useNetwork';
import { useWallet } from '../hooks/useWallet';
import {
  cancelRewardOnChain,
  distributeRewardOnChain,
  fundRewardContract,
  getExplorerTxUrl,
  pauseRewardOnChain,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { toUserFacingError } from '../utils/userError';
import { fetchReward } from '../services/rewardApi';
import type {
  RewardActivityEvent,
  RewardDistributionRow,
  RewardRow,
} from '../services/rewardApi';

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  details?: string;
  txHash?: string;
}

type RewardAction = 'fund' | 'distribute' | 'pause' | 'cancel';

const FEEDBACK_TONE_CLASSES: Record<FeedbackTone, string> = {
  success: 'border-primary/30 bg-primary/5 text-primary',
  warning: 'border-secondary/30 bg-secondary/5 text-secondary',
  error: 'border-error/30 bg-error/5 text-error',
  info: 'border-border bg-surfaceAlt text-textPrimary',
};

function buildErrorFeedback(title: string, error: unknown, fallback: string): FeedbackState {
  const parsed = toUserFacingError(error, fallback);
  return {
    tone: 'error',
    title,
    description: parsed.message,
    details: parsed.details,
  };
}

function formatEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Reward Created';
    case 'funded':
      return 'Reward Funded';
    case 'distribute':
    case 'distributed':
      return 'Reward Distributed';
    case 'paused':
      return 'Reward Paused';
    case 'resumed':
      return 'Reward Resumed';
    case 'cancelled':
      return 'Reward Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-accent/20 text-accent';
    case 'PAUSED':
      return 'bg-secondary/20 text-textPrimary border border-secondary/40';
    case 'COMPLETED':
      return 'bg-primary/20 text-primary';
    case 'CANCELLED':
      return 'bg-error/15 text-error';
    case 'PENDING':
    default:
      return 'bg-surfaceAlt text-textPrimary border border-border';
  }
}

/**
 * Reward campaign detail page. Lazy-loaded in Phase 3.
 */
export default function RewardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetwork();

  const routeState = location.state as { freshCreate?: boolean } | null;

  const [campaign, setCampaign] = useState<RewardRow | null>(null);
  const [distributions, setDistributions] = useState<RewardDistributionRow[]>([]);
  const [events, setEvents] = useState<RewardActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<RewardAction | null>(null);
  const [isFundingSyncing, setIsFundingSyncing] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(
    routeState?.freshCreate
      ? {
          tone: 'info',
          title: 'Reward campaign created. Funding is the next step.',
          description:
            'The campaign record is live now. Fund the contract from this page to unlock distributions.',
        }
      : null,
  );

  const [distributeRecipient, setDistributeRecipient] = useState('');
  const [distributeAmount, setDistributeAmount] = useState('');
  const [distributeError, setDistributeError] = useState<string | null>(null);

  const refreshCampaign = useCallback(async (): Promise<RewardRow | null> => {
    if (!id) return null;
    const data = await fetchReward(id);
    setCampaign(data.campaign ?? null);
    setDistributions(data.distributions ?? []);
    setEvents(data.events ?? []);
    return data.campaign ?? null;
  }, [id]);

  const pollForCampaignStatus = useCallback(
    async (targetStatuses: string[], attempts = 8, delayMs = 1500): Promise<RewardRow | null> => {
      setIsFundingSyncing(true);
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const latest = await refreshCampaign();
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
    [refreshCampaign],
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        await refreshCampaign();
      } catch (error) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[RewardDetailPage] Failed to load campaign:', error);
        setFeedback(
          buildErrorFeedback(
            'Failed to load reward campaign.',
            error,
            'Try refreshing the page.',
          ),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [id, refreshCampaign]);

  const isCreator = useMemo(() => {
    if (!campaign || !wallet.address) return false;
    return wallet.address.toLowerCase() === String(campaign.creator || '').toLowerCase();
  }, [campaign, wallet.address]);

  const remainingPool = useMemo(() => {
    if (!campaign) return 0;
    return Math.max(0, (campaign.total_pool ?? 0) - (campaign.distributed_total ?? 0));
  }, [campaign]);

  const drawdownPercent = useMemo(() => {
    if (!campaign || !campaign.total_pool) return 0;
    return Math.min(100, (campaign.distributed_total / campaign.total_pool) * 100);
  }, [campaign]);

  const requireWallet = useCallback((): boolean => {
    if (wallet.isConnected) return true;
    setFeedback({
      tone: 'info',
      title: 'Connect your wallet first.',
      description: 'Wallet access is required before performing this action.',
    });
    return false;
  }, [wallet.isConnected]);

  const handleFund = async () => {
    if (!id || !requireWallet()) return;
    setActionLoading('fund');
    try {
      const result = await fundRewardContract(wallet, id);
      await refreshCampaign();

      if (result.confirmation === 'confirmed') {
        setFeedback({
          tone: 'success',
          title: 'Reward funded successfully.',
          description: 'The contract output is confirmed and the campaign can begin distributions.',
          txHash: result.txHash,
        });
      } else {
        setFeedback({
          tone: 'warning',
          title: 'Funding transaction broadcast. Waiting for backend confirmation.',
          description:
            result.detail ||
            'The contract transaction is on-chain, but the backend has not flipped the campaign to ACTIVE yet. This page will keep checking.',
          txHash: result.txHash,
        });
        const activated = await pollForCampaignStatus(['ACTIVE', 'PAUSED', 'CANCELLED']);
        if (activated?.status === 'ACTIVE') {
          setFeedback({
            tone: 'success',
            title: 'Reward campaign is now active.',
            description: 'The funding output has been indexed and rewards can be distributed.',
            txHash: result.txHash,
          });
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RewardDetailPage] Fund failed:', error);
      setFeedback(buildErrorFeedback('Failed to fund reward.', error, 'Unable to fund reward.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePause = async () => {
    if (!id || !requireWallet()) return;
    setActionLoading('pause');
    try {
      const txHash = await pauseRewardOnChain(wallet, id);
      await refreshCampaign();
      setFeedback({
        tone: 'success',
        title: 'Reward paused on-chain.',
        description: 'Distributions are temporarily blocked. Resume from the covenant once ready.',
        txHash,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RewardDetailPage] Pause failed:', error);
      setFeedback(buildErrorFeedback('Failed to pause reward.', error, 'Unable to pause reward.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!id || !requireWallet() || !campaign) return;
    const confirmed = window.confirm(
      `Cancel this reward campaign?\n\nRemaining pool (${remainingPool.toFixed(
        4,
      )} ${campaign.token_type}) will be refunded to the original authority address. This action is irreversible.`,
    );
    if (!confirmed) return;

    setActionLoading('cancel');
    try {
      const result = await cancelRewardOnChain(wallet, id);
      setFeedback({
        tone: 'success',
        title: 'Reward campaign cancelled.',
        description:
          result.warning ||
          (result.cancelReturnAddress
            ? `Remaining pool refunded to ${result.cancelReturnAddress}.`
            : 'Remaining pool refunded to the authority address.'),
        txHash: result.txHash,
      });
      navigate('/rewards');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RewardDetailPage] Cancel failed:', error);
      setFeedback(
        buildErrorFeedback('Failed to cancel reward.', error, 'Unable to cancel reward.'),
      );
      setActionLoading(null);
    }
  };

  const handleDistribute = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || !campaign || !requireWallet()) return;

    const recipient = distributeRecipient.trim();
    const amount = Number.parseFloat(distributeAmount);

    if (!recipient) {
      setDistributeError('Recipient address is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setDistributeError('Reward amount must be greater than 0.');
      return;
    }
    if (amount > campaign.max_reward_amount) {
      setDistributeError(
        `Amount cannot exceed the max reward (${campaign.max_reward_amount.toFixed(4)} ${campaign.token_type}).`,
      );
      return;
    }
    if (amount > remainingPool) {
      setDistributeError(
        `Amount exceeds remaining pool (${remainingPool.toFixed(4)} ${campaign.token_type}).`,
      );
      return;
    }

    setDistributeError(null);
    setActionLoading('distribute');
    try {
      const txHash = await distributeRewardOnChain(wallet, id, recipient, amount);
      await refreshCampaign();
      setFeedback({
        tone: 'success',
        title: `Distributed ${amount.toFixed(4)} ${campaign.token_type}.`,
        description: `Reward sent to ${recipient.slice(0, 14)}…${recipient.slice(-10)}.`,
        txHash,
      });
      setDistributeRecipient('');
      setDistributeAmount('');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RewardDetailPage] Distribute failed:', error);
      setFeedback(
        buildErrorFeedback(
          'Failed to distribute reward.',
          error,
          'Unable to distribute reward.',
        ),
      );
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

  if (!campaign) {
    return (
      <div className="p-8">
        <Card padding="xl" className="text-center">
          <Trophy className="w-12 h-12 text-textMuted mx-auto mb-4" />
          <h2 className="text-xl md:text-2xl font-display font-bold text-textPrimary mb-2">
            Reward not found
          </h2>
          <p className="text-textMuted font-mono mb-6">
            This reward campaign does not exist or you don&apos;t have access.
          </p>
          <Button onClick={() => navigate('/rewards')}>Back to Rewards</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Back link */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/rewards')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Rewards
          </button>

          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary">
                  {campaign.title}
                </h1>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${statusBadgeClasses(
                    campaign.status,
                  )}`}
                >
                  {campaign.status}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-mono uppercase border border-border text-textMuted">
                  {campaign.reward_category}
                </span>
              </div>
              {campaign.description && (
                <p className="text-textMuted font-mono mb-2 break-words">{campaign.description}</p>
              )}
              <p className="text-sm text-textMuted font-mono">
                {formatLogicalId(campaign.campaign_id)}
              </p>
            </div>

            <div className="flex gap-3 flex-wrap">
              {isCreator && campaign.status === 'PENDING' && (
                <Button
                  variant="primary"
                  onClick={handleFund}
                  disabled={actionLoading === 'fund'}
                  loading={actionLoading === 'fund'}
                  className="flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  Fund Reward
                </Button>
              )}

              {isCreator && campaign.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={actionLoading === 'pause'}
                  loading={actionLoading === 'pause'}
                  className="flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </Button>
              )}

              {isCreator && (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={actionLoading === 'cancel'}
                  loading={actionLoading === 'cancel'}
                  className="flex items-center gap-2 text-error border-error hover:bg-error/5"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Feedback banner */}
        {feedback && (
          <Card padding="lg" className={`mb-6 border ${FEEDBACK_TONE_CLASSES[feedback.tone]}`}>
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
                  <p className="mt-3 text-xs font-mono uppercase tracking-[0.18em] text-textMuted">
                    Syncing reward status…
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Hero progress */}
        <Card padding="lg" className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-display font-bold text-textPrimary">Pool Drawdown</h3>
            <span className="text-lg md:text-xl lg:text-2xl font-display font-bold text-primary">
              {drawdownPercent.toFixed(1)}%
            </span>
          </div>
          <div className="w-full h-4 bg-surfaceAlt rounded-full overflow-hidden mb-4 border border-border">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${drawdownPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-sm font-mono text-textMuted">
            <span>
              {(campaign.distributed_total ?? 0).toFixed(4)} {campaign.token_type} distributed
            </span>
            <span>
              {remainingPool.toFixed(4)} {campaign.token_type} remaining
            </span>
          </div>
        </Card>

        {/* Stats grid */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Total Pool</span>
              <DollarSign className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {(campaign.total_pool ?? 0).toFixed(4)}{' '}
              <span className="text-lg text-textMuted">{campaign.token_type}</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Max Reward</span>
              <Trophy className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {(campaign.max_reward_amount ?? 0).toFixed(4)}{' '}
              <span className="text-lg text-textMuted">{campaign.token_type}</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Distributed</span>
              <Coins className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {(campaign.distributed_total ?? 0).toFixed(4)}{' '}
              <span className="text-lg text-textMuted">{campaign.token_type}</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Recipients</span>
              <Users className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {campaign.distributed_count ?? 0}
            </p>
          </Card>
        </div>

        {/* Creator distribution form */}
        {isCreator && campaign.status === 'ACTIVE' && (
          <Card padding="lg" className="mb-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Send className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-display font-bold text-textPrimary mb-1">
                  Distribute Reward
                </h3>
                <p className="text-sm text-textMuted font-mono">
                  Pick a recipient and an amount. The covenant enforces 0 &lt; amount ≤ max reward and
                  caps the total pool.
                </p>
              </div>
            </div>

            <form onSubmit={handleDistribute} className="space-y-4">
              <Input
                label="Recipient Address"
                placeholder="bitcoincash:qq..."
                value={distributeRecipient}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDistributeRecipient(e.target.value)
                }
                required
              />

              <Input
                label={`Reward Amount (${campaign.token_type})`}
                type="number"
                step={campaign.token_type === 'BCH' ? '0.00000001' : '1'}
                min="0"
                placeholder={`Up to ${campaign.max_reward_amount.toFixed(4)}`}
                value={distributeAmount}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setDistributeAmount(e.target.value)
                }
                helpText={`Remaining pool: ${remainingPool.toFixed(4)} ${campaign.token_type}`}
                required
              />

              {distributeError && (
                <div className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm font-mono text-error">
                  {distributeError}
                </div>
              )}

              <Button
                type="submit"
                disabled={actionLoading === 'distribute' || remainingPool <= 0}
                loading={actionLoading === 'distribute'}
                className="flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Distribute Reward
              </Button>
            </form>
          </Card>
        )}

        {/* Details + Schedule */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">
              Campaign Details
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Creator</span>
                <p className="text-sm font-mono text-textPrimary break-all">{campaign.creator}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Asset</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.token_type}</p>
              </div>
              {campaign.token_category && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">
                    Token Category
                  </span>
                  <p className="text-sm font-mono text-textPrimary break-all">
                    {campaign.token_category}
                  </p>
                </div>
              )}
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Status</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.status}</p>
              </div>
              {campaign.vault_id && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">
                    Vault Link
                  </span>
                  <p className="text-sm font-mono text-textPrimary break-all">{campaign.vault_id}</p>
                </div>
              )}
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Schedule
            </h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">
                  Created
                </span>
                <p className="text-sm font-mono text-textPrimary">
                  {new Date(campaign.created_at * 1000).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Start</span>
                <p className="text-sm font-mono text-textPrimary">
                  {campaign.start_date
                    ? new Date(campaign.start_date * 1000).toLocaleDateString()
                    : 'Immediate'}
                </p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">End</span>
                <p className="text-sm font-mono text-textPrimary">
                  {campaign.end_date
                    ? new Date(campaign.end_date * 1000).toLocaleDateString()
                    : 'Open-ended'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* On-chain + Activity */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">On-Chain Links</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">
                  Contract Address
                </span>
                <p className="text-sm font-mono text-textPrimary break-all">
                  {campaign.contract_address || ' - '}
                </p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">
                  Funding Transaction
                </span>
                {campaign.tx_hash ? (
                  <a
                    href={getExplorerTxUrl(campaign.tx_hash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                  >
                    {campaign.tx_hash.slice(0, 12)}…{campaign.tx_hash.slice(-10)}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <p className="text-sm font-mono text-textMuted">Not funded yet</p>
                )}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4 flex items-center gap-2">
              <History className="w-5 h-5" />
              Activity Timeline
            </h3>
            {events.length === 0 ? (
              <p className="text-sm font-mono text-textMuted">No activity events yet.</p>
            ) : (
              <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-surfaceAlt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-display font-bold text-textPrimary">
                          {formatEventLabel(event.event_type)}
                        </p>
                        <p className="text-xs font-mono text-textMuted">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </p>
                        {event.actor && (
                          <p className="text-xs font-mono text-textMuted mt-1 break-all">
                            actor: {event.actor}
                          </p>
                        )}
                        {typeof event.amount === 'number' && (
                          <p className="text-xs font-mono text-textMuted mt-1">
                            amount: {event.amount.toFixed(4)} {campaign.token_type}
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

        {/* Receipt-NFT placeholder + Distribution history */}
        <Card padding="lg" className="mb-6 md:mb-8 border border-dashed border-border">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
              <Award className="w-6 h-6 text-secondary" />
            </div>
            <div>
              <h4 className="font-display font-bold text-textPrimary mb-1">Receipt NFT</h4>
              <p className="text-sm font-mono text-textMuted">
                The reward covenant carries a mutable state NFT tracking distributed totals and
                counts. A dedicated receipt view will surface here once decoded BCMR metadata is
                wired up.
              </p>
            </div>
          </div>
        </Card>

        <Card padding="lg">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4">
            Distribution History
          </h3>

          {distributions.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-textMuted mx-auto mb-3" />
              <p className="text-textMuted font-mono">No rewards distributed yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">
                      Recipient
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Amount</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">
                      Transaction
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/40 hover:bg-surfaceAlt transition-colors"
                    >
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">
                        {new Date(row.distributed_at * 1000).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-mono text-sm text-textPrimary">
                        {row.recipient.slice(0, 10)}…{row.recipient.slice(-8)}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-sm text-textPrimary">
                        {row.amount.toFixed(4)} {campaign.token_type}
                      </td>
                      <td className="py-3 px-4">
                        <a
                          href={getExplorerTxUrl(row.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                        >
                          {row.tx_hash.slice(0, 10)}…{row.tx_hash.slice(-8)}
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
