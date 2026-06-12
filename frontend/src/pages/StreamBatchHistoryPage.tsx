import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Download, ExternalLink, FileSpreadsheet, Layers3, Sparkles, Waves } from 'lucide-react';
import { useWallet } from '../hooks/useWallet';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatsCard } from '../components/shared/StatsCard';
import { DataTable, type Column } from '../components/shared/DataTable';
import { SkeletonTable, SkeletonCard } from '../components/ui/Skeleton';
import { getExplorerTxUrl } from '../utils/blockchain';
import { formatLogicalId } from '../utils/display';
import { readDaoLaunchContext, type DaoLaunchContext } from '../utils/daoStreamLaunch';
import { getStreamScheduleTemplateLabel } from '../utils/streamShapes';
import { formatTokenAmount } from '../utils/tokenFormat';

type BatchScope = 'personal' | 'treasury' | 'context';
type BatchStatusFilter = 'all' | 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

interface StreamLaunchContext {
  source: string;
  title?: string;
  description?: string;
  preferredLane?: string;
}

interface BatchRun {
  id: string;
  vault_id: string | null;
  sender: string;
  token_type: 'BCH' | 'CASHTOKENS';
  token_category?: string | null;
  stream_count: number;
  total_amount: number;
  status: string;
  tx_hash: string | null;
  launch_context: StreamLaunchContext | null;
  active_streams: number;
  pending_streams: number;
  cancelled_streams: number;
  completed_streams: number;
  created_at: number;
  updated_at: number;
}

interface BatchRunStream {
  id: string;
  stream_id: string;
  recipient: string;
  token_type: 'BCH' | 'CASHTOKENS';
  total_amount: number;
  status: string;
  stream_type: string;
  schedule_template?: string | null;
  launch_context?: StreamLaunchContext | null;
}

interface BatchRunEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
}

function formatAssetAmount(
  amount: number,
  tokenType: 'BCH' | 'CASHTOKENS',
  tokenCategory?: string | null,
) {
  return formatTokenAmount(amount, tokenType, tokenCategory, {
    decimals: tokenType === 'BCH' ? 8 : 0,
    separator: true,
  });
}

