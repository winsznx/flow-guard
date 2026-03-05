/**
 * StreamsPage - Professional Stream Management
 * Sablier-quality with DataTable, circular progress, CSV import/export
 */

import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TrendingUp, Plus, Inbox, Send, Clock, Zap, ExternalLink, Sparkles } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { useWalletModal } from '../hooks/useWalletModal';
import { Button } from '../components/ui/Button';
import { DataTable, Column } from '../components/shared/DataTable';
import { StatsCard } from '../components/shared/StatsCard';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { Card } from '../components/ui/Card';
import { readDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import { getStreamScheduleTemplateLabel } from '../utils/streamShapes';

type RoleView = 'recipient' | 'sender' | 'all';

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface Stream {
  id: string;
  stream_id: string;
  vault_id?: string | null;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string;
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
  stream_type: string;
  start_time: number;
  end_time?: number;
  interval_seconds?: number;
  amount_per_interval?: number;
  step_amount?: number;
  schedule_count?: number;
  cliff_timestamp?: number;
  schedule_template?: string;
  launch_source?: string;
  launch_title?: string;
  launch_description?: string;
  preferred_lane?: string;
  launch_context?: StreamLaunchContext;
  refillable?: boolean;
  status: string;
  created_at: number;
  tx_hash?: string | null;
  latest_event?: {
    event_type: string;
    status?: string | null;
    tx_hash?: string | null;
    created_at: number;
  } | null;
}

interface StreamActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  stream: {
    stream_id: string;
    vault_id?: string | null;
    sender: string;
    recipient: string;
    stream_type: string;
    schedule_template?: string | null;
    launch_context?: StreamLaunchContext | null;
  };
}

function formatAssetAmount(amount: number, tokenType: 'BCH' | 'CASHTOKENS') {
  return `${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: tokenType === 'BCH' ? 8 : 0,
  })} ${tokenType === 'BCH' ? 'BCH' : 'tokens'}`;
}

function formatScheduleMeta(stream: Stream) {
  if (stream.stream_type === 'LINEAR') {
    return stream.cliff_timestamp
      ? 'Continuous unlock after cliff'
      : 'Continuous unlock';
  }

  if (stream.stream_type === 'HYBRID') {
    return stream.schedule_template
      ? getStreamScheduleTemplateLabel(stream.schedule_template) || 'Upfront unlock + linear vesting'
      : 'Upfront unlock followed by linear vesting';
  }

  const intervalDays = stream.interval_seconds ? Math.round(stream.interval_seconds / 86400) : null;
  if (stream.stream_type === 'RECURRING') {
    return intervalDays && stream.amount_per_interval !== undefined
      ? `${formatAssetAmount(stream.amount_per_interval, stream.token_type)} every ${intervalDays}d${stream.refillable ? ' • refillable' : ''}`
      : 'Fixed recurring payouts';
  }

  if (stream.stream_type === 'TRANCHE') {
    return stream.schedule_count
      ? `${stream.schedule_count} custom unlock${stream.schedule_count === 1 ? '' : 's'}`
      : 'Custom tranche unlocks';
  }

  return intervalDays && stream.step_amount !== undefined
    ? `${formatAssetAmount(stream.step_amount, stream.token_type)} every ${intervalDays}d`
    : 'Milestone unlocks';
}

