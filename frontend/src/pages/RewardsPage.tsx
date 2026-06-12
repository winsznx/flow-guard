/**
 * RewardsPage - list view for the REWARD product family.
 *
 * Modelled on AirdropsPage: wallet-gate → header with stats → filter row →
 * responsive card grid → per-card progress + latest activity. View-mode toggle
 * surfaces created campaigns today; "claimable" is parked behind the same
 * toggle for future parity once a /rewards/claimable endpoint exists.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Calendar,
  Clock,
  DollarSign,
  ExternalLink,
  Plus,
  Search,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { SkeletonStats, SkeletonTable } from '../components/ui/Skeleton';
import { StatsCard } from '../components/shared/StatsCard';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { fetchRewards } from '../services/rewardApi';
import { formatTokenAmount, tokenSymbol } from '../utils/tokenFormat';
import type {
  RewardCategory,
  RewardRow,
  RewardStatus,
} from '../services/rewardApi';

type StatusFilter = 'all' | RewardStatus;
type CategoryFilter = 'all' | RewardCategory;

const STATUS_PILLS: ReadonlyArray<StatusFilter> = ['all', 'ACTIVE', 'PAUSED', 'PENDING', 'COMPLETED', 'CANCELLED'];
const CATEGORY_PILLS: ReadonlyArray<CategoryFilter> = ['all', 'ACHIEVEMENT', 'REFERRAL', 'LOYALTY', 'CUSTOM'];

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatShortAddress(value: string): string {
  if (!value) return '';
  if (value.length <= 24) return value;
  return `${value.slice(0, 14)}…${value.slice(-10)}`;
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

function getStatusClasses(status: RewardStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'PAUSED':
      return 'bg-secondary/15 text-textPrimary border-secondary/40';
    case 'COMPLETED':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'PENDING':
      return 'bg-surfaceAlt text-textSecondary border-border';
    default:
      return 'bg-surfaceAlt text-textMuted border-border';
  }
}

function getCategoryClasses(category: RewardCategory): string {
  switch (category) {
    case 'ACHIEVEMENT':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'REFERRAL':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'LOYALTY':
      return 'bg-secondary/15 text-textPrimary border-secondary/30';
    default:
      return 'bg-surfaceAlt text-textMuted border-border';
  }
}

function progressOf(row: RewardRow): number {
  if (!row.total_pool || row.total_pool <= 0) return 0;
  return Math.min(100, (row.distributed_total / row.total_pool) * 100);
}

/**
 * Reward campaigns list page. Lazy-loaded in Phase 3.
 */
