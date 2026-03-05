import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useWallet } from '../hooks/useWallet';
import { useNetwork } from '../hooks/useNetwork';
import {
  fundAirdropContract,
  claimAirdropFunds,
  pauseAirdropOnChain,
  cancelAirdropOnChain,
  getExplorerTxUrl,
} from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { toUserFacingError } from '../utils/userError';
import {
  ChevronLeft,
  Gift,
  Users,
  DollarSign,
  Calendar,
  Copy,
  Check,
  ExternalLink,
  Pause,
  X,
  TrendingUp,
  Wallet,
  Download,
  History,
  AlertCircle,
} from 'lucide-react';

interface ActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  details?: Record<string, unknown> | null;
}

type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

interface FeedbackState {
  tone: FeedbackTone;
  title: string;
  description?: string;
  details?: string;
  txHash?: string;
}

export default function AirdropDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const wallet = useWallet();
  const network = useNetwork();
  const routeState = location.state as { freshCreate?: boolean } | null;
  const [campaign, setCampaign] = useState<any>(null);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [userEligibility, setUserEligibility] = useState<{ eligible: boolean; amount: number; alreadyClaimed: boolean } | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState | null>(
    routeState?.freshCreate
      ? {
          tone: 'info',
          title: 'Campaign created. Funding is the next step.',
          description: 'The campaign record is live now. Fund the contract from this page to activate claims.',
        }
      : null,
  );
  const [isFundingSyncing, setIsFundingSyncing] = useState(false);

  const buildErrorFeedback = (
    title: string,
    error: unknown,
    fallback: string,
  ): FeedbackState => {
    const parsed = toUserFacingError(error, fallback);
    return {
      tone: 'error',
      title,
      description: parsed.message,
      details: parsed.details,
    };
  };

  const refreshCampaign = useCallback(async () => {
    if (!id) return null;
    const response = await fetch(`/api/airdrops/${id}`);
    const data = await response.json();
    setCampaign(data.campaign);
    setClaims(data.claims || []);
    setEvents(data.events || []);
    return data.campaign;
  }, [id]);

  const pollForCampaignStatus = useCallback(
    async (targetStatuses: string[], attempts = 8, delayMs = 1500) => {
      setIsFundingSyncing(true);
      try {
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          const latestCampaign = await refreshCampaign();
          if (latestCampaign && targetStatuses.includes(latestCampaign.status)) {
            return latestCampaign;
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
    const fetchCampaign = async () => {
      try {
        setLoading(true);
        await refreshCampaign();
      } catch (error) {
        console.error('Failed to fetch campaign:', error);
        setFeedback(buildErrorFeedback('Failed to load campaign details.', error, 'Try refreshing the page.'));
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchCampaign();
  }, [id, refreshCampaign]);

  // Check if user is eligible to claim
  useEffect(() => {
    const checkEligibility = async () => {
      if (!wallet.address || !campaign || campaign.status !== 'ACTIVE') {
        setUserEligibility(null);
        return;
      }

      try {
        // Check if address has reached its per-address claim limit
        const maxClaimsPerAddress = Math.max(1, Number(campaign.max_claims_per_address ?? 1));
        const claimsByAddress = claims.filter((c) => c.claimer === wallet.address).length;

        if (claimsByAddress >= maxClaimsPerAddress) {
          setUserEligibility({ eligible: false, amount: 0, alreadyClaimed: true });
          return;
        }

        // Try to get proof - if it exists, user is eligible
        const response = await fetch(`/api/airdrops/${id}/proof/${wallet.address}`);

        if (response.ok) {
          const data = await response.json();
          setUserEligibility({ eligible: true, amount: data.amount, alreadyClaimed: false });
        } else {
          setUserEligibility({ eligible: false, amount: 0, alreadyClaimed: false });
        }
      } catch (error) {
        console.error('Failed to check eligibility:', error);
        setUserEligibility({ eligible: false, amount: 0, alreadyClaimed: false });
      }
    };

    checkEligibility();
  }, [wallet.address, campaign, claims, id]);

  const copyClaimLink = () => {
    if (campaign?.claim_link) {
      navigator.clipboard.writeText(campaign.claim_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePause = async () => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can pause this campaign.',
      });
      return;
    }
    setActionLoading('pause');
    try {
      const txHash = await pauseAirdropOnChain(wallet, id!);
      await refreshCampaign();
      setFeedback({
        tone: 'success',
        title: 'Campaign paused on-chain.',
        description: 'Claims are now paused until the campaign is resumed.',
        txHash,
      });
    } catch (error: any) {
      console.error('Failed to pause campaign:', error);
      setFeedback(buildErrorFeedback('Failed to pause campaign.', error, 'Unable to pause campaign'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this campaign? Remaining funds will be refunded.')) {
      return;
    }

    setActionLoading('cancel');
    try {
      if (!wallet.isConnected) {
        throw new Error('Please connect your wallet first');
      }
      const txHash = await cancelAirdropOnChain(wallet, id!);
      setFeedback({
        tone: 'success',
        title: 'Campaign cancelled on-chain.',
        description: 'Remaining funds were returned according to the cancellation flow.',
        txHash,
      });
      navigate('/airdrops');
    } catch (error: any) {
      console.error('Failed to cancel campaign:', error);
      setFeedback(buildErrorFeedback('Failed to cancel campaign.', error, 'Unable to cancel campaign'));
      setActionLoading(null);
    }
  };

  const handleFund = async () => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can fund this campaign.',
      });
      return;
    }

    setActionLoading('fund');
    try {
      const result = await fundAirdropContract(wallet, id!);
      await refreshCampaign();

      if (result.confirmation === 'confirmed') {
        setFeedback({
          tone: 'success',
          title: 'Airdrop funded successfully.',
          description: 'The contract output is confirmed and the campaign is ready for claims.',
          txHash: result.txHash,
        });
      } else {
        setFeedback({
          tone: 'warning',
          title: 'Funding transaction broadcast. Waiting for backend confirmation.',
          description:
            result.detail ||
            'The contract transaction is on-chain, but the backend has not marked the campaign active yet. This page will keep checking.',
          txHash: result.txHash,
        });
      }

      const activatedCampaign =
        result.confirmation === 'confirmed'
          ? await refreshCampaign()
          : await pollForCampaignStatus(['ACTIVE', 'PAUSED', 'CANCELLED']);

      if (activatedCampaign?.status === 'ACTIVE') {
        setFeedback({
          tone: 'success',
          title: 'Airdrop is now active.',
          description: 'The funding output has been indexed and claims can begin.',
          txHash: result.txHash,
        });
      }
    } catch (error: any) {
      console.error('Failed to fund airdrop:', error);
      setFeedback(buildErrorFeedback('Failed to fund airdrop.', error, 'Unable to fund airdrop'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleClaim = async () => {
    if (!wallet.isConnected) {
      setFeedback({
        tone: 'info',
        title: 'Connect your wallet first.',
        description: 'Wallet access is required before you can claim.',
      });
      return;
    }

    if (!userEligibility?.eligible) {
      setFeedback({
        tone: 'warning',
        title: 'This wallet is not eligible to claim.',
        description: 'Check the eligibility list or use the wallet that received the campaign allocation.',
      });
      return;
    }

    setActionLoading('claim');
    try {
      const txHash = await claimAirdropFunds(wallet, id!);
      await refreshCampaign();
      setFeedback({
        tone: 'success',
        title: `Claimed ${userEligibility.amount.toFixed(4)} BCH successfully.`,
        description: 'The claim transaction was submitted and your campaign history has been refreshed.',
        txHash,
      });
    } catch (error: any) {
      console.error('Failed to claim airdrop:', error);
      setFeedback(buildErrorFeedback('Failed to claim airdrop.', error, 'Unable to claim airdrop'));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-textMuted font-mono">Loading campaign...</p>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8">
        <Card padding="xl" className="text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-display font-bold text-textPrimary mb-2">Campaign not found</h2>
          <p className="text-textMuted font-mono mb-6">This campaign does not exist or you don't have access.</p>
          <Button onClick={() => navigate('/airdrops')}>Back to Airdrops</Button>
        </Card>
      </div>
    );
  }

  const isCreator = String(wallet.address || '').toLowerCase() === String(campaign.creator || '').toLowerCase();
  const claimProgress = (campaign.claimed_count / campaign.total_recipients) * 100;
  const feedbackToneClasses: Record<FeedbackTone, string> = {
    success: 'border-primary/30 bg-primary/5 text-primary',
    warning: 'border-secondary/30 bg-secondary/5 text-secondary',
    error: 'border-error/30 bg-error/5 text-error',
    info: 'border-border bg-surfaceAlt text-textPrimary',
  };

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/airdrops')}
            className="inline-flex items-center gap-2 text-primary hover:text-primaryHover font-mono mb-4 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Airdrops
          </button>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl md:text-3xl lg:text-4xl xl:text-5xl font-display font-bold text-textPrimary">{campaign.title}</h1>
                <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold uppercase ${
                  campaign.campaign_type === 'AIRDROP' ? 'bg-primary/20 text-primary' :
                  campaign.campaign_type === 'BOUNTY' ? 'bg-accent/30 text-primary' :
                  campaign.campaign_type === 'REWARD' ? 'bg-primarySoft text-primary' :
                  'bg-surfaceAlt text-textPrimary border border-border'
                }`}>
                  {campaign.campaign_type}
                </span>
              </div>
              {campaign.description && (
                <p className="text-textMuted font-mono mb-2">{campaign.description}</p>
              )}
              <p className="text-sm text-textMuted font-mono">{formatLogicalId(campaign.campaign_id)}</p>
            </div>

            <div className="flex gap-3">
              {/* Fund button for creator when PENDING */}
              {isCreator && campaign.status === 'PENDING' && (
                <Button
                  variant="primary"
                  onClick={handleFund}
                  disabled={actionLoading === 'fund'}
                  className="flex items-center gap-2"
                >
                  <Wallet className="w-4 h-4" />
                  {actionLoading === 'fund' ? 'Funding...' : 'Fund Airdrop'}
                </Button>
              )}

              {/* Claim button for eligible users */}
              {!isCreator && userEligibility?.eligible && campaign.status === 'ACTIVE' && (
                <Button
                  variant="primary"
                  onClick={handleClaim}
                  disabled={actionLoading === 'claim'}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {actionLoading === 'claim' ? 'Claiming...' : `Claim ${userEligibility.amount.toFixed(4)} BCH`}
                </Button>
              )}

              {/* Pause/Cancel for creator */}
              {isCreator && (
                <>
                  {campaign.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      onClick={handlePause}
                      disabled={actionLoading === 'pause'}
                      className="flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" />
                      {actionLoading === 'pause' ? 'Pausing...' : 'Pause'}
                    </Button>
                  )}

                  {campaign.status !== 'CANCELLED' && (
                    <Button
                      variant="outline"
                      onClick={handleCancel}
                      disabled={!!actionLoading}
                      className="flex items-center gap-2 text-error border-error hover:bg-error/5"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {feedback && (
          <Card
            padding="lg"
            className={`mb-6 border ${feedbackToneClasses[feedback.tone]}`}
          >
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
                {actionLoading === 'fund' || isFundingSyncing ? (
                  <p className="mt-3 text-xs font-mono uppercase tracking-[0.18em] text-textMuted">
                    Syncing campaign status…
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        )}

        {/* Eligibility Banner */}
        {wallet.isConnected && !isCreator && campaign.status === 'ACTIVE' && (
          <Card
            padding="lg"
            className={`mb-6 ${
              userEligibility?.eligible
                ? 'bg-primary/5 border-primary'
                : userEligibility?.alreadyClaimed
                  ? 'bg-success/5 border-success'
                  : 'bg-surfaceAlt border-border'
            }`}
          >
            {userEligibility?.eligible ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-mono text-textMuted uppercase mb-1">You're Eligible!</p>
                  <p className="text-2xl md:text-3xl font-display font-bold text-primary">
                    {userEligibility.amount.toFixed(4)} BCH
                  </p>
                  <p className="text-sm font-mono text-textMuted mt-1">Click to claim your allocation</p>
                </div>
                <Button
                  variant="primary"
                  onClick={handleClaim}
                  disabled={actionLoading === 'claim'}
                  className="flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {actionLoading === 'claim' ? 'Claiming...' : 'Claim Now'}
                </Button>
              </div>
            ) : userEligibility?.alreadyClaimed ? (
              <div className="text-center">
                <Check className="w-12 h-12 text-success mx-auto mb-2" />
                <p className="text-lg font-display font-bold text-textPrimary">Claim Limit Reached</p>
                <p className="text-sm font-mono text-textMuted">
                  You have used all {Math.max(1, Number(campaign?.max_claims_per_address ?? 1))} claim{Number(campaign?.max_claims_per_address ?? 1) !== 1 ? 's' : ''} for this airdrop
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-lg font-display font-bold text-textPrimary">Not Eligible</p>
                <p className="text-sm font-mono text-textMuted">Your address is not in the recipient list for this airdrop</p>
              </div>
            )}
          </Card>
        )}

        {/* Progress Card */}
        <Card padding="lg" className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-display font-bold text-textPrimary">Claim Progress</h3>
            <span className="text-lg md:text-xl lg:text-2xl font-display font-bold text-primary">{claimProgress.toFixed(1)}%</span>
          </div>
          <div className="w-full h-4 bg-surfaceAlt rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${claimProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-sm font-mono text-textMuted">
            <span>{campaign.claimed_count} claimed</span>
            <span>{campaign.remaining_claims} remaining</span>
          </div>
        </Card>

        {/* Stats Grid */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Total Pool</span>
              <DollarSign className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {campaign.total_amount.toFixed(4)} <span className="text-lg text-textMuted">BCH</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Per Claim</span>
              <Gift className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {campaign.amount_per_claim.toFixed(4)} <span className="text-lg text-textMuted">BCH</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Total Distributed</span>
              <TrendingUp className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">
              {(campaign.claimed_count * campaign.amount_per_claim).toFixed(4)} <span className="text-lg text-textMuted">BCH</span>
            </p>
          </Card>

          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-textMuted uppercase tracking-wide">Recipients</span>
              <Users className="w-5 h-5 text-textMuted" />
            </div>
            <p className="text-xl md:text-2xl lg:text-3xl font-display font-bold text-textPrimary">{campaign.total_recipients}</p>
          </Card>
        </div>

        {/* Claim Link (for creators) */}
        {isCreator && campaign.status === 'ACTIVE' && (
          <Card padding="lg" className="mb-8">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Claim Link</h3>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-surfaceAlt rounded-lg px-4 py-3 font-mono text-sm text-textPrimary border border-border">
                {campaign.claim_link}
              </div>
              <Button
                variant="outline"
                onClick={copyClaimLink}
                className="flex items-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => window.open(campaign.claim_link, '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                Open
              </Button>
            </div>
          </Card>
        )}

        {/* Campaign Details */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Campaign Details</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Creator</span>
                <p className="text-sm font-mono text-textPrimary break-all">{campaign.creator}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Token Type</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.token_type}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Status</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.status}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Max Claims per Address</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.max_claims_per_address}</p>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Schedule</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Start Date</span>
                <p className="text-sm font-mono text-textPrimary">
                  {new Date(campaign.start_date * 1000).toLocaleDateString()}
                </p>
              </div>
              {campaign.end_date && (
                <div>
                  <span className="block text-xs font-mono text-textMuted uppercase mb-1">End Date</span>
                  <p className="text-sm font-mono text-textPrimary">
                    {new Date(campaign.end_date * 1000).toLocaleDateString()}
                  </p>
                </div>
              )}
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Require KYC</span>
                <p className="text-sm font-mono text-textPrimary">{campaign.require_kyc ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
          <Card padding="lg">
            <h3 className="text-xl font-display font-bold text-textPrimary mb-4">On-Chain Links</h3>
            <div className="space-y-3">
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Contract</span>
                <p className="text-sm font-mono text-textPrimary break-all">{campaign.contract_address || '-'}</p>
              </div>
              <div>
                <span className="block text-xs font-mono text-textMuted uppercase mb-1">Funding Transaction</span>
                {campaign.tx_hash ? (
                  <a
                    href={getExplorerTxUrl(campaign.tx_hash, network)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:text-primaryHover font-mono text-sm transition-colors"
                  >
                    {campaign.tx_hash.slice(0, 12)}...{campaign.tx_hash.slice(-10)}
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
              <p className="text-sm font-mono text-textMuted">No activity events recorded yet.</p>
            ) : (
              <div className="space-y-3 max-h-[18rem] overflow-y-auto pr-1">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border bg-surfaceAlt p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-display font-bold text-textPrimary">
                          {formatAirdropEventLabel(event.event_type)}
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
                            amount: {event.amount.toFixed(4)} BCH
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

        {/* Claim History */}
        <Card padding="lg">
          <h3 className="text-xl font-display font-bold text-textPrimary mb-4">Claim History</h3>

          {claims.length === 0 ? (
            <div className="text-center py-8">
              <Gift className="w-12 h-12 text-textMuted mx-auto mb-3" />
              <p className="text-textMuted font-mono">No claims yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Date</th>
                    <th className="text-left py-3 px-4 text-xs font-mono text-textMuted uppercase">Claimer</th>
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
                        {claim.claimer.slice(0, 10)}...{claim.claimer.slice(-8)}
                      </td>
                      <td className="py-3 px-4 font-display font-bold text-sm text-textPrimary">
                        {claim.amount.toFixed(4)} BCH
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

function formatAirdropEventLabel(eventType: string): string {
  switch (eventType) {
    case 'created':
      return 'Campaign Created';
    case 'funded':
      return 'Campaign Funded';
    case 'claim':
      return 'Claim Executed';
    case 'paused':
      return 'Campaign Paused';
    case 'cancelled':
      return 'Campaign Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}
