import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, Repeat, Sparkles, Waves } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatsCard } from '../../components/shared/StatsCard';
import { DataTable, type Column } from '../../components/shared/DataTable';
import { DaoPreviewBanner } from '../../components/dao/DaoPreviewBanner';
import { DaoSectionNav } from '../../components/dao/DaoSectionNav';
import { getExplorerTxUrl } from '../../utils/blockchain';
import { formatLogicalId } from '../../utils/display';
import { getStreamScheduleTemplateLabel } from '../../utils/streamShapes';

type DateRangePreset = 'all' | '24h' | '7d' | '30d' | '90d';
type EventTypeFilter = 'all' | 'created' | 'funded' | 'claim' | 'paused' | 'resumed' | 'refilled' | 'cancelled';
type StreamStatusFilter = 'all' | 'ACTIVE' | 'PENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface TreasuryStream {
  id: string;
  stream_id: string;
  vault_id?: string | null;
  sender: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  total_amount: number;
  withdrawn_amount: number;
  vested_amount: number;
  claimable_amount: number;
  progress_percentage: number;
  stream_type: string;
  schedule_template?: string;
  status: string;
  refillable?: boolean;
  launch_context?: StreamLaunchContext;
  latest_event?: {
    event_type: string;
    tx_hash?: string | null;
    created_at: number;
  } | null;
}

