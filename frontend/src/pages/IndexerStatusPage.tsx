import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  RefreshCw,
  Server,
  ShieldAlert,
  Wifi,
  XCircle,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';

type ServiceStatus = 'healthy' | 'degraded' | 'critical' | 'manual' | 'not_configured' | 'unreachable' | 'unknown';

interface BackendStatusPayload {
  service: {
    name: string;
    status: ServiceStatus;
    uptimeSeconds: number;
    startedAt: string;
  };
  database: {
    engine: string;
    counts: Record<string, number>;
    queryLatencyMs: number;
  };
  network: {
    network: string;
    electrumServer: string | null;
    height: number | null;
    latencyMs: number | null;
    error: string | null;
  };
  resources: {
    memoryRssMB: number;
    heapUsedMB: number;
    nodeVersion: string;
    platform: string;
  };
}

interface RemoteServicePayload {
  name: string;
  url: string | null;
  configured: boolean;
  reachable: boolean;
  status: ServiceStatus;
  data: Record<string, any> | null;
  error: string | null;
}

interface SystemStatusPayload {
  success: boolean;
  timestamp: string;
  overallStatus: ServiceStatus;
  services: {
    backend: BackendStatusPayload;
    indexer: RemoteServicePayload;
    executor: RemoteServicePayload;
  };
  summary: {
    healthy: number;
    degraded: number;
    critical: number;
    manual: number;
    notConfigured: number;
  };
}

const statusTone: Record<ServiceStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: 'Healthy', className: 'text-green-500 bg-green-500/10 border-green-500/20', icon: CheckCircle2 },
  degraded: { label: 'Degraded', className: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20', icon: AlertCircle },
  critical: { label: 'Critical', className: 'text-red-500 bg-red-500/10 border-red-500/20', icon: XCircle },
  manual: { label: 'Manual', className: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: Clock3 },
  not_configured: { label: 'Not Configured', className: 'text-textMuted bg-surfaceAlt border-border', icon: ShieldAlert },
  unreachable: { label: 'Unreachable', className: 'text-red-500 bg-red-500/10 border-red-500/20', icon: Wifi },
  unknown: { label: 'Unknown', className: 'text-textMuted bg-surfaceAlt border-border', icon: AlertCircle },
};

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ServiceBadge({ status }: { status: ServiceStatus }) {
  const tone = statusTone[status] || statusTone.unknown;
  const Icon = tone.icon;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono ${tone.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {tone.label}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-b-0">
      <span className="text-xs font-mono text-textMuted">{label}</span>
      <span className="text-right text-sm font-medium text-textPrimary break-all">{value ?? 'N/A'}</span>
    </div>
  );
}

