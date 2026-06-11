/**
 * AirdropsPage - Campaign-centric Explorer Listing
 * Rich card view with filters and quick campaign insights
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Gift,
  Plus,
  Users,
  DollarSign,
  TrendingUp,
  Search,
  Calendar,
  Clock,
  Copy,
  Check,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { SkeletonTable } from '../components/ui/Skeleton';
import { StatsCard } from '../components/shared/StatsCard';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';

type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'EXPIRED';
type CampaignType = 'AIRDROP' | 'BOUNTY' | 'REWARD' | 'GRANT';

interface AirdropCampaign {
  id: string;
  campaign_id: string;
  creator: string;
  title: string;
  description?: string;
  campaign_type: CampaignType;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  amount_per_claim: number;
  total_recipients: number;
  claimed_count: number;
  remaining_claims: number;
  claim_link: string;
  start_date: number;
  end_date?: number;
  status: CampaignStatus;
  require_kyc: boolean;
  max_claims_per_address?: number;
  created_at: number;
  latest_event?: {
    event_type: string;
    status?: string | null;
    tx_hash?: string | null;
    created_at: number;
  } | null;
}

export default function AirdropsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<AirdropCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'created' | 'claimable'>('created');
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | CampaignType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCampaignId, setCopiedCampaignId] = useState<string | null>(null);
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  useEffect(() => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }

    const fetchCampaigns = async () => {
      try {
        setLoading(true);
        const endpoint =
          viewMode === 'created'
            ? `/api/airdrops?creator=${wallet.address}`
            : `/api/airdrops/claimable?address=${wallet.address}`;

        const response = await fetch(endpoint);
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      } catch (error) {
        console.error('Failed to fetch campaigns:', error);
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaigns();
  }, [wallet.address, viewMode]);

  // Calculate stats
  const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
  const totalDistributed = campaigns.reduce(
    (sum, c) => sum + c.claimed_count * c.amount_per_claim,
    0
  );
  const totalRecipients = campaigns.reduce((sum, c) => sum + c.claimed_count, 0);
  const totalValue = campaigns.reduce((sum, c) => sum + c.total_amount, 0);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((campaign) => {
      if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
      if (typeFilter !== 'all' && campaign.campaign_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const haystack = [
          campaign.title,
          campaign.description || '',
          campaign.campaign_id,
          campaign.creator,
          campaign.status,
          campaign.campaign_type,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [campaigns, searchQuery, statusFilter, typeFilter]);

  const formatDate = (timestamp: number) =>
    new Date(timestamp * 1000).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });

  const formatShortAddress = (value: string) =>
    `${value.slice(0, 14)}...${value.slice(-10)}`;

  const formatEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return 'Campaign Created';
      case 'funded':
        return 'Campaign Funded';
      case 'claim':
        return 'Claim Processed';
      case 'paused':
        return 'Campaign Paused';
      case 'resumed':
        return 'Campaign Resumed';
      case 'cancelled':
        return 'Campaign Cancelled';
      default:
        return eventType
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  };

  const getProgress = (campaign: AirdropCampaign) => {
    if (campaign.total_recipients <= 0) return 0;
    return Math.min(100, (campaign.claimed_count / campaign.total_recipients) * 100);
  };

  const getCampaignTypeClasses = (campaignType: CampaignType) => {
    switch (campaignType) {
      case 'AIRDROP':
        return 'bg-primary/10 text-primary border-primary/30';
      case 'BOUNTY':
        return 'bg-accent/10 text-accent border-accent/30';
      case 'REWARD':
        return 'bg-secondary/15 text-textPrimary border-secondary/30';
      default:
        return 'bg-surfaceAlt text-textMuted border-border';
    }
  };

  const getStatusClasses = (status: CampaignStatus) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-accent/10 text-accent border-accent/30';
      case 'PAUSED':
        return 'bg-secondary/15 text-textPrimary border-secondary/40';
      case 'COMPLETED':
        return 'bg-primary/10 text-primary border-primary/30';
      default:
        return 'bg-surfaceAlt text-textMuted border-border';
    }
  };

  const copyClaimLink = async (campaign: AirdropCampaign) => {
    if (!campaign.claim_link) return;
    await navigator.clipboard.writeText(campaign.claim_link);
    setCopiedCampaignId(campaign.id);
    window.setTimeout(() => setCopiedCampaignId(null), 1800);
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Gift className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage airdrop campaigns.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Airdrops
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                {viewMode === 'created'
                  ? 'Manage mass distribution campaigns and track claim progress'
                  : 'Discover and claim available airdrops'}
              </p>
            </div>
            {viewMode === 'created' && (
              <Button
                size="lg"
                onClick={() => navigate('/airdrops/create')}
                className="shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Campaign
              </Button>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Campaigns"
              value={activeCampaigns.length}
              subtitle={`${campaigns.length} total`}
              icon={Gift}
              color="primary"
            />
            <StatsCard
              label="Total Distributed"
              value={`${totalDistributed.toFixed(4)} BCH`}
              subtitle="Across all campaigns"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: totalValue > 0 ? (totalDistributed / totalValue) * 100 : 0,
                label: 'Distributed',
              }}
            />
            <StatsCard
              label="Total Claimants"
              value={totalRecipients}
              subtitle="Unique claims"
              icon={Users}
              color="secondary"
            />
            <StatsCard
              label="Total Value"
              value={`${totalValue.toFixed(4)} BCH`}
              subtitle="All campaigns"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* View Mode Toggle */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              variant={viewMode === 'created' ? 'primary' : 'outline'}
              onClick={() => setViewMode('created')}
              className="flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              Created
            </Button>
            <Button
              variant={viewMode === 'claimable' ? 'primary' : 'outline'}
              onClick={() => setViewMode('claimable')}
              className="flex items-center gap-2"
            >
              <Gift className="w-4 h-4" />
              Claimable
            </Button>
          </div>

          {/* Search + Filters */}
          <Card className="p-4 md:p-5">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, campaign ID, creator, status..."
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'ACTIVE', 'PAUSED', 'COMPLETED', 'EXPIRED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                      statusFilter === status
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {(['all', 'AIRDROP', 'BOUNTY', 'REWARD', 'GRANT'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setTypeFilter(type)}
                    className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                      typeFilter === type
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="text-center py-12">
            <SkeletonTable rows={6} columns={5} />
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <Card padding="xl" className="text-center">
            <Gift className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="font-display text-lg text-textPrimary mb-2">No campaigns found</p>
            <p className="text-sm font-sans text-textMuted">
              Adjust filters or create a new campaign to populate this view.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredCampaigns.map((campaign) => {
              const progress = getProgress(campaign);
              const distributed = campaign.claimed_count * campaign.amount_per_claim;

              return (
                <Card
                  key={campaign.id}
                  padding="lg"
                  hover
                  className="group"
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getCampaignTypeClasses(campaign.campaign_type)}`}>
                          {campaign.campaign_type}
                        </span>
                        <span className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getStatusClasses(campaign.status)}`}>
                          {campaign.status}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-xl md:text-2xl text-textPrimary truncate">
                        {campaign.title}
                      </h3>
                      <p className="font-mono text-xs text-textMuted mt-1 truncate">
                        {formatLogicalId(campaign.campaign_id)}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`/airdrops/${campaign.id}`)}
                      className="shrink-0 w-10 h-10 rounded-lg border border-border flex items-center justify-center text-textSecondary group-hover:text-primary group-hover:border-primary transition-colors"
                      aria-label="View campaign details"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>

                  {campaign.description && (
                    <p className="text-sm font-sans text-textMuted line-clamp-2 mb-4">
                      {campaign.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Total Pool</p>
                      <p className="font-display font-bold text-textPrimary">
                        {campaign.total_amount.toFixed(4)} {campaign.token_type}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Per Claim</p>
                      <p className="font-display font-bold text-textPrimary">
                        {campaign.amount_per_claim.toFixed(4)} {campaign.token_type}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Claimed</p>
                      <p className="font-display font-bold text-accent">
                        {distributed.toFixed(4)} {campaign.token_type}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Recipients</p>
                      <p className="font-display font-bold text-textPrimary">
                        {campaign.claimed_count} / {campaign.total_recipients}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs font-mono text-textMuted mb-2">
                      <span>Claim Progress</span>
                      <span>{progress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surfaceAlt overflow-hidden border border-border">
                      <div
                        className="h-full bg-accent transition-all duration-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-textMuted mb-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Creator: {formatShortAddress(campaign.creator)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Created: {formatDate(campaign.created_at)}
                    </span>
                    {campaign.end_date ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Ends: {formatDate(campaign.end_date)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        No expiry
                      </span>
                    )}
                  </div>

                  {campaign.latest_event && (
                    <div className="rounded-lg border border-border bg-surfaceAlt/60 p-3 mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-textMuted font-mono mb-1">
                            Latest Activity
                          </p>
                          <p className="text-sm font-sans text-textPrimary truncate">
                            {formatEventLabel(campaign.latest_event.event_type)}
                          </p>
                          <p className="text-xs text-textMuted font-mono">
                            {formatDate(campaign.latest_event.created_at)}
                          </p>
                        </div>
                        {campaign.latest_event.tx_hash && (
                          <a
                            href={getExplorerTxUrl(campaign.latest_event.tx_hash, network)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primaryHover"
                          >
                            View Tx
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/airdrops/${campaign.id}`)}
                      className="flex items-center gap-1.5"
                    >
                      View Details
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
                    {viewMode === 'created' && campaign.claim_link && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyClaimLink(campaign)}
                        className="flex items-center gap-1.5"
                      >
                        {copiedCampaignId === campaign.id ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
