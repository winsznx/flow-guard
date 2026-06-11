import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Database,
  ExternalLink,
  Layers,
  RefreshCw,
  Server,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { SkeletonCard } from '../components/ui/Skeleton';
import { BchPriceTicker } from '../components/ui/BchPriceTicker';
import { Footer } from '../components/layout/Footer';
import { PageMeta } from '../components/seo/PageMeta';

type ComponentStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';
type Health = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'maintenance' | 'unknown';
type ComponentGroup = 'API' | 'Frontend' | 'Docs' | 'Explorer' | 'BCH Network' | 'Workers' | 'Database';

interface PublicComponent {
  id: string;
  name: string;
  group: ComponentGroup;
  status: ComponentStatus;
  description: string;
  latencyMs: number | null;
  uptime90d: number | null;
  lastIncidentAt: string | null;
}

interface Incident {
  id: string;
  title: string;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  severity: 'minor' | 'major' | 'critical' | 'maintenance';
  startedAt: string;
  resolvedAt: string | null;
}

interface PublicStatusPayload {
  updatedAt: string;
  refreshIntervalSeconds: number;
  overall: Health;
  network: {
    name: 'mainnet' | 'chipnet';
    isMainnet: boolean;
    displayName: string;
    testnetWarning: boolean;
  };
  chain: {
    height: number | null;
    ageSeconds: number | null;
    latencyMs: number | null;
    recentHeights: number[];
    error: string | null;
  };
  components: PublicComponent[];
  summary: {
    operational: number;
    degraded: number;
    outage: number;
  };
  incidents: Incident[];
}

const REFRESH_INTERVAL_MS = 30_000;

const OVERALL_PRESENTATION: Record<Health, { label: string; tone: string; dot: string; ring: string }> = {
  operational: {
    label: 'All systems operational',
    tone: 'text-success',
    dot: 'bg-success',
    ring: 'ring-success/30',
  },
  degraded: {
    label: 'Degraded performance',
    tone: 'text-warning',
    dot: 'bg-warning',
    ring: 'ring-warning/30',
  },
  partial_outage: {
    label: 'Partial system outage',
    tone: 'text-warning',
    dot: 'bg-warning',
    ring: 'ring-warning/30',
  },
  major_outage: {
    label: 'Major system outage',
    tone: 'text-error',
    dot: 'bg-error',
    ring: 'ring-error/30',
  },
  maintenance: {
    label: 'Scheduled maintenance',
    tone: 'text-info',
    dot: 'bg-info',
    ring: 'ring-info/30',
  },
  unknown: {
    label: 'Status unavailable',
    tone: 'text-textMuted',
    dot: 'bg-textMuted',
    ring: 'ring-border',
  },
};

const COMPONENT_PRESENTATION: Record<ComponentStatus, { label: string; dot: string; text: string }> = {
  operational: { label: 'Operational', dot: 'bg-success', text: 'text-success' },
  degraded: { label: 'Degraded', dot: 'bg-warning', text: 'text-warning' },
  outage: { label: 'Outage', dot: 'bg-error', text: 'text-error' },
  maintenance: { label: 'Maintenance', dot: 'bg-info', text: 'text-info' },
  unknown: { label: 'Unknown', dot: 'bg-textMuted', text: 'text-textMuted' },
};

const SERVICE_CARDS: Array<{
  id: string;
  name: string;
  host: string;
  componentIds: string[];
  detailHref?: string;
  icon: typeof Server;
}> = [
  { id: 'api', name: 'API', host: 'api.flowguard.cash', componentIds: ['api'], icon: Server },
  { id: 'frontend_app', name: 'App', host: 'app.flowguard.cash', componentIds: ['frontend_app'], icon: Layers },
  { id: 'docs', name: 'Docs', host: 'docs.flowguard.cash', componentIds: ['docs'], icon: Layers },
  { id: 'explorer', name: 'Explorer', host: 'explorer.flowguard.cash', componentIds: ['explorer'], icon: Layers },
];

const COMPONENT_PANEL_GROUPS: Array<{ title: string; groups: ComponentGroup[] }> = [
  { title: 'Workers', groups: ['Workers'] },
  { title: 'Database', groups: ['Database'] },
];