export default function RewardsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();

  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const loadRewards = useCallback(async (): Promise<void> => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const data = await fetchRewards(wallet.address);
      setRewards(data.campaigns ?? []);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[RewardsPage] Failed to load rewards:', error);
      setRewards([]);
      setLoadError(error instanceof Error ? error.message : 'Failed to load reward campaigns.');
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadRewards();
  }, [loadRewards]);

  const activeRewards = useMemo(() => rewards.filter((r) => r.status === 'ACTIVE'), [rewards]);
  const totalPool = useMemo(() => rewards.reduce((sum, r) => sum + (r.total_pool ?? 0), 0), [rewards]);
  const totalDistributed = useMemo(
    () => rewards.reduce((sum, r) => sum + (r.distributed_total ?? 0), 0),
    [rewards],
  );
  const totalRecipients = useMemo(
    () => rewards.reduce((sum, r) => sum + (r.distributed_count ?? 0), 0),
    [rewards],
  );

  const filteredRewards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rewards.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && row.reward_category !== categoryFilter) return false;
      if (q.length === 0) return true;
      const haystack = [
        row.title,
        row.description ?? '',
        row.campaign_id ?? '',
        row.creator ?? '',
        row.status,
        row.reward_category,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rewards, categoryFilter, searchQuery, statusFilter]);

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <Trophy className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage your reward campaigns.
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
                Rewards
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Manage variable-amount reward programs for achievements, referrals, loyalty, and
                custom incentives.
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => navigate('/rewards/create')}
              className="shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Reward
            </Button>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Rewards"
              value={activeRewards.length}
              subtitle={`${rewards.length} total`}
              icon={Trophy}
              color="primary"
            />
            <StatsCard
              label="Total Distributed"
              value={totalDistributed.toFixed(4)}
              subtitle="Across all campaigns (mixed tokens)"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: totalPool > 0 ? (totalDistributed / totalPool) * 100 : 0,
                label: 'of pool',
              }}
            />
            <StatsCard
              label="Recipients"
              value={totalRecipients}
              subtitle="Unique distributions"
              icon={Users}
              color="secondary"
            />
            <StatsCard
              label="Total Pool"
              value={totalPool.toFixed(4)}
              subtitle="All campaigns (mixed tokens)"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* Filters */}
          <Card className="p-4 md:p-5">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, campaign ID, creator, category..."
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_PILLS.map((status) => {
                  const active = statusFilter === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setStatusFilter(status)}
                      className={`min-h-[36px] px-3 py-2 rounded-md text-xs font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 ${
                        active
                          ? 'bg-primary text-white shadow-sm'
                          : 'bg-surface text-textPrimary hover:bg-surfaceAlt border border-border'
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_PILLS.map((category) => {
                  const active = categoryFilter === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setCategoryFilter(category)}
                      className={`min-h-[36px] px-3 py-2 rounded-md text-xs font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
                        active
                          ? 'bg-accent text-white shadow-sm'
                          : 'bg-surface text-textPrimary hover:bg-surfaceAlt border border-border'
                      }`}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
        </div>

        {/* Body */}
        {loading ? (
          <div className="space-y-6">
            <SkeletonStats count={4} />
            <SkeletonTable rows={4} columns={4} />
          </div>
        ) : loadError ? (
          <Card padding="xl" className="text-center border-error/30 bg-error/5">
            <p className="font-display text-lg text-textPrimary mb-2">Failed to load rewards</p>
            <p className="text-sm font-mono text-textMuted mb-4">{loadError}</p>
            <Button variant="outline" onClick={() => void loadRewards()}>
              Retry
            </Button>
          </Card>
        ) : filteredRewards.length === 0 ? (
          <Card padding="xl" className="text-center">
            <Trophy className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="font-display text-lg text-textPrimary mb-2">No reward campaigns found</p>
            <p className="text-sm font-sans text-textMuted mb-6">
              Launch your first reward program to incentivize contributions, referrals, or loyalty.
            </p>
            <Button onClick={() => navigate('/rewards/create')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Reward
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredRewards.map((row) => {
              const progress = progressOf(row);
              const remaining = Math.max(0, (row.total_pool ?? 0) - (row.distributed_total ?? 0));

              return (
                <Card key={row.id} padding="lg" hover className="group">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getCategoryClasses(
                            row.reward_category,
                          )}`}
                        >
                          {row.reward_category}
                        </span>
                        <span
                          className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getStatusClasses(
                            row.status,
                          )}`}
                        >
                          {row.status}
                        </span>
                        <span className="px-2.5 py-1 rounded-full border border-border text-xs font-mono text-textMuted">
                          {tokenSymbol(row.token_type, row.token_category)}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-xl md:text-2xl text-textPrimary truncate">
                        {row.title}
                      </h3>
                      <p className="font-mono text-xs text-textMuted mt-1 truncate">
                        {formatLogicalId(row.campaign_id)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/rewards/${row.id}`)}
                      className="shrink-0 w-10 h-10 rounded-lg border border-border flex items-center justify-center text-textSecondary group-hover:text-primary group-hover:border-primary transition-colors"
                      aria-label="View reward details"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>

                  {row.description && (
                    <p className="text-sm font-sans text-textMuted line-clamp-2 mb-4">
                      {row.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Total Pool</p>
                      <p className="font-display font-bold text-textPrimary">
                        {formatTokenAmount(row.total_pool ?? 0, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Max Reward</p>
                      <p className="font-display font-bold text-textPrimary">
                        {formatTokenAmount(row.max_reward_amount ?? 0, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Distributed</p>
                      <p className="font-display font-bold text-accent">
                        {formatTokenAmount(row.distributed_total ?? 0, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Remaining</p>
                      <p className="font-display font-bold text-textPrimary">
                        {formatTokenAmount(remaining, row.token_type, row.token_category, { noSuffix: true })} {tokenSymbol(row.token_type, row.token_category)}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs font-mono text-textMuted mb-2">
                      <span>Pool Drawdown</span>
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
                      {row.distributed_count ?? 0} paid out
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Created: {formatDate(row.created_at)}
                    </span>
                    {row.end_date ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Ends: {formatDate(row.end_date)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        No expiry
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] font-mono uppercase text-textMuted mb-3">
                    Creator: {formatShortAddress(row.creator)}
                  </p>

                  {row.latest_event && (
                    <div className="rounded-lg border border-border bg-surfaceAlt/60 p-3 mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-textMuted font-mono mb-1">
                            Latest Activity
                          </p>
                          <p className="text-sm font-sans text-textPrimary truncate">
                            {formatEventLabel(row.latest_event.event_type)}
                          </p>
                          <p className="text-xs text-textMuted font-mono">
                            {formatDate(row.latest_event.created_at)}
                          </p>
                        </div>
                        {row.latest_event.tx_hash && (
                          <a
                            href={getExplorerTxUrl(row.latest_event.tx_hash, network)}
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
                      onClick={() => navigate(`/rewards/${row.id}`)}
                      className="flex items-center gap-1.5"
                    >
                      View Details
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Button>
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