function formatBatchEventLabel(eventType: string) {
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

export default function StreamBatchHistoryPage() {
  const wallet = useWallet();
  const navigate = useNavigate();
  const location = useLocation();
  const launchState = location.state as { daoContext?: DaoLaunchContext } | null;
  const daoContext = launchState?.daoContext || readDaoLaunchContext();
  const isDaoRoute = location.pathname.startsWith('/app/dao');
  const [scope, setScope] = useState<BatchScope>(isDaoRoute ? 'treasury' : 'personal');
  const [statusFilter, setStatusFilter] = useState<BatchStatusFilter>('all');
  const [batches, setBatches] = useState<BatchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalBatches, setTotalBatches] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchRun | null>(null);
  const [selectedStreams, setSelectedStreams] = useState<BatchRunStream[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<BatchRunEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const network = import.meta.env.VITE_BCH_NETWORK === 'mainnet' ? 'mainnet' : 'chipnet';

  useEffect(() => {
    if (!wallet.address && scope === 'personal') {
      setBatches([]);
      setLoading(false);
      setSelectedBatchId(null);
      setSelectedBatch(null);
      setSelectedStreams([]);
      setSelectedEvents([]);
      return;
    }

    const fetchBatchRuns = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('limit', '20');
        params.set('page', String(page));

        if (scope === 'personal' && wallet.address) {
          params.set('sender', wallet.address);
        }
        if (scope === 'treasury') {
          params.set('treasury', 'true');
        }
        if (scope === 'context' && daoContext?.source) {
          params.set('treasury', 'true');
          params.set('contextSource', daoContext.source);
        }
        if (statusFilter !== 'all') {
          params.set('status', statusFilter);
        }

        const response = await fetch(`/api/streams/batch-runs?${params.toString()}`);
        const data = await response.json();
        setBatches(data.batches || []);
        setTotalBatches(Number(data.total || 0));
        setTotalPages(Math.max(1, Number(data.totalPages || 1)));
      } catch (error) {
        console.error('Failed to fetch stream batch runs:', error);
        setBatches([]);
        setTotalBatches(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    };

    fetchBatchRuns();
  }, [wallet.address, scope, daoContext?.source, statusFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [wallet.address, scope, daoContext?.source, statusFilter]);

  useEffect(() => {
    if (!batches.length) {
      setSelectedBatchId(null);
      setSelectedBatch(null);
      setSelectedStreams([]);
      setSelectedEvents([]);
      return;
    }
    if (!selectedBatchId || !batches.some((batch) => batch.id === selectedBatchId)) {
      setSelectedBatchId(batches[0].id);
    }
  }, [batches, selectedBatchId]);

  useEffect(() => {
    if (!selectedBatchId) return;

    const fetchBatchDetail = async () => {
      try {
        setDetailLoading(true);
        const response = await fetch(`/api/streams/batch-runs/${selectedBatchId}`);
        const data = await response.json();
        setSelectedBatch(data.batch || null);
        setSelectedStreams(data.streams || []);
        setSelectedEvents(data.events || []);
      } catch (error) {
        console.error('Failed to fetch stream batch detail:', error);
        setSelectedBatch(null);
        setSelectedStreams([]);
        setSelectedEvents([]);
      } finally {
        setDetailLoading(false);
      }
    };

    fetchBatchDetail();
  }, [selectedBatchId]);

  const totalStreamsInView = useMemo(
    () => batches.reduce((sum, batch) => sum + Number(batch.stream_count || 0), 0),
    [batches],
  );
  const totalValueInView = useMemo(
    () => batches.reduce((sum, batch) => sum + Number(batch.total_amount || 0), 0),
    [batches],
  );
  const completedRuns = useMemo(
    () => batches.filter((batch) => batch.status === 'COMPLETED').length,
    [batches],
  );
  const treasuryLinkedRuns = useMemo(
    () => batches.filter((batch) => Boolean(batch.vault_id)).length,
    [batches],
  );

  const buildBatchDaoContext = (batch: BatchRun | null | undefined): DaoLaunchContext | undefined => {
    if (daoContext) return daoContext;
    if (!batch?.launch_context?.source) return undefined;
    return {
      source: batch.launch_context.source,
      title: batch.launch_context.title || 'Treasury stream batch',
      description: batch.launch_context.description || 'This batch run was launched from an organization workflow and should remain tied to that treasury context.',
      preferredLane: batch.launch_context.preferredLane,
    };
  };

  const columns: Column<BatchRun>[] = [
    {
      key: 'id',
      label: 'Batch Run',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-sans font-medium text-textPrimary">{formatLogicalId(row.id)}</p>
          <p className="text-xs text-textMuted font-mono mt-1">
            {row.launch_context?.title || row.launch_context?.source || (row.vault_id ? `Vault ${row.vault_id}` : 'Standalone payroll run')}
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
      key: 'stream_count',
      label: 'Streams',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-textPrimary">{row.stream_count}</p>
      ),
    },
    {
      key: 'total_amount',
      label: 'Batch Value',
      sortable: true,
      className: 'text-right',
      render: (row) => (
        <p className="font-display font-bold text-primary">
          {formatAssetAmount(row.total_amount, row.token_type, row.token_category)}
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
      key: 'created_at',
      label: 'Created',
      sortable: true,
      render: (row) => (
        <div>
          <p className="text-sm text-textPrimary">{new Date(row.created_at * 1000).toLocaleDateString()}</p>
          <p className="text-xs text-textMuted font-mono mt-1">{new Date(row.created_at * 1000).toLocaleTimeString()}</p>
        </div>
      ),
    },
    {
      key: 'tx_hash',
      label: 'Funding Tx',
      render: (row) => row.tx_hash ? (
        <a
          href={getExplorerTxUrl(row.tx_hash, network)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover font-medium"
        >
          View Tx
          <ExternalLink className="w-3 h-3" />
        </a>
      ) : (
        <span className="text-xs text-textMuted font-sans">No tx</span>
      ),
    },
  ];

  const backDestination = isDaoRoute ? '/app/dao/streams' : '/streams';
  const backLabel = isDaoRoute ? 'Back to DAO Streams' : 'Back to Streams';

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <Link
          to={backDestination}
          className="inline-flex items-center gap-2 text-textSecondary hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>

        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-6 mb-6 md:mb-8">
            <div>
              <h1 className="font-display font-medium text-3xl md:text-5xl lg:text-6xl text-textPrimary mb-3 md:mb-4">
                Stream Batch Runs
              </h1>
              <p className="font-sans text-textMuted max-w-3xl text-sm leading-relaxed">
                Audit payroll runs, treasury-funded stream batches, and exportable roster history from the same shared batch execution layer used by personal and DAO workspaces.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate(isDaoRoute ? '/app/dao/stream-activity' : '/streams/activity', {
                  state: daoContext ? { daoContext } : undefined,
                })}
              >
                <Clock className="w-4 h-4 mr-2" />
                Activity Feed
              </Button>
              <Button
                size="lg"
                onClick={() => navigate('/streams/batch-create', {
                  state: daoContext ? { daoContext } : undefined,
                })}
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                New Batch Run
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6 md:mb-8">
            <StatsCard
              label="Batch runs"
              value={`${totalBatches}`}
              subtitle={`${completedRuns} completed in this view`}
              icon={Layers3}
              color="primary"
            />
            <StatsCard
              label="Streams covered"
              value={`${totalStreamsInView}`}
              subtitle="Recipients funded across loaded runs"
              icon={Waves}
              color="accent"
            />
            <StatsCard
              label="Value in view"
              value={batches[0] ? formatAssetAmount(totalValueInView, batches[0].token_type, batches[0].token_category) : '0 BCH'}
              subtitle="Aggregate batch funding value"
              icon={Sparkles}
              color="secondary"
            />
            <StatsCard
              label="Treasury-linked"
              value={`${treasuryLinkedRuns}`}
              subtitle={`${batches.length - treasuryLinkedRuns} standalone run${batches.length - treasuryLinkedRuns === 1 ? '' : 's'}`}
              icon={Clock}
              color="secondary"
            />
          </div>

          <Card className="p-5 md:p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Batch filters</p>
                <h2 className="font-display text-2xl text-textPrimary">Scope the run history</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-textMuted font-sans">Batch status</span>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as BatchStatusFilter)}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm text-textPrimary focus:outline-none focus:ring-2 focus:ring-focusRing"
                >
                  <option value="all">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              {wallet.address && (
                <Button
                  variant={scope === 'personal' ? 'primary' : 'outline'}
                  onClick={() => setScope('personal')}
                >
                  Personal runs
                </Button>
              )}
              <Button
                variant={scope === 'treasury' ? 'primary' : 'outline'}
                onClick={() => setScope('treasury')}
              >
                Treasury runs
              </Button>
              {daoContext?.source && (
                <Button
                  variant={scope === 'context' ? 'primary' : 'outline'}
                  onClick={() => setScope('context')}
                >
                  This launch context
                </Button>
              )}
            </div>
          </Card>
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <Card className="p-5 md:p-6">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Batch inventory</p>
              <h2 className="font-display text-2xl text-textPrimary">Recent funding runs</h2>
            </div>

            {loading ? (
              <SkeletonTable rows={6} columns={6} />
            ) : (
              <div className="space-y-4">
                <DataTable
                  columns={columns}
                  data={batches}
                  onRowClick={(row) => setSelectedBatchId(row.id)}
                  enableSearch
                  enableExport
                  emptyMessage="No batch runs found for the selected scope."
                />
                <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surfaceAlt px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-textSecondary">
                    Page {page} of {totalPages} • {totalBatches} total batch run{totalBatches === 1 ? '' : 's'}
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
          </Card>

          <Card className="p-5 md:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-2">Selected run</p>
                <h2 className="font-display text-2xl text-textPrimary">
                  {selectedBatch ? formatLogicalId(selectedBatch.id) : 'Choose a batch run'}
                </h2>
              </div>
              {selectedBatch && (
                <Button
                  variant="outline"
                  onClick={() => window.open(`/api/streams/batch-runs/${selectedBatch.id}/export`, '_blank', 'noopener,noreferrer')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              )}
            </div>

            {detailLoading ? (
              <SkeletonCard lines={4} />
            ) : !selectedBatch ? (
              <div className="rounded-2xl border border-border bg-surfaceAlt p-6 text-center">
                <p className="text-textMuted font-sans">Select a batch run to review stream inventory, activity, and exports.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl border border-border bg-surfaceAlt p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">Streams</p>
                      <p className="font-display text-xl text-textPrimary">{selectedBatch.stream_count}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">Batch Value</p>
                      <p className="font-display text-xl text-textPrimary">
                        {formatAssetAmount(selectedBatch.total_amount, selectedBatch.token_type, selectedBatch.token_category)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">Status Mix</p>
                      <p className="text-sm text-textPrimary">
                        {selectedBatch.active_streams} active • {selectedBatch.pending_streams} pending
                      </p>
                      <p className="text-xs text-textMuted mt-1">
                        {selectedBatch.completed_streams} completed • {selectedBatch.cancelled_streams} cancelled
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-surface px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-textMuted font-mono mb-1">Context</p>
                      <p className="text-sm text-textPrimary">
                        {selectedBatch.launch_context?.title || selectedBatch.launch_context?.source || (selectedBatch.vault_id ? `Vault ${selectedBatch.vault_id}` : 'Standalone batch')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {selectedBatch.tx_hash && (
                      <a
                        href={getExplorerTxUrl(selectedBatch.tx_hash, network)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:text-primaryHover font-medium"
                      >
                        View funding transaction
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {selectedBatch.launch_context?.preferredLane && (
                      <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-mono text-textMuted">
                        Lane • {selectedBatch.launch_context.preferredLane}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-3">Streams in run</p>
                  <div className="space-y-3">
                    {selectedStreams.slice(0, 6).map((stream) => (
                      <button
                        key={stream.id}
                        type="button"
                        onClick={() => navigate(`/streams/${stream.id}`, {
                          state: buildBatchDaoContext(selectedBatch) ? { daoContext: buildBatchDaoContext(selectedBatch) } : undefined,
                        })}
                        className="w-full rounded-2xl border border-border bg-surfaceAlt p-4 text-left transition hover:border-primary/40 hover:bg-surface"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-textPrimary">{formatLogicalId(stream.stream_id)}</p>
                            <p className="text-xs text-textSecondary mt-1">
                              {getStreamScheduleTemplateLabel(stream.schedule_template || '') || stream.stream_type}
                            </p>
                            <p className="text-xs text-textMuted font-mono mt-2 break-all">
                              {stream.recipient}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-textPrimary">
                              {formatAssetAmount(stream.total_amount, stream.token_type, selectedBatch?.token_category)}
                            </p>
                            <p className="text-xs text-textMuted mt-1">{stream.status}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                    {selectedStreams.length > 6 && (
                      <p className="text-xs text-textMuted font-mono">
                        Showing 6 of {selectedStreams.length} streams in this run.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-primary font-mono mb-3">Recent batch activity</p>
                  {selectedEvents.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-surfaceAlt p-4 text-sm text-textMuted">
                      No activity captured for this batch yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedEvents.slice(0, 8).map((event) => (
                        <div key={event.id} className="rounded-2xl border border-border bg-surfaceAlt p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-textPrimary">{formatBatchEventLabel(event.event_type)}</p>
                              <p className="text-xs text-textMuted font-mono mt-1">
                                {new Date(event.created_at * 1000).toLocaleString()}
                              </p>
                              {event.actor && (
                                <p className="text-xs text-textSecondary font-mono mt-2 break-all">
                                  Actor • {event.actor}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              {typeof event.amount === 'number' && (
                                <p className="text-sm font-medium text-primary">
                                  {formatAssetAmount(event.amount, selectedBatch.token_type, selectedBatch.token_category)}
                                </p>
                              )}
                              {event.tx_hash && (
                                <a
                                  href={getExplorerTxUrl(event.tx_hash, network)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:text-primaryHover"
                                >
                                  tx
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