interface StreamActivityEvent {
  id: string;
  entity_id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  tx_hash: string | null;
  created_at: number;
  stream: {
    stream_id: string;
    vault_id?: string | null;
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

function formatEventLabel(eventType: string) {
  switch (eventType) {
    case 'created':
      return 'Created';
    case 'funded':
      return 'Funded';
    case 'claim':
      return 'Claimed';
    case 'paused':
      return 'Paused';
    case 'resumed':
      return 'Resumed';
    case 'refilled':
      return 'Refilled';
    case 'cancelled':
      return 'Cancelled';
    default:
      return eventType
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
  }
}

export const DaoStreamsPage: React.FC = () => {
  const navigate = useNavigate();
  const [streams, setStreams] = useState<TreasuryStream[]>([]);
  const [events, setEvents] = useState<StreamActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StreamStatusFilter>('all');
  const [contextFilter, setContextFilter] = useState<string>('all');
  const [eventType, setEventType] = useState<EventTypeFilter>('all');
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [streamPage, setStreamPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [streamTotal, setStreamTotal] = useState(0);
  const [streamTotalPages, setStreamTotalPages] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  const contextOptions = useMemo(() => {
    const uniqueSources = new Set<string>();
    streams.forEach((stream) => {
      if (stream.launch_context?.source) uniqueSources.add(stream.launch_context.source);
    });
    return ['all', ...Array.from(uniqueSources)];
  }, [streams]);

  useEffect(() => {
    const fetchStreams = async () => {
      try {
        setLoading(true);
        const streamParams = new URLSearchParams();
        streamParams.set('treasury', 'true');
        streamParams.set('page', String(streamPage));
        streamParams.set('limit', '16');
        if (statusFilter !== 'all') {
          streamParams.set('status', statusFilter);
        }
        if (contextFilter !== 'all') {
          streamParams.set('contextSource', contextFilter);
        }

        const streamResponse = await fetch(`/api/streams?${streamParams.toString()}`);
        const streamData = await streamResponse.json();
        setStreams(streamData.streams || []);
        setStreamTotal(Number(streamData.total || 0));
        setStreamTotalPages(Math.max(1, Number(streamData.totalPages || 1)));

        const activityParams = new URLSearchParams();
        activityParams.set('treasury', 'true');
        activityParams.set('limit', '16');
        activityParams.set('page', String(activityPage));
        if (contextFilter !== 'all') {
          activityParams.set('contextSource', contextFilter);
        }
        if (eventType !== 'all') {
          activityParams.set('eventType', eventType);
        }
        if (dateRange !== 'all') {
          const rangeSeconds = {
            '24h': 24 * 60 * 60,
            '7d': 7 * 24 * 60 * 60,
            '30d': 30 * 24 * 60 * 60,
            '90d': 90 * 24 * 60 * 60,
          }[dateRange];
          activityParams.set('dateFrom', String(Math.floor(Date.now() / 1000) - rangeSeconds));
        }

        const activityResponse = await fetch(`/api/streams/activity?${activityParams.toString()}`);
        const activityData = await activityResponse.json();
        setEvents(activityData.events || []);
        setActivityTotal(Number(activityData.total || 0));
        setActivityTotalPages(Math.max(1, Number(activityData.totalPages || 1)));
      } catch (error) {
        console.error('Failed to fetch DAO streams workspace:', error);
        setStreams([]);
        setEvents([]);
        setStreamTotal(0);
        setStreamTotalPages(1);
        setActivityTotal(0);
        setActivityTotalPages(1);
      } finally {
        setLoading(false);
      }
    };

    fetchStreams();
  }, [statusFilter, contextFilter, eventType, dateRange, streamPage, activityPage]);

  useEffect(() => {
    setStreamPage(1);
    setActivityPage(1);
  }, [statusFilter, contextFilter, eventType, dateRange]);

  const totalClaimable = useMemo(
    () => streams.reduce((sum, stream) => sum + Number(stream.claimable_amount || 0), 0),
    [streams],
  );
  const activeCount = useMemo(
    () => streams.filter((stream) => stream.status === 'ACTIVE').length,
    [streams],
  );
  const refillableCount = useMemo(
    () => streams.filter((stream) => Boolean(stream.refillable)).length,
    [streams],
  );
  const contextualCount = useMemo(
    () => streams.filter((stream) => Boolean(stream.launch_context?.source)).length,
    [streams],
  );

  const columns: Column<TreasuryStream>[] = [
    {
      key: 'stream_id',
      label: 'Treasury Stream',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatLogicalId(row.stream_id)}</p>
          <p className="text-xs text-textSecondary font-mono mt-1">
            {getStreamScheduleTemplateLabel(row.schedule_template || '') || row.stream_type}
          </p>
          {row.launch_context?.preferredLane && (
            <p className="text-xs text-textMuted font-mono mt-1">
              Lane • {row.launch_context.preferredLane}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'vault_id',
      label: 'Treasury',
      sortable: true,
      render: (row) => (
        <p className="font-mono text-sm text-textMuted">
          {row.vault_id || 'No vault'}
        </p>
      ),
    },
    {
      key: 'total_amount',
      label: 'Total',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-textPrimary">
          {formatAssetAmount(row.total_amount, row.token_type)}
        </p>
      ),
    },
    {
      key: 'claimable_amount',
      label: 'Claimable',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary">
          {formatAssetAmount(row.claimable_amount, row.token_type)}
        </p>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <span className="rounded-full bg-surfaceAlt px-3 py-1 text-xs font-mono text-textPrimary">
          {row.status}
        </span>
      ),
    },
    {
      key: 'latest_event',
      label: 'Latest Activity',
      render: (row) => (
        <div>
          <p className="text-sm text-textPrimary">
            {row.latest_event ? formatEventLabel(row.latest_event.event_type) : 'No events'}
          </p>
          {row.latest_event?.tx_hash && (
            <a
              href={getExplorerTxUrl(row.latest_event.tx_hash, network)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium mt-1"
            >
              View Tx
              <Sparkles className="w-3 h-3" />
            </a>
          )}
        </div>
      ),
    },
  ];

  const buildDaoContext = (source?: string | null, title?: string, description?: string, preferredLane?: string) => ({
    source: source || 'dao-streams',
    title: title || 'DAO Treasury Streams',
    description: description || 'Organization-first treasury stream inventory and activity feed.',
    preferredLane,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="mb-6">
        <p className="text-xs font-mono uppercase tracking-[0.24em] text-primary">DAO Treasury Streams</p>
        <h1 className="mt-2 font-display text-4xl text-textPrimary">Treasury stream inventory and execution feed.</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-textSecondary">
          Review every treasury-backed vesting schedule, recurring payout runway, milestone unlock, and stream activity event from one organization-first workspace.
        </p>
      </div>

      <DaoSectionNav />
      <DaoPreviewBanner
        title="A dedicated treasury stream surface for DAO operators."
        description="This workspace combines treasury-linked stream inventory with filtered activity so operators can audit organization workflow instead of jumping between generic user pages."
      />

      <div className="mb-8 flex flex-wrap gap-3">
        <Button
          onClick={() => navigate('/streams/create?template=linear-cliff', {
            state: { daoContext: buildDaoContext('dao-streams', 'DAO Treasury Streams', 'Launch a treasury-backed vesting schedule from the dedicated DAO streams workspace.', 'Finance lane') },
          })}
        >
          Create treasury stream
        </Button>
        <Button
          variant="outline"
          onClick={() => navigate('/streams/batch-create', {
            state: { daoContext: buildDaoContext('dao-streams', 'DAO Treasury Streams', 'Launch a treasury payroll run from the dedicated DAO streams workspace.', 'Payroll lane') },
          })}
        >
          Batch payroll run
        </Button>
        <Button variant="outline" onClick={() => navigate('/app/dao/stream-batches')}>
          Batch history
        </Button>
        <Button variant="outline" onClick={() => navigate('/app/dao/stream-activity')}>
          Open full activity feed
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-8">
        <StatsCard
          label="Treasury streams"
          value={`${streamTotal}`}
          subtitle={`${activeCount} active right now`}
          icon={Waves}
          color="primary"
        />
        <StatsCard
          label="Claimable balance"
          value={`${totalClaimable.toFixed(4)} BCH`}
          subtitle="Sum of currently claimable treasury streams"
          icon={Sparkles}
          color="accent"
        />
        <StatsCard
          label="Refillable runways"
          value={`${refillableCount}`}
          subtitle="Recurring streams that can be extended"
          icon={Repeat}
          color="secondary"
        />
        <StatsCard
          label="Context-tagged"
          value={`${contextualCount}`}
          subtitle={`${contextOptions.length - 1} launch source${contextOptions.length === 2 ? '' : 's'} in use`}
          icon={Activity}
          color="secondary"
        />
      </div>

      <Card className="mb-8 p-5 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Treasury filters</p>
            <h2 className="font-display text-2xl text-textPrimary">Focus the stream workspace</h2>
            <p className="text-sm text-textSecondary mt-1">
              Filter treasury inventory and activity by launch source, stream status, event type, and date range.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Launch source</label>
            <select
              value={contextFilter}
              onChange={(event) => setContextFilter(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
            >
              {contextOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All launch sources' : option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Stream status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StreamStatusFilter)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
            >
              <option value="all">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="PAUSED">Paused</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Activity type</label>
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value as EventTypeFilter)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
            >
              <option value="all">All events</option>
              <option value="created">Created</option>
              <option value="funded">Funded</option>
              <option value="claim">Claims</option>
              <option value="paused">Paused</option>
              <option value="resumed">Resumed</option>
              <option value="refilled">Refilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-textPrimary mb-2">Date range</label>
            <select
              value={dateRange}
              onChange={(event) => setDateRange(event.target.value as DateRangePreset)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
            >
              <option value="all">All time</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card className="p-5 md:p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Treasury inventory</p>
            <h2 className="font-display text-2xl text-textPrimary">Live treasury streams</h2>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
              <p className="text-textSecondary font-sans">Loading treasury streams...</p>
            </div>
        ) : (
            <div className="space-y-4">
              <DataTable
                columns={columns}
                data={streams}
                onRowClick={(stream) => navigate(`/streams/${stream.id}`, {
                  state: { daoContext: buildDaoContext(
                    stream.launch_context?.source,
                    stream.launch_context?.title || 'DAO Treasury Streams',
                    stream.launch_context?.description || 'Organization-first treasury stream inventory and activity feed.',
                    stream.launch_context?.preferredLane,
                  ) },
                })}
                enableSearch
                enableExport
                emptyMessage="No treasury streams found for the selected filters."
              />
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-textSecondary">
                  Page {streamPage} of {streamTotalPages} • {streamTotal} total treasury stream{streamTotal === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStreamPage((current) => Math.max(1, current - 1))}
                    disabled={streamPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStreamPage((current) => Math.min(streamTotalPages, current + 1))}
                    disabled={streamPage >= streamTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-5 md:p-6">
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Recent execution</p>
            <h2 className="font-display text-2xl text-textPrimary">Filtered activity</h2>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent mx-auto mb-4" />
              <p className="text-textSecondary font-sans">Loading treasury activity...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surfaceAlt p-6 text-center">
              <p className="text-textMuted font-sans">No treasury stream activity for the selected filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {events.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => navigate(`/streams/${event.entity_id}`, {
                      state: {
                        daoContext: buildDaoContext(
                          event.stream.launch_context?.source,
                          event.stream.launch_context?.title || 'DAO Treasury Streams',
                          event.stream.launch_context?.description || 'Organization-first treasury stream inventory and activity feed.',
                          event.stream.launch_context?.preferredLane,
                        ),
                      },
                    })}
                    className="w-full rounded-2xl border border-border bg-surfaceAlt p-4 text-left transition hover:border-primary/40 hover:bg-surface"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-textPrimary">
                          {formatEventLabel(event.event_type)} • {formatLogicalId(event.stream.stream_id)}
                        </p>
                        <p className="text-xs text-textSecondary mt-1">
                          {getStreamScheduleTemplateLabel(event.stream.schedule_template || '') || event.stream.stream_type}
                        </p>
                        {event.stream.launch_context?.preferredLane && (
                          <p className="text-xs text-textMuted font-mono mt-1">
                            Lane • {event.stream.launch_context.preferredLane}
                          </p>
                        )}
                        <p className="text-xs text-textMuted font-mono mt-2">
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </p>
                      </div>
                      {event.tx_hash && (
                        <a
                          href={getExplorerTxUrl(event.tx_hash, network)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(eventClick) => eventClick.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover"
                        >
                          tx
                          <Sparkles className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-textSecondary">
                  Page {activityPage} of {activityTotalPages} • {activityTotal} total event{activityTotal === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setActivityPage((current) => Math.max(1, current - 1))}
                    disabled={activityPage <= 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setActivityPage((current) => Math.min(activityTotalPages, current + 1))}
                    disabled={activityPage >= activityTotalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
