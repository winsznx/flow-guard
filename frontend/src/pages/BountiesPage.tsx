/**
 * BountiesPage
 *
 * Campaign-centric listing of bounties created by the connected wallet.
 * Follows the canonical AirdropsPage card-grid pattern (header + StatsCard
 * grid + search + pill filter + responsive card grid). View modes:
 *   - "Created" (default): bounties whose creator === wallet.address.
 *   - "Open": bounties the wallet has not been gated out of yet - for now this
 *     is a placeholder filter that surfaces only ACTIVE bounties so creators
 *     can quickly see what's live for participants.
 *
 * Data source: services/bountyApi.ts (typed; ready for the authFetch swap).
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
  Target,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { SkeletonStats, SkeletonTable } from '../components/ui/Skeleton';
import { StatsCard } from '../components/shared/StatsCard';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { fetchBounties, type BountyRow, type BountyStatus } from '../services/bountyApi';

type StatusFilter = 'all' | BountyStatus;
type ViewMode = 'created' | 'open';

const STATUS_OPTIONS: readonly StatusFilter[] = ['all', 'PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

function formatShortAddress(value: string): string {
  if (!value) return '';
  if (value.length <= 26) return value;
  return `${value.slice(0, 14)}...${value.slice(-10)}`;
}

function formatBountyAmount(amount: number, tokenType: BountyRow['token_type']): string {
  if (tokenType === 'BCH') {
    return `${amount.toFixed(4)} BCH`;
  }
  return `${amount.toLocaleString()} tokens`;
}

function getStatusClasses(status: BountyStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-accent/10 text-accent border-accent/30';
    case 'PENDING':
      return 'bg-secondary/15 text-textPrimary border-secondary/40';
    case 'PAUSED':
      return 'bg-secondary/15 text-textPrimary border-secondary/40';
    case 'COMPLETED':
      return 'bg-primary/10 text-primary border-primary/30';
    case 'CANCELLED':
    default:
      return 'bg-surfaceAlt text-textMuted border-border';
  }
}

function formatEventLabel(eventType: string): string {
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

/**
 * List page for bounties created by the connected wallet.
 */
