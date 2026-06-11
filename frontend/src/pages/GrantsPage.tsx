/**
 * GrantsPage - Listing of grant programs the wallet has created or is the
 * recipient of.
 *
 * Follows the canonical AirdropsPage/BountiesPage card-grid pattern:
 *   - wallet gate early-return
 *   - header with page title + primary Create CTA
 *   - 4-up StatsCard grid
 *   - view-mode toggle (created vs receiving)
 *   - search + status pill filters
 *   - responsive card grid with per-card stats + latest activity
 *
 * Data source: services/grantApi.ts (typed; ready for the authFetch swap).
 * The backend endpoint only takes a creator query param today, so the
 * "receiving" view performs a client-side filter on the same paginated
 * payload - fine for the typical N≈dozens scale, and trivially upgraded to a
 * dedicated endpoint when scale demands.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Plus,
  Search,
  Target,
  TrendingUp,
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
import { fetchGrants, type GrantRow, type GrantStatus, type GrantTokenType } from '../services/grantApi';

type StatusFilter = 'all' | GrantStatus;
type ViewMode = 'created' | 'receiving';

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

function formatGrantAmount(amount: number, tokenType: GrantTokenType): string {
  if (tokenType === 'BCH') {
    return `${amount.toFixed(4)} BCH`;
  }
  return `${amount.toLocaleString()} tokens`;
}

function getStatusClasses(status: GrantStatus): string {
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

/**
 * Top-level grant listing page. Renders a wallet gate, stats, filters, and a
 * responsive card grid of grants. Card clicks navigate to `/grants/:id`.
 */