function formatRelativeTime(date: Date | null, now: Date): string {
  if (!date) return 'never';
  const deltaSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (deltaSeconds < 5) return 'just now';
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatLatency(latencyMs: number | null): string {
  if (latencyMs === null || latencyMs === undefined) return ' - ';
  if (latencyMs < 1) return '<1ms';
  return `${Math.round(latencyMs)}ms`;
}

function formatUptime(uptime: number | null): string {
  if (uptime === null || uptime === undefined) return ' - ';
  return `${uptime.toFixed(2)}%`;
}

function statusFromGroup(components: PublicComponent[], groupKey: ComponentGroup | 'BCH Network'): ComponentStatus {
  const matches = components.filter((c) => c.group === groupKey);
  if (matches.length === 0) return 'unknown';
  if (matches.some((c) => c.status === 'outage')) return 'outage';
  if (matches.some((c) => c.status === 'degraded')) return 'degraded';
  if (matches.some((c) => c.status === 'maintenance')) return 'maintenance';
  if (matches.every((c) => c.status === 'unknown')) return 'unknown';
  return 'operational';
}

function statusByComponentId(components: PublicComponent[], id: string): PublicComponent | undefined {
  return components.find((c) => c.id === id);
}

function ChainSparkline({ heights }: { heights: number[] }) {
  if (heights.length < 2) {
    return <div className="h-12 w-full rounded bg-surfaceAlt/60" aria-hidden />;
  }
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const span = Math.max(1, max - min);
  const points = heights
    .map((h, i) => {
      const x = (i / (heights.length - 1)) * 100;
      const y = 100 - ((h - min) / span) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-12 w-full"
      role="img"
      aria-label="Recent block heights"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-accent" />
    </svg>
  );
}

export default function StatusPage() {
  const [status, setStatus] = useState<PublicStatusPayload | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const consecutiveFailuresRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [statusResponse, incidentsResponse] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/status/incidents').catch(() => null),
        ]);

        if (cancelled) return;

        if (!statusResponse.ok) {
          throw new Error(`Status endpoint returned HTTP ${statusResponse.status}`);
        }

        const statusData = (await statusResponse.json()) as PublicStatusPayload;
        setStatus(statusData);
        setError(null);
        setLastFetchedAt(new Date());
        consecutiveFailuresRef.current = 0;

        if (incidentsResponse && incidentsResponse.ok) {
          const incidentsData = (await incidentsResponse.json()) as { incidents?: Incident[] };
          setIncidents(incidentsData.incidents ?? []);
        } else {
          setIncidents([]);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load status';
        setError(message);
        consecutiveFailuresRef.current += 1;
      } finally {
        if (!cancelled) {
          setLoading(false);
          const failures = consecutiveFailuresRef.current;
          const backoffMultiplier = Math.min(2 ** failures, 10);
          const nextDelay = Math.min(REFRESH_INTERVAL_MS * backoffMultiplier, 300_000);
          timerRef.current = setTimeout(load, nextDelay);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  const overallPresentation = OVERALL_PRESENTATION[status?.overall ?? 'unknown'];
  const updatedAtDate = useMemo(() => (status?.updatedAt ? new Date(status.updatedAt) : lastFetchedAt), [status?.updatedAt, lastFetchedAt]);
  const components = status?.components ?? [];

  return (
    <>
      <PageMeta
        title="FlowGuard Status"
        description="Real-time status of FlowGuard services - API, App, Docs, Explorer, and the BCH network."
        path="/status"
      />
      <div className="min-h-screen bg-background flex flex-col">
        <div className="grow px-4 py-10 md:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl space-y-8">
            <header className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Link to="/" className="inline-flex items-center gap-2 text-textMuted hover:text-textPrimary transition-colors">
                  <img src="/assets/flow-green.png" alt="FlowGuard" className="h-7 w-auto" />
                  <span className="text-sm font-mono uppercase tracking-[0.24em]">Status</span>
                </Link>
                <a
                  href="https://flowguard.cash"
                  className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted hover:text-textPrimary transition-colors inline-flex items-center gap-1"
                >
                  flowguard.cash
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <Card className={`p-6 md:p-8 ring-1 ${overallPresentation.ring}`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <span
                      className={`relative inline-flex h-4 w-4 items-center justify-center`}
                      aria-hidden
                    >
                      {status?.overall && status.overall !== 'operational' ? (
                        <span className={`absolute inset-0 rounded-full ${overallPresentation.dot} opacity-60 animate-ping`} />
                      ) : null}
                      <span className={`relative h-3 w-3 rounded-full ${overallPresentation.dot}`} />
                    </span>
                    <div>
                      <p className="text-xs font-mono uppercase tracking-[0.24em] text-textMuted">Current status</p>
                      <h1 className={`mt-1 font-display text-2xl md:text-4xl font-bold ${overallPresentation.tone}`}>
                        {loading && !status ? 'Checking status…' : overallPresentation.label}
                      </h1>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {status?.network && (
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-mono uppercase tracking-wider ${
                          status.network.isMainnet
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-warning/30 bg-warning/10 text-warning'
                        }`}
                      >
                        <CircleDot className="h-3.5 w-3.5" />
                        {status.network.displayName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surfaceAlt px-3 py-1.5 text-xs font-mono text-textSecondary">
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                      Auto-refresh every {Math.round(REFRESH_INTERVAL_MS / 1000)}s
                    </span>
                  </div>
                </div>

                {status?.network.testnetWarning && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      You are viewing the <strong>chipnet</strong> deployment. This is a testnet - not for production traffic.
                    </span>
                  </div>
                )}

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-md border border-error/30 bg-error/5 px-3 py-2 text-sm text-error">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </Card>

              {/* Live BCH/USD reading - pulled from the General Protocols
                  USD/BCH oracle, with CoinGecko as a fallback. Sits in the
                  hero so visitors see the platform's market context the
                  same place they see uptime. */}
              <BchPriceTicker variant="card" />
            </header>

            <section aria-labelledby="services-heading" className="space-y-4">
              <div className="flex items-end justify-between">
                <h2 id="services-heading" className="font-display text-xl font-semibold text-textPrimary">
                  Services
                </h2>
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-textMuted">
                  {status?.summary.operational ?? 0} operational · {status?.summary.degraded ?? 0} degraded · {status?.summary.outage ?? 0} outage
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {loading && !status
                  ? SERVICE_CARDS.map((service) => (
                      <SkeletonCard key={service.id} lines={3} />
                    ))
                  : SERVICE_CARDS.map((service) => {
                  const Icon = service.icon;
                  const matched = service.componentIds
                    .map((id) => statusByComponentId(components, id))
                    .filter((c): c is PublicComponent => Boolean(c));
                  const rolled: ComponentStatus = matched.some((c) => c.status === 'outage')
                    ? 'outage'
                    : matched.some((c) => c.status === 'degraded')
                    ? 'degraded'
                    : matched.length === 0
                    ? 'unknown'
                    : matched.every((c) => c.status === 'unknown')
                    ? 'unknown'
                    : 'operational';
                  const tone = COMPONENT_PRESENTATION[rolled];
                  const primary = matched[0];

                  const cardBody = (
                    <Card className="p-5 transition-colors group-hover:border-borderHover">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="rounded-xl border border-border bg-surfaceAlt p-2.5">
                            <Icon className="h-5 w-5 text-accent" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-textPrimary">{service.name}</h3>
                            <p className="text-xs font-mono text-textMuted">{service.host}</p>
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-2 text-xs font-mono ${tone.text}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
                          {tone.label}
                        </span>
                      </div>

                      <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Last incident</dt>
                          <dd className="mt-1 text-textPrimary">
                            {primary?.lastIncidentAt ? formatRelativeTime(new Date(primary.lastIncidentAt), now) : 'none'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Uptime 90d</dt>
                          <dd className="mt-1 text-textPrimary">{formatUptime(primary?.uptime90d ?? null)}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Latency</dt>
                          <dd className="mt-1 text-textPrimary">{formatLatency(primary?.latencyMs ?? null)}</dd>
                        </div>
                      </dl>
                    </Card>
                  );

                  return service.detailHref ? (
                    <Link
                      key={service.id}
                      to={service.detailHref}
                      className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
                    >
                      {cardBody}
                    </Link>
                  ) : (
                    <div key={service.id} className="block group">
                      {cardBody}
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="bch-heading" className="space-y-4">
              <h2 id="bch-heading" className="font-display text-xl font-semibold text-textPrimary">
                BCH Network
              </h2>
              <Card className="p-5 md:p-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_1fr]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-mono uppercase tracking-wider ${
                          status?.network.isMainnet
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-warning/30 bg-warning/10 text-warning'
                        }`}
                      >
                        <CircleDot className="h-3.5 w-3.5" />
                        {status?.network.displayName ?? 'BCH Network'}
                      </span>
                      <span className={`inline-flex items-center gap-2 text-xs font-mono ${COMPONENT_PRESENTATION[statusFromGroup(components, 'BCH Network')].text}`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${COMPONENT_PRESENTATION[statusFromGroup(components, 'BCH Network')].dot}`} aria-hidden />
                        {COMPONENT_PRESENTATION[statusFromGroup(components, 'BCH Network')].label}
                      </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
                      <div>
                        <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Block height</dt>
                        <dd className="mt-1 font-mono text-textPrimary">
                          {status?.chain.height !== null && status?.chain.height !== undefined ? status.chain.height.toLocaleString() : ' - '}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Last block age</dt>
                        <dd className="mt-1 text-textPrimary">
                          {status?.chain.ageSeconds !== null && status?.chain.ageSeconds !== undefined
                            ? `${status.chain.ageSeconds}s`
                            : ' - '}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Electrum latency</dt>
                        <dd className="mt-1 text-textPrimary">{formatLatency(status?.chain.latencyMs ?? null)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Mempool depth</dt>
                        <dd className="mt-1 text-textMuted">not yet measured</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-mono uppercase tracking-wider text-textMuted">Peers</dt>
                        <dd className="mt-1 text-textMuted">not yet measured</dd>
                      </div>
                    </dl>

                    {status?.chain.error && (
                      <p className="text-xs text-error">{status.chain.error}</p>
                    )}
                  </div>

                  <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-surfaceAlt/60 p-4">
                    <div>
                      <p className="text-xs font-mono uppercase tracking-wider text-textMuted">Last {status?.chain.recentHeights.length ?? 0} blocks</p>
                      <p className="mt-1 text-sm text-textSecondary">Chain tip trend, oldest to newest.</p>
                    </div>
                    <ChainSparkline heights={status?.chain.recentHeights ?? []} />
                    <div className="flex items-center justify-between font-mono text-[11px] text-textMuted">
                      <span>{status?.chain.recentHeights[0] ?? ' - '}</span>
                      <span>
                        {status?.chain.recentHeights && status.chain.recentHeights.length > 0
                          ? status.chain.recentHeights[status.chain.recentHeights.length - 1]
                          : ' - '}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            <section aria-labelledby="components-heading" className="space-y-4">
              <h2 id="components-heading" className="font-display text-xl font-semibold text-textPrimary">
                Components
              </h2>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {COMPONENT_PANEL_GROUPS.map(({ title, groups }) => {
                  const groupComponents = components.filter((c) => groups.includes(c.group));
                  const Icon = title === 'Workers' ? Activity : Database;

                  return (
                    <Card key={title} className="p-5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="rounded-xl border border-border bg-surfaceAlt p-2">
                            <Icon className="h-4 w-4 text-accent" />
                          </div>
                          <h3 className="font-semibold text-textPrimary">{title}</h3>
                        </div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-textMuted">
                          {groupComponents.length} component{groupComponents.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <ul className="mt-4 divide-y divide-border/60">
                        {groupComponents.length === 0 ? (
                          <li className="py-3 text-sm text-textMuted">No components reporting.</li>
                        ) : (
                          groupComponents.map((component) => {
                            const tone = COMPONENT_PRESENTATION[component.status];
                            return (
                              <li key={component.id} className="flex items-start justify-between gap-3 py-3">
                                <div>
                                  <p className="text-sm font-medium text-textPrimary">{component.name}</p>
                                  <p className="text-xs text-textMuted">{component.description}</p>
                                </div>
                                <span className={`inline-flex shrink-0 items-center gap-2 text-xs font-mono ${tone.text}`}>
                                  <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} aria-hidden />
                                  {tone.label}
                                </span>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="incidents-heading" className="space-y-4">
              <div className="flex items-end justify-between">
                <h2 id="incidents-heading" className="font-display text-xl font-semibold text-textPrimary">
                  Recent incidents
                </h2>
                <span className="text-xs font-mono uppercase tracking-[0.2em] text-textMuted">Last 30 days</span>
              </div>

              {incidents.length === 0 ? (
                <Card className="flex flex-col items-center gap-2 p-10 text-center">
                  <CheckCircle2 className="h-8 w-8 text-success" />
                  <p className="text-sm text-textSecondary">No incidents in the last 30 days.</p>
                  <p className="text-xs text-textMuted">
                    Incident history will appear here once the incident store ships.
                  </p>
                </Card>
              ) : (
                <ul className="space-y-3">
                  {incidents.map((incident) => {
                    const severityTone =
                      incident.severity === 'critical'
                        ? 'border-error/40 bg-error/10 text-error'
                        : incident.severity === 'major'
                        ? 'border-error/30 bg-error/5 text-error'
                        : incident.severity === 'minor'
                        ? 'border-warning/30 bg-warning/5 text-warning'
                        : 'border-info/30 bg-info/5 text-info';
                    return (
                      <li key={incident.id}>
                        <Card className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-textPrimary">{incident.title}</p>
                              <p className="text-xs text-textMuted">
                                Started {formatRelativeTime(new Date(incident.startedAt), now)}
                                {incident.resolvedAt
                                  ? ` · Resolved ${formatRelativeTime(new Date(incident.resolvedAt), now)}`
                                  : ''}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${severityTone}`}
                            >
                              <ShieldAlert className="h-3 w-3" />
                              {incident.severity}
                            </span>
                          </div>
                        </Card>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <footer className="flex flex-col items-center gap-3 border-t border-border/60 pt-6 text-center">
              <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-mono text-textMuted">
                <span>
                  Last updated {formatRelativeTime(updatedAtDate, now)}
                </span>
                <span aria-hidden>·</span>
                <span>Auto-refreshes every {Math.round(REFRESH_INTERVAL_MS / 1000)}s</span>
              </div>
              <p className="text-xs text-textMuted">Status powered by FlowGuard</p>
            </footer>
          </div>
        </div>
        <Footer />
      </div>
    </>
  );
}