export default function StreamsPage() {
  const wallet = useWallet();
  const { openModal } = useWalletModal();
  const navigate = useNavigate();
  const location = useLocation();
  const launchState = location.state as { daoContext?: DaoLaunchContext } | null;
  const daoContext = launchState?.daoContext || readDaoLaunchContext();
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activity, setActivity] = useState<StreamActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleView, setRoleView] = useState<RoleView>('recipient');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [page, setPage] = useState(1);
  const [totalStreams, setTotalStreams] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const formatEventLabel = (eventType: string) => {
    switch (eventType) {
      case 'created':
        return 'Stream Created';
      case 'funded':
        return 'Stream Funded';
      case 'claim':
        return 'Claim Processed';
      case 'paused':
        return 'Stream Paused';
      case 'resumed':
        return 'Stream Resumed';
      case 'refilled':
        return 'Runway Refilled';
      case 'cancelled':
        return 'Stream Cancelled';
      default:
        return eventType
          .split('_')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
    }
  };

  useEffect(() => {
    const userAddress = wallet.address;
    if (!userAddress) {
      setLoading(false);
      setActivity([]);
      return;
    }

    const fetchStreams = async () => {
      try {
        setLoading(true);

        let queryParams = '';
        if (roleView === 'recipient') {
          queryParams = `recipient=${userAddress}`;
        } else if (roleView === 'sender') {
          queryParams = `sender=${userAddress}`;
        } else {
          queryParams = `address=${userAddress}`;
        }

        const params = new URLSearchParams(queryParams);
        if (daoContext?.source) {
          params.set('contextSource', daoContext.source);
          params.set('treasury', 'true');
        }
        params.set('page', String(page));
        params.set('limit', '20');

        const response = await fetch(`/api/streams?${params.toString()}`);
        const data = await response.json();
        setStreams(data.streams || []);
        setTotalStreams(Number(data.total || 0));
        setTotalPages(Math.max(1, Number(data.totalPages || 1)));

        const activityParams = new URLSearchParams();
        activityParams.set('address', userAddress);
        activityParams.set('limit', '8');
        if (daoContext?.source) {
          activityParams.set('contextSource', daoContext.source);
          activityParams.set('treasury', 'true');
        }

        const activityResponse = await fetch(`/api/streams/activity?${activityParams.toString()}`);
        const activityData = await activityResponse.json().catch(() => ({ events: [] }));
        setActivity(activityData.events || []);
      } catch (error) {
        console.error('Failed to fetch streams:', error);
        setStreams([]);
        setActivity([]);
      } finally {
        setLoading(false);
      }
    };

    fetchStreams();
  }, [wallet.address, roleView, daoContext?.source, page]);

  useEffect(() => {
    setPage(1);
  }, [wallet.address, roleView, daoContext?.source]);

  // Calculate totals
  const bchStreams = streams.filter((stream) => stream.token_type === 'BCH');
  const tokenStreams = streams.filter((stream) => stream.token_type === 'CASHTOKENS');
  const totalClaimableBch = bchStreams
    .filter((stream) => stream.status === 'ACTIVE')
    .reduce((sum, stream) => sum + stream.claimable_amount, 0);
  const totalVestedBch = bchStreams.reduce((sum, stream) => sum + stream.vested_amount, 0);
  const totalWithdrawnBch = bchStreams.reduce((sum, stream) => sum + stream.withdrawn_amount, 0);
  const totalValueBch = bchStreams.reduce((sum, stream) => sum + stream.total_amount, 0);

  // Filter streams by status
  const filteredStreams = streams.filter(stream => {
    if (filter === 'active' && stream.status !== 'ACTIVE') return false;
    if (filter === 'completed' && stream.status !== 'COMPLETED') return false;
    return true;
  });

  // Table columns
  const columns: Column<Stream>[] = [
    {
      key: 'stream_id',
      label: 'Stream ID',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatLogicalId(row.stream_id)}</p>
          <p className="text-xs text-textMuted font-mono">{row.stream_type}</p>
          {row.schedule_template && (
            <p className="text-xs text-textSecondary font-mono mt-1">
              {getStreamScheduleTemplateLabel(row.schedule_template) || row.schedule_template}
            </p>
          )}
          {row.launch_context?.preferredLane && (
            <p className="text-xs text-textMuted font-mono mt-1">
              Lane • {row.launch_context.preferredLane}
            </p>
          )}
          {row.vault_id && (
            <p className="text-xs text-primary font-mono mt-1">
              Treasury-backed • {row.vault_id}
            </p>
          )}
          <p className="text-xs text-textMuted font-mono mt-1">{formatScheduleMeta(row)}</p>
        </div>
      ),
    },
    {
      key: 'sender',
      label: 'Sender',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.sender.slice(0, 15)}...{row.sender.slice(-10)}
        </p>
      ),
    },
    {
      key: 'recipient',
      label: 'Recipient',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.recipient.slice(0, 15)}...{row.recipient.slice(-10)}
        </p>
      ),
    },
    {
      key: 'total_amount',
      label: 'Total Amount',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary">
          {formatAssetAmount(row.total_amount, row.token_type)}
        </p>
      ),
    },
    {
      key: 'progress_percentage',
      label: 'Progress',
      sortable: true,
      className: 'text-center',
      render: (row) => (
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-surfaceAlt rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${row.progress_percentage}%` }}
            />
          </div>
          <span className="text-xs font-mono text-textMuted w-12">
            {row.progress_percentage.toFixed(0)}%
          </span>
        </div>
      ),
    },
    {
      key: 'claimable_amount',
      label: 'Claimable',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-accent">
          {formatAssetAmount(row.claimable_amount, row.token_type)}
        </p>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      className: 'text-center',
      render: (row) => {
        const statusColors = {
          PENDING: 'bg-primary/10 text-primary border-primary',
          ACTIVE: 'bg-accent/10 text-accent border-accent',
          COMPLETED: 'bg-primary/10 text-primary border-primary',
          PAUSED: 'bg-secondary/10 text-secondary border-secondary',
          FAILED: 'bg-red-500/10 text-red-300 border-red-500/30',
          CANCELLED: 'bg-surfaceAlt text-textMuted border-border',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border ${
              statusColors[row.status as keyof typeof statusColors] || statusColors.CANCELLED
            }`}
          >
            {row.status}
          </span>
        );
      },
    },
    {
      key: 'latest_event',
      label: 'Latest Activity',
      render: (row) => {
        if (!row.latest_event) {
          return <span className="text-xs text-textMuted font-sans">No events</span>;
        }

        const latestTxHash = row.latest_event.tx_hash || row.tx_hash;
        return (
          <div className="space-y-1">
            <p className="text-sm font-sans text-textPrimary">
              {formatEventLabel(row.latest_event.event_type)}
            </p>
            <p className="text-xs text-textMuted font-mono">
              {new Date(row.latest_event.created_at * 1000).toLocaleString()}
            </p>
            {latestTxHash && (
              <a
                href={getExplorerTxUrl(latestTxHash, network)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium"
              >
                View Tx
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        );
      },
    },
  ];

  const handleImport = (data: any[]) => {
    // CSV import - could prefill a batch create form
    console.log('Imported streams:', data);
    // Navigate to batch create with prefilled data
    navigate('/streams/batch-create', {
      state: {
        importedData: data,
        ...(daoContext ? { daoContext } : {}),
      },
    });
  };

  const buildRowDaoContext = (stream: Stream): DaoLaunchContext | undefined => {
    if (daoContext) return daoContext;
    if (!stream.launch_context) return undefined;
    return {
      source: stream.launch_context.source,
      title: stream.launch_context.title || 'Organization stream workflow',
      description:
        stream.launch_context.description ||
        'This stream was launched from an organization workspace and should remain tied to treasury workflow navigation.',
      preferredLane: stream.launch_context.preferredLane,
    };
  };

  if (!wallet.isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <Inbox className="w-16 h-16 text-textMuted mx-auto mb-4" />
          <h2 className="text-2xl font-display font-bold text-textPrimary mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-textMuted font-sans mb-6">
            Please connect your wallet to view and manage your streams.
          </p>
          <Button onClick={openModal}>Connect Wallet</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        {daoContext && (
          <Card className="mb-6 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  Organization workspace
                </p>
                <h2 className="font-display text-2xl text-textPrimary mb-2">
                  {daoContext.title}
                </h2>
                <p className="max-w-3xl text-textSecondary">
                  {daoContext.description}
                </p>
              </div>
              <Button variant="outline" onClick={() => navigate('/app/dao')}>
                Return to Organization Workspace
              </Button>
            </div>
          </Card>
        )}

        {daoContext && activity.length > 0 && (
          <Card className="mb-6 p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">
                  Organization stream activity
                </p>
                <h2 className="font-display text-2xl text-textPrimary">
                  Recent treasury workflow
                </h2>
                <p className="text-sm text-textSecondary mt-1">
                  These events are filtered with the same persisted organization context used to launch treasury stream actions.
                </p>
              </div>
              <p className="text-xs font-mono text-textMuted">
                {activity.length} recent event{activity.length === 1 ? '' : 's'}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {activity.slice(0, 4).map((event) => {
                const relatedStream = streams.find((stream) => stream.stream_id === event.stream.stream_id);
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => {
                      if (relatedStream) {
                        navigate(`/streams/${relatedStream.id}`, { state: { daoContext } });
                      }
                    }}
                    disabled={!relatedStream}
                    className="rounded-2xl border border-border bg-surfaceAlt p-4 text-left transition enabled:hover:border-primary/40 enabled:hover:bg-surface disabled:opacity-80"
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-2">
                      {formatEventLabel(event.event_type)}
                    </p>
                    <p className="text-sm font-semibold text-textPrimary">
                      {formatLogicalId(event.stream.stream_id)}
                    </p>
                    <p className="text-xs text-textSecondary mt-1">
                      {getStreamScheduleTemplateLabel(event.stream.schedule_template || '') || event.stream.stream_type}
                    </p>
                    {event.stream.launch_context?.preferredLane && (
                      <p className="text-xs text-textMuted font-mono mt-2">
                        Lane • {event.stream.launch_context.preferredLane}
                      </p>
                    )}
                    <p className="text-xs text-textMuted font-mono mt-3">
                      {new Date(event.created_at * 1000).toLocaleString()}
                    </p>
                    {event.tx_hash && (
                      <span className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                        View tx
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col gap-4 md:gap-6 mb-6 md:mb-8 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Streams
              </h1>
              <p className="font-sans text-textMuted max-w-2xl text-sm leading-relaxed">
                Automated token streaming for salaries, vesting, and recurring payments. View as recipient or sender.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap">
              {daoContext && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/app/dao')}
                  className="w-full justify-center xl:w-auto"
                >
                  Back to DAO
                </Button>
              )}
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate(daoContext ? '/app/dao/stream-activity' : '/streams/activity', {
                  state: daoContext ? { daoContext } : undefined,
                })}
                className="w-full justify-center xl:w-auto"
              >
                <Clock className="w-4 h-4 mr-2" />
                Activity Feed
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate('/streams/shapes', {
                  state: daoContext ? { daoContext } : undefined,
                })}
                className="w-full justify-center xl:w-auto"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Browse Shapes
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate(daoContext ? '/app/dao/stream-batches' : '/streams/batches', {
                  state: daoContext ? { daoContext } : undefined,
                })}
                className="w-full justify-center xl:w-auto"
              >
                <Clock className="w-4 h-4 mr-2" />
                Batch History
              </Button>
              <Button
                size="lg"
                onClick={() => navigate('/streams/create', {
                  state: daoContext ? { daoContext } : undefined,
                })}
                className="w-full justify-center shadow-lg xl:w-auto"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Stream
              </Button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Active Streams"
              value={`${totalStreams}`}
              subtitle={`${bchStreams.length} BCH • ${tokenStreams.length} token on this page`}
              icon={TrendingUp}
              color="primary"
            />
            <StatsCard
              label="Treasury-backed"
              value={`${streams.filter((stream) => Boolean(stream.vault_id)).length}`}
              subtitle={daoContext ? 'Treasury-linked in this workspace' : 'Streams linked to a vault context'}
              icon={Sparkles}
              color="secondary"
            />
            <StatsCard
              label="BCH Value"
              value={`${totalValueBch.toFixed(4)} BCH`}
              subtitle="Only BCH-denominated schedules"
              icon={Clock}
              color="accent"
              progress={{
                percentage: totalValueBch > 0 ? (totalVestedBch / totalValueBch) * 100 : 0,
                label: 'Vested',
              }}
            />
            <StatsCard
              label="Claimable BCH"
              value={`${totalClaimableBch.toFixed(4)} BCH`}
              subtitle="Available from BCH streams"
              icon={Zap}
              color="accent"
            />
            <StatsCard
              label="Withdrawn BCH"
              value={`${totalWithdrawnBch.toFixed(4)} BCH`}
              subtitle="Already claimed from BCH streams"
              icon={Inbox}
              color="secondary"
            />
          </div>

          {/* Role View Toggle */}
          <div className="grid grid-cols-1 gap-2 mb-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center md:mb-4">
            <Button
              variant={roleView === 'recipient' ? 'primary' : 'outline'}
              onClick={() => setRoleView('recipient')}
              className="flex w-full items-center justify-center gap-2 lg:w-auto"
            >
              <Inbox className="w-4 h-4" />
              As Recipient
            </Button>
            <Button
              variant={roleView === 'sender' ? 'primary' : 'outline'}
              onClick={() => setRoleView('sender')}
              className="flex w-full items-center justify-center gap-2 lg:w-auto"
            >
              <Send className="w-4 h-4" />
              As Sender
            </Button>
            <Button
              variant={roleView === 'all' ? 'primary' : 'outline'}
              onClick={() => setRoleView('all')}
              className="w-full justify-center lg:w-auto"
            >
              All Streams
            </Button>
          </div>

          {/* Status Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-textMuted font-sans">Status:</span>
            {(['all', 'active', 'completed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-3 py-1.5 rounded-md text-xs font-sans font-medium transition-colors ${
                  filter === status
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-surface text-textSecondary hover:bg-surfaceAlt border border-border'
                }`}
              >
                {status.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Data Table */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
            <p className="text-textSecondary font-sans">Loading streams...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <DataTable
              columns={columns}
              data={filteredStreams}
              onRowClick={(stream) => {
                const context = buildRowDaoContext(stream);
                navigate(`/streams/${stream.id}`, {
                  state: context || stream.vault_id ? { daoContext: context } : undefined,
                });
              }}
              enableSearch
              enableExport
              enableImport
              onImport={handleImport}
              emptyMessage="No streams found. Create your first stream to get started."
            />
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-textSecondary">
                Page {page} of {totalPages} • {totalStreams} total stream{totalStreams === 1 ? '' : 's'}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