export default function BountiesPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();

  const [bounties, setBounties] = useState<BountyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('created');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const loadBounties = useCallback(async (): Promise<void> => {
    if (!wallet.address) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const result = await fetchBounties(wallet.address);
      setBounties(result.campaigns);
    } catch (error) {
      console.error('Failed to fetch bounties:', error);
      setBounties([]);
      setLoadError(error instanceof Error ? error.message : 'Failed to load bounties');
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadBounties();
  }, [loadBounties]);

  const activeCount = useMemo(() => bounties.filter((b) => b.status === 'ACTIVE').length, [bounties]);
  const totalPoolBch = useMemo(
    () =>
      bounties
        .filter((b) => b.token_type === 'BCH')
        .reduce((sum, b) => sum + b.reward_per_winner * b.max_winners, 0),
    [bounties],
  );
  const totalPaidBch = useMemo(
    () => bounties.filter((b) => b.token_type === 'BCH').reduce((sum, b) => sum + b.total_paid, 0),
    [bounties],
  );
  const totalWinners = useMemo(() => bounties.reduce((sum, b) => sum + b.winners_count, 0), [bounties]);

  const filteredBounties = useMemo(() => {
    return bounties.filter((bounty) => {
      if (viewMode === 'open' && bounty.status !== 'ACTIVE') return false;
      if (statusFilter !== 'all' && bounty.status !== statusFilter) return false;

      if (searchQuery.trim()) {
        const haystack = [
          bounty.title,
          bounty.description ?? '',
          bounty.campaign_id,
          bounty.creator,
          bounty.status,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [bounties, searchQuery, statusFilter, viewMode]);

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Trophy className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">Connect Your Wallet</h2>
          <p className="text-textMuted font-sans mb-6">
            Connect a wallet to view and manage your on-chain bounty campaigns.
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
                Bounties
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Lock a fixed prize pool on-chain and pay the first N winners a fixed reward each.
              </p>
            </div>
            <Button size="lg" onClick={() => navigate('/bounties/create')} className="shadow-lg">
              <Plus className="w-4 h-4 mr-2" />
              Create Bounty
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Bounties"
              value={activeCount}
              subtitle={`${bounties.length} total`}
              icon={Trophy}
              color="primary"
            />
            <StatsCard
              label="Total Pool (BCH)"
              value={`${totalPoolBch.toFixed(4)} BCH`}
              subtitle="BCH-denominated bounties"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: totalPoolBch > 0 ? (totalPaidBch / totalPoolBch) * 100 : 0,
                label: 'Paid',
              }}
            />
            <StatsCard
              label="Winners Paid"
              value={totalWinners}
              subtitle="Across all bounties"
              icon={Users}
              color="secondary"
            />
            <StatsCard
              label="Distributed (BCH)"
              value={`${totalPaidBch.toFixed(4)} BCH`}
              subtitle="Sum of paid prizes"
              icon={TrendingUp}
              color="muted"
            />
          </div>

          {/* View toggle */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Button
              variant={viewMode === 'created' ? 'primary' : 'outline'}
              onClick={() => setViewMode('created')}
              className="flex items-center gap-2"
            >
              <Target className="w-4 h-4" />
              Created
            </Button>
            <Button
              variant={viewMode === 'open' ? 'primary' : 'outline'}
              onClick={() => setViewMode('open')}
              className="flex items-center gap-2"
            >
              <Trophy className="w-4 h-4" />
              Open
            </Button>
          </div>

          {/* Search + filters */}
          <Card className="p-4 md:p-5">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by title, bounty ID, creator, status..."
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((status) => {
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
          <Card padding="xl" className="text-center">
            <Trophy className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="font-display text-lg text-textPrimary mb-2">Could not load bounties</p>
            <p className="text-sm font-sans text-textMuted mb-4">{loadError}</p>
            <Button variant="outline" onClick={() => void loadBounties()}>
              Try again
            </Button>
          </Card>
        ) : filteredBounties.length === 0 ? (
          <Card padding="xl" className="text-center">
            <Trophy className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="font-display text-lg text-textPrimary mb-2">No bounties found</p>
            <p className="text-sm font-sans text-textMuted mb-4">
              {bounties.length === 0
                ? 'Deploy your first bounty to lock a prize pool on-chain.'
                : 'Adjust filters or create a new bounty.'}
            </p>
            <Button onClick={() => navigate('/bounties/create')}>
              <Plus className="w-4 h-4 mr-2" />
              Create Bounty
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredBounties.map((bounty) => {
              const progress =
                bounty.max_winners > 0 ? Math.min(100, (bounty.winners_count / bounty.max_winners) * 100) : 0;
              const totalPool = bounty.reward_per_winner * bounty.max_winners;

              return (
                <Card key={bounty.id} padding="lg" hover className="group">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span
                          className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getStatusClasses(
                            bounty.status,
                          )}`}
                        >
                          {bounty.status}
                        </span>
                        <span className="px-2.5 py-1 rounded-full border text-xs font-sans font-semibold bg-accent/10 text-accent border-accent/30">
                          BOUNTY
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-xl md:text-2xl text-textPrimary truncate">
                        {bounty.title}
                      </h3>
                      <p className="font-mono text-xs text-textMuted mt-1 truncate">
                        {formatLogicalId(bounty.campaign_id)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/bounties/${bounty.id}`)}
                      className="shrink-0 w-10 h-10 rounded-lg border border-border flex items-center justify-center text-textSecondary group-hover:text-primary group-hover:border-primary transition-colors"
                      aria-label="View bounty details"
                    >
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                  </div>

                  {bounty.description && (
                    <p className="text-sm font-sans text-textMuted line-clamp-2 mb-4">{bounty.description}</p>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Reward</p>
                      <p className="font-display font-bold text-textPrimary">
                        {formatBountyAmount(bounty.reward_per_winner, bounty.token_type)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Total Pool</p>
                      <p className="font-display font-bold text-textPrimary">
                        {formatBountyAmount(totalPool, bounty.token_type)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Paid</p>
                      <p className="font-display font-bold text-accent">
                        {formatBountyAmount(bounty.total_paid, bounty.token_type)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
                      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">Winners</p>
                      <p className="font-display font-bold text-textPrimary">
                        {bounty.winners_count} / {bounty.max_winners}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center justify-between text-xs font-mono text-textMuted mb-2">
                      <span>Payout Progress</span>
                      <span>{progress.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surfaceAlt overflow-hidden border border-border">
                      <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-textMuted mb-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      Creator: {formatShortAddress(bounty.creator)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Created: {formatDate(bounty.created_at)}
                    </span>
                    {bounty.end_date ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Ends: {formatDate(bounty.end_date)}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        No deadline
                      </span>
                    )}
                  </div>

                  {bounty.latest_event && (
                    <div className="rounded-lg border border-border bg-surfaceAlt/60 p-3 mb-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] uppercase tracking-wide text-textMuted font-mono mb-1">
                            Latest Activity
                          </p>
                          <p className="text-sm font-sans text-textPrimary truncate">
                            {formatEventLabel(bounty.latest_event.event_type)}
                          </p>
                          <p className="text-xs text-textMuted font-mono">
                            {formatDate(bounty.latest_event.created_at)}
                          </p>
                        </div>
                        {bounty.latest_event.tx_hash && (
                          <a
                            href={getExplorerTxUrl(bounty.latest_event.tx_hash, network)}
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
                      onClick={() => navigate(`/bounties/${bounty.id}`)}
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