export default function IndexerStatusPage() {
  const [status, setStatus] = useState<SystemStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/system/status');
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to load system status');
      }

      setStatus(data);
      setLastUpdate(new Date());
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load system status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const serviceCards = useMemo(() => {
    if (!status) return [];

    return [
      {
        key: 'backend',
        title: status.services.backend.service.name,
        icon: Server,
        status: status.services.backend.service.status,
        content: (
          <div className="space-y-1">
            <DetailRow label="Uptime" value={formatUptime(status.services.backend.service.uptimeSeconds)} />
            <DetailRow label="SQLite Query" value={`${status.services.backend.database.queryLatencyMs}ms`} />
            <DetailRow label="Electrum" value={status.services.backend.network.electrumServer || 'Default'} />
            <DetailRow label="Network Height" value={status.services.backend.network.height} />
            <DetailRow label="Heap Used" value={`${status.services.backend.resources.heapUsedMB} MB`} />
          </div>
        ),
      },
      {
        key: 'indexer',
        title: 'FlowGuard Indexer',
        icon: Database,
        status: status.services.indexer.status,
        content: status.services.indexer.data ? (
          <div className="space-y-1">
            <DetailRow label="Indexing Mode" value={status.services.indexer.data.workload?.indexingMode === 'monitored_addresses' ? 'Monitored covenant addresses' : status.services.indexer.data.workload?.indexingMode} />
            <DetailRow label="Indexed Height" value={status.services.indexer.data.chain?.currentIndexedHeight} />
            <DetailRow label="Blocks Behind" value={status.services.indexer.data.chain?.blocksBehind} />
            <DetailRow label="Monitored Addresses" value={status.services.indexer.data.workload?.monitoredAddresses} />
            <DetailRow label="Blocks Indexed" value={status.services.indexer.data.workload?.blocksIndexed} />
            <DetailRow label="Last Success" value={status.services.indexer.data.runtime?.lastSuccessfulIndexAt} />
          </div>
        ) : (
          <div className="space-y-1">
            <DetailRow label="Configured" value={status.services.indexer.configured ? 'Yes' : 'No'} />
            <DetailRow label="Reachable" value={status.services.indexer.reachable ? 'Yes' : 'No'} />
            <DetailRow label="Error" value={status.services.indexer.error} />
          </div>
        ),
      },
      {
        key: 'executor',
        title: 'FlowGuard Executor',
        icon: Activity,
        status: status.services.executor.status,
        content: status.services.executor.data ? (
          <div className="space-y-1">
            <DetailRow label="Execution Mode" value={status.services.executor.data.capabilities?.executionMode === 'manual' ? 'Manual follow-up required' : status.services.executor.data.capabilities?.executionMode} />
            <DetailRow label="Automatic Signing Key" value={status.services.executor.data.capabilities?.automaticSigningConfigured ? 'Configured' : 'Not Configured'} />
            <DetailRow label="Can Broadcast Automatically" value={status.services.executor.data.capabilities?.canBroadcast ? 'Yes' : 'No'} />
            <DetailRow label="Queue Ready" value={`${status.services.executor.data.queue?.executableSchedules ?? 0} schedules / ${status.services.executor.data.queue?.executableProposals ?? 0} proposals`} />
            <DetailRow label="Tasks Seen" value={status.services.executor.data.queue?.tasksSeen} />
            <DetailRow label="Manual Required" value={status.services.executor.data.queue?.manualExecutionsRequired} />
            <DetailRow label="Last Task" value={status.services.executor.data.runtime?.lastTaskAt} />
          </div>
        ) : (
          <div className="space-y-1">
            <DetailRow label="Configured" value={status.services.executor.configured ? 'Yes' : 'No'} />
            <DetailRow label="Reachable" value={status.services.executor.reachable ? 'Yes' : 'No'} />
            <DetailRow label="Error" value={status.services.executor.error} />
          </div>
        ),
      },
    ];
  }, [status]);

  return (
    <>
      <PageMeta
        title="System Status"
        description="Monitor FlowGuard backend, indexer, and executor health across BCH network connectivity, database state, and worker runtime."
        path="/status"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <div className="flex-grow px-4 py-6 md:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Operators</p>
              <h1 className="mt-2 text-3xl font-display font-bold text-textPrimary md:text-5xl">System Status</h1>
              <p className="mt-2 max-w-2xl text-sm text-textMuted md:text-base">
                Operational health for the backend API and supporting workers. This page reports the current implementation as shipped, including monitored-address indexing and manual executor mode where automatic execution is not yet available.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {status && <ServiceBadge status={status.overallStatus} />}
              <Button onClick={fetchStatus} variant="secondary" className="flex items-center gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <button
                onClick={() => setAutoRefresh((value) => !value)}
                className={`rounded-full border px-4 py-2 text-xs font-mono transition-colors ${autoRefresh ? 'border-accent bg-accent text-white' : 'border-border bg-surface text-textPrimary'}`}
              >
                Auto Refresh {autoRefresh ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {loading && !status ? (
            <Card className="p-10">
              <div className="flex items-center justify-center gap-3 text-textMuted">
                <RefreshCw className="h-5 w-5 animate-spin" />
                Loading service status...
              </div>
            </Card>
          ) : error && !status ? (
            <Card className="border-error/30 p-10">
              <div className="flex flex-col items-center justify-center gap-3 text-center">
                <AlertCircle className="h-10 w-10 text-error" />
                <div>
                  <h2 className="text-xl font-semibold text-textPrimary">Unable to load system status</h2>
                  <p className="mt-2 text-sm text-textMuted">{error}</p>
                </div>
                <Button onClick={fetchStatus}>Retry</Button>
              </div>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-mono text-textMuted">Healthy Services</p>
                      <p className="mt-2 text-3xl font-bold text-textPrimary">{status?.summary.healthy ?? 0}</p>
                    </div>
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-mono text-textMuted">Degraded / Critical</p>
                      <p className="mt-2 text-3xl font-bold text-textPrimary">{(status?.summary.degraded ?? 0) + (status?.summary.critical ?? 0)}</p>
                    </div>
                    <ShieldAlert className="h-6 w-6 text-yellow-500" />
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-mono text-textMuted">Manual Services</p>
                      <p className="mt-2 text-3xl font-bold text-textPrimary">{status?.summary.manual ?? 0}</p>
                    </div>
                    <Clock3 className="h-6 w-6 text-blue-500" />
                  </div>
                </Card>
                <Card className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-mono text-textMuted">Last Update</p>
                      <p className="mt-2 text-lg font-semibold text-textPrimary">{lastUpdate ? lastUpdate.toLocaleTimeString() : 'N/A'}</p>
                    </div>
                    <Gauge className="h-6 w-6 text-accent" />
                  </div>
                </Card>
              </div>

              <Card className="border-warning/20 bg-warning/5 p-5">
                <div className="space-y-2">
                  <p className="text-xs font-mono uppercase tracking-[0.24em] text-warning">Operator Note</p>
                  <p className="text-sm text-textSecondary">
                    The indexer currently tracks configured covenant addresses rather than serving as a full general-purpose BCH chain indexer. The executor still requires manual follow-up for live transaction execution, even when a signing key is configured.
                  </p>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                {serviceCards.map(({ key, title, icon: Icon, status: serviceStatus, content }) => (
                  <Card key={key} className="p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-2xl border border-border bg-surfaceAlt p-3">
                            <Icon className="h-5 w-5 text-accent" />
                          </div>
                          <div>
                            <h2 className="text-lg font-semibold text-textPrimary">{title}</h2>
                            <p className="text-xs font-mono text-textMuted">Operational health and runtime state</p>
                          </div>
                        </div>
                        <ServiceBadge status={serviceStatus} />
                      </div>
                      {content}
                    </div>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-accent" />
                    <h2 className="text-lg font-semibold text-textPrimary">Backend Database Inventory</h2>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    {Object.entries(status?.services.backend.database.counts ?? {}).map(([key, value]) => (
                      <div key={key} className="rounded-2xl border border-border bg-surfaceAlt px-4 py-3">
                        <p className="text-xs font-mono uppercase tracking-[0.2em] text-textMuted">{key}</p>
                        <p className="mt-2 text-xl font-bold text-textPrimary">{value.toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card className="p-5">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-5 w-5 text-accent" />
                    <h2 className="text-lg font-semibold text-textPrimary">Network Summary</h2>
                  </div>
                  <div className="mt-4 space-y-1">
                    <DetailRow label="BCH Network" value={status?.services.backend.network.network} />
                    <DetailRow label="Electrum Host" value={status?.services.backend.network.electrumServer} />
                    <DetailRow label="Electrum Latency" value={status?.services.backend.network.latencyMs ? `${status.services.backend.network.latencyMs}ms` : 'N/A'} />
                    <DetailRow label="Indexer URL" value={status?.services.indexer.url} />
                    <DetailRow label="Executor URL" value={status?.services.executor.url} />
                  </div>
                </Card>
              </div>
            </>
          )}
        </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