export default function GrantsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('created');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadGrants = useCallback(async (): Promise<void> => {
    if (!wallet.address) {
      setLoading(false);
      setGrants([]);
      return;
    }
    try {
      setLoading(true);
      setLoadError(null);
      const result = await fetchGrants(wallet.address);
      setGrants(result.grants);
    } catch (error) {
      console.error('Failed to fetch grants:', error);
      setGrants([]);
      setLoadError(error instanceof Error ? error.message : 'Failed to load grants');
    } finally {
      setLoading(false);
    }
  }, [wallet.address]);

  useEffect(() => {
    void loadGrants();
  }, [loadGrants]);

  const scopedGrants = useMemo(() => {
    if (!wallet.address) return [];
    const me = wallet.address.toLowerCase();
    if (viewMode === 'receiving') {
      return grants.filter((g) => String(g.recipient || '').toLowerCase() === me);
    }
    return grants;
  }, [grants, viewMode, wallet.address]);

  const stats = useMemo(() => {
    const active = scopedGrants.filter((g) => g.status === 'ACTIVE').length;
    const totalLocked = scopedGrants
      .filter((g) => g.token_type === 'BCH')
      .reduce((sum, g) => sum + Number(g.total_amount || 0), 0);
    const totalReleased = scopedGrants
      .filter((g) => g.token_type === 'BCH')
      .reduce((sum, g) => sum + Number(g.total_released || 0), 0);
    const completed = scopedGrants.filter((g) => g.status === 'COMPLETED').length;
    return { active, totalLocked, totalReleased, completed };
  }, [scopedGrants]);

  const filteredGrants = useMemo(() => {
    return scopedGrants.filter((grant) => {
      if (statusFilter !== 'all' && grant.status !== statusFilter) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const haystack = [
        grant.title,
        grant.description || '',
        grant.grant_number,
        grant.creator,
        grant.recipient,
        grant.status,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [scopedGrants, searchQuery, statusFilter]);

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Award className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">Connect Your Wallet</h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage grant programs.
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
                Grants
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                {viewMode === 'created'
                  ? 'Programs you have created. Authorize milestone releases as the recipient delivers.'
                  : 'Grants where you are the recipient. Track release progress and remaining tranches.'}
              </p>
            </div>
            {viewMode === 'created' && (
              <Button size="lg" onClick={() => navigate('/grants/create')} className="shadow-lg">
                <Plus className="w-4 h-4 mr-2" />
                Create Grant
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard label="Active Grants" value={stats.active} subtitle={`${scopedGrants.length} total`} icon={Award} color="primary" />
            <StatsCard
              label="Total Locked (BCH)"
              value={`${stats.totalLocked.toFixed(4)} BCH`}
              subtitle="Across BCH grants"
              icon={DollarSign}
              color="accent"
              progress={{
                percentage: stats.totalLocked > 0 ? (stats.totalReleased / stats.totalLocked) * 100 : 0,
                label: 'Released',
              }}
            />
            <StatsCard label="Released (BCH)" value={`${stats.totalReleased.toFixed(4)} BCH`} subtitle="Sum of milestone payouts" icon={TrendingUp} color="secondary" />
            <StatsCard label="Completed" value={stats.completed} subtitle="Fully released" icon={CheckCircle2} color="muted" />
          </div>

          {/* View toggle */}
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
              variant={viewMode === 'receiving' ? 'primary' : 'outline'}
              onClick={() => setViewMode('receiving')}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Receiving
            </Button>
          </div>

          {/* Search + filters */}
          <Card className="p-4 md:p-5">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
              <div className="flex-1 relative">
                <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, grant number, creator, recipient, status..."
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
          <Card padding="xl" className="text-center border border-primary/40 bg-primary/5">
            <p className="font-display text-lg text-textPrimary mb-2">Could not load grants</p>
            <p className="text-sm font-mono text-textMuted mb-4">{loadError}</p>
            <Button variant="outline" onClick={() => void loadGrants()}>
              Retry
            </Button>
          </Card>
        ) : filteredGrants.length === 0 ? (
          <Card padding="xl" className="text-center">
            <Award className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="font-display text-lg text-textPrimary mb-2">No grants yet</p>
            <p className="text-sm font-sans text-textMuted mb-6">
              {viewMode === 'created'
                ? 'Deploy your first milestone-based grant program to fund a recipient in fixed tranches.'
                : 'No grants currently list you as the recipient.'}
            </p>
            {viewMode === 'created' && (
              <Button onClick={() => navigate('/grants/create')} className="inline-flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Create Grant
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-6">
            {filteredGrants.map((grant) => (
              <GrantCard key={grant.id} grant={grant} network={network} onOpen={() => navigate(`/grants/${grant.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GrantCardProps {
  grant: GrantRow;
  network: 'chipnet' | 'mainnet';
  onOpen: () => void;
}

function GrantCard({ grant, network, onOpen }: GrantCardProps) {
  const completed = grant.milestones_completed || 0;
  const total = grant.milestones_total || 0;
  const progress = total > 0 ? Math.min(100, (completed / total) * 100) : 0;
  const remainingMilestones = Math.max(0, total - completed);

  return (
    <Card padding="lg" hover className="group">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded-full border text-xs font-sans font-semibold bg-primary/10 text-primary border-primary/30">
              GRANT
            </span>
            <span className={`px-2.5 py-1 rounded-full border text-xs font-sans font-semibold ${getStatusClasses(grant.status)}`}>
              {grant.status}
            </span>
            {grant.transferable && (
              <span className="px-2.5 py-1 rounded-full border text-xs font-sans font-semibold bg-accent/10 text-accent border-accent/30">
                TRANSFERABLE
              </span>
            )}
          </div>
          <h3 className="font-display font-bold text-xl md:text-2xl text-textPrimary truncate">{grant.title}</h3>
          <p className="font-mono text-xs text-textMuted mt-1 truncate">{formatLogicalId(grant.grant_number)}</p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 w-10 h-10 rounded-lg border border-border flex items-center justify-center text-textSecondary group-hover:text-primary group-hover:border-primary transition-colors"
          aria-label="View grant details"
        >
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </div>

      {grant.description && <p className="text-sm font-sans text-textMuted line-clamp-2 mb-4">{grant.description}</p>}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Per Milestone" value={formatGrantAmount(grant.amount_per_milestone, grant.token_type)} />
        <Stat label="Total Locked" value={formatGrantAmount(grant.total_amount, grant.token_type)} />
        <Stat label="Released" value={formatGrantAmount(grant.total_released, grant.token_type)} tone="accent" />
        <Stat label="Milestones" value={`${completed} / ${total}`} />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs font-mono text-textMuted mb-2">
          <span>Milestone progress</span>
          <span>{progress.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-surfaceAlt overflow-hidden border border-border">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-textMuted mb-4">
        <span className="inline-flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5" />
          {remainingMilestones} remaining
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          Recipient: {formatShortAddress(grant.recipient)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" />
          Created: {formatDate(grant.created_at)}
        </span>
      </div>

      {grant.latest_event && (
        <div className="rounded-lg border border-border bg-surfaceAlt/60 p-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-textMuted font-mono mb-1">Latest Activity</p>
              <p className="text-sm font-sans text-textPrimary truncate">{formatEventLabel(grant.latest_event.event_type)}</p>
              <p className="text-xs text-textMuted font-mono inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDate(grant.latest_event.created_at)}
              </p>
            </div>
            {grant.latest_event.tx_hash && (
              <a
                href={getExplorerTxUrl(grant.latest_event.tx_hash, network)}
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
        <Button variant="outline" size="sm" onClick={onOpen} className="flex items-center gap-1.5">
          View Details
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </Card>
  );
}

interface StatProps {
  label: string;
  value: string;
  tone?: 'default' | 'accent';
}

function Stat({ label, value, tone = 'default' }: StatProps) {
  const valueClass = tone === 'accent' ? 'text-accent' : 'text-textPrimary';
  return (
    <div className="rounded-lg border border-border bg-surfaceAlt p-3">
      <p className="text-[11px] font-mono uppercase text-textMuted mb-1">{label}</p>
      <p className={`font-display font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}
