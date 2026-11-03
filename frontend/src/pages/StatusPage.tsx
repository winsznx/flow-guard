import { useEffect, useRef, useState } from 'react';
import { MarketingFooter } from '../components/layout/Footer';
import { MarketingNav } from '../components/layout/MarketingNav';
import { PageContainer } from '../components/layout/PageContainer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { DashedCard } from '../components/ui/DashedCard';
import { Heading } from '../components/ui/Heading';
import { List, type Column, type ListState } from '../components/ui/List';
import { NetworkCapsule } from '../components/ui/NetworkCapsule';
import { Notice } from '../components/ui/Notice';
import { Panel } from '../components/ui/Panel';
import { SiteBanner } from '../components/ui/SiteBanner';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { MOMENTS } from '../copy/common';
import { formatDuration, formatRelative } from '../copy/format';
import { BUILD_NETWORK, IS_TEST_BUILD } from '../copy/network';
import type { StatusKey } from '../copy/status';
import {
  HEADLINE,
  INCIDENT_SEVERITY,
  INCIDENT_STATE,
  LOAD_PROBLEM,
  SERVICE_COPY,
  STATUS_PAGE,
  UPDATES_EVERY,
  checkedAt,
  checkingAgainIn,
  incidentResolved,
  incidentStarted,
  lastGoodCheck,
  lastIncidentAt,
  latestDataAt,
  notReportedCount,
  respondsIn,
  uptimeOver90Days,
  type HeadlineKind,
  type IncidentSeverity,
  type IncidentState,
  type StatusLoadProblem,
} from '../copy/statusPage';

type ComponentStatus = 'operational' | 'degraded' | 'outage' | 'maintenance' | 'unknown';

interface PublicComponent {
  id: string;
  status: string;
  latencyMs: number | null;
  uptime90d: number | null;
  lastIncidentAt: string | null;
}

interface Incident {
  id: string;
  title: string;
  status: IncidentState | null;
  severity: IncidentSeverity | null;
  startedAt: string | null;
  resolvedAt: string | null;
}

/** The fields this page reads from GET /api/status, each null when the server left it out. */
interface PublicStatusPayload {
  network: { name: 'mainnet' | 'chipnet'; isMainnet: boolean } | null;
  /** When the latest block was made, from `updatedAt - chain.ageSeconds`. */
  latestBlockAt: number | null;
  components: PublicComponent[];
  incidentsTracked: boolean;
  incidents: Incident[];
}

interface Snapshot {
  payload: PublicStatusPayload;
  checkedAt: number;
}

interface ServiceRow {
  id: string;
  name: string;
  line: string;
  status: StatusKey;
  measured: string[];
  latestBlockAt: number | null;
}

const REFRESH_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;
const RATE_LIMITED_RETRY_MS = 60_000;
const CLOCK_TICK_MS = 10_000;

/** The API row is inferred from the database probe rather than measured, so it stays off the page. */
const UNMEASURED_COMPONENTS = new Set(['api']);

const COMPONENT_STATUS: Record<ComponentStatus, StatusKey> = {
  operational: 'running',
  degraded: 'slow',
  outage: 'down',
  maintenance: 'maintenance',
  unknown: 'notChecked',
};

class StatusRequestError extends Error {
  constructor(readonly status: number) {
    super(`GET /api/status returned ${status}`);
    this.name = 'StatusRequestError';
  }
}

type Fields = Record<string, unknown>;

const INCIDENT_STATES: readonly IncidentState[] = [
  'investigating',
  'identified',
  'monitoring',
  'resolved',
];
const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = [
  'minor',
  'major',
  'critical',
  'maintenance',
];

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readComponent(value: unknown): PublicComponent | null {
  if (!isFields(value)) return null;
  const id = readString(value.id);
  if (!id) return null;
  return {
    id,
    status: readString(value.status) ?? 'unknown',
    latencyMs: readNumber(value.latencyMs),
    uptime90d: readNumber(value.uptime90d),
    lastIncidentAt: readString(value.lastIncidentAt),
  };
}

function readIncident(value: unknown): Incident | null {
  if (!isFields(value)) return null;
  const id = readString(value.id);
  const title = readString(value.title);
  if (!id || !title) return null;
  return {
    id,
    title,
    status: INCIDENT_STATES.find((state) => state === value.status) ?? null,
    severity: INCIDENT_SEVERITIES.find((severity) => severity === value.severity) ?? null,
    startedAt: readString(value.startedAt),
    resolvedAt: readString(value.resolvedAt),
  };
}

function readNetwork(value: unknown): PublicStatusPayload['network'] {
  if (!isFields(value) || typeof value.isMainnet !== 'boolean') return null;
  if (value.name !== 'mainnet' && value.name !== 'chipnet') return null;
  return { name: value.name, isMainnet: value.isMainnet };
}

function readLatestBlockAt(updatedAt: unknown, chain: unknown): number | null {
  const ageSeconds = isFields(chain) ? readNumber(chain.ageSeconds) : null;
  const checked = typeof updatedAt === 'string' ? Date.parse(updatedAt) : Number.NaN;
  if (ageSeconds === null || ageSeconds < 0 || !Number.isFinite(checked)) return null;
  return checked - ageSeconds * 1000;
}

function readPayload(body: unknown, httpStatus: number): PublicStatusPayload {
  if (!isFields(body) || !Array.isArray(body.components)) throw new StatusRequestError(httpStatus);
  const incidentsTracked = body.incidentsTracked === true;
  return {
    network: readNetwork(body.network),
    latestBlockAt: readLatestBlockAt(body.updatedAt, body.chain),
    components: body.components.map(readComponent).filter((c): c is PublicComponent => c !== null),
    incidentsTracked,
    incidents:
      incidentsTracked && Array.isArray(body.incidents)
        ? body.incidents.map(readIncident).filter((i): i is Incident => i !== null)
        : [],
  };
}

async function fetchStatus(): Promise<PublicStatusPayload> {
  const response = await fetch('/api/status');
  if (!response.ok) throw new StatusRequestError(response.status);
  return readPayload((await response.json()) as unknown, response.status);
}

function problemFor(error: unknown): StatusLoadProblem {
  return error instanceof StatusRequestError && error.status === 429 ? 'rateLimited' : 'other';
}

function retryDelay(problem: StatusLoadProblem | null, failures: number): number {
  if (!problem) return REFRESH_MS;
  if (problem === 'rateLimited') return RATE_LIMITED_RETRY_MS;
  return Math.min(REFRESH_MS * 2 ** failures, MAX_BACKOFF_MS);
}

function toStatusKey(status: string): StatusKey {
  return status in COMPONENT_STATUS ? COMPONENT_STATUS[status as ComponentStatus] : 'notChecked';
}

/** Only what the server measured. Uptime and the last incident stay hidden while they're null. */
function measuredLines(component: PublicComponent): string[] {
  const parts: string[] = [];
  if (component.latencyMs !== null) parts.push(respondsIn(component.latencyMs));
  if (component.uptime90d !== null) parts.push(uptimeOver90Days(component.uptime90d));
  const lastIncident = component.lastIncidentAt ? formatRelative(component.lastIncidentAt) : null;
  if (lastIncident) parts.push(lastIncidentAt(lastIncident));
  return parts;
}

function rowsFor(payload: PublicStatusPayload, group: 'service' | 'job'): ServiceRow[] {
  return payload.components.flatMap((component) => {
    const copy = SERVICE_COPY[component.id];
    if (!copy || copy.group !== group || UNMEASURED_COMPONENTS.has(component.id)) return [];
    return [
      {
        id: component.id,
        name: copy.name,
        line: copy.line,
        status: toStatusKey(component.status),
        measured: measuredLines(component),
        latestBlockAt: component.id === 'bch_network' ? payload.latestBlockAt : null,
      },
    ];
  });
}

function headlineFor(rows: ServiceRow[]): HeadlineKind {
  if (rows.length === 0) return 'notReported';
  const has = (status: StatusKey) => rows.some((row) => row.status === status);
  if (has('down')) return 'down';
  if (has('slow')) return 'slow';
  if (has('maintenance')) return 'maintenance';
  if (has('notChecked')) return 'notReported';
  return 'running';
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function CheckedAgo({ at }: { at: number }) {
  const now = useClock();
  return <>{checkedAt(formatRelative(at, Math.max(now, at)) ?? '')}</>;
}

function LastGoodCheck({ at }: { at: number }) {
  const now = useClock();
  return <>{lastGoodCheck(formatRelative(at, Math.max(now, at)) ?? '')}</>;
}

function NextCheck({ at }: { at: number }) {
  const now = useClock();
  const seconds = Math.max(0, Math.ceil((at - now) / 1000));
  return <>{checkingAgainIn(formatDuration(Math.max(seconds, 1)) ?? '')}</>;
}

function LatestBlock({ at }: { at: number }) {
  const now = useClock();
  const relative = formatRelative(at, Math.max(now, at));
  return relative ? <span>{latestDataAt(relative)}</span> : null;
}

const SERVICE_COLUMNS: Column<ServiceRow>[] = [
  {
    key: 'service',
    header: STATUS_PAGE.service,
    primary: true,
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body font-medium text-ink">{row.name}</span>
        <span className="text-small text-ink-secondary">{row.line}</span>
      </div>
    ),
  },
  {
    key: 'status',
    header: STATUS_PAGE.state,
    mobile: 'top',
    width: 'xl',
    cell: (row) => <StatusPill status={row.status} />,
  },
  {
    key: 'measured',
    header: STATUS_PAGE.measured,
    mobile: 'bottom-start',
    width: 'lg',
    cell: (row) =>
      row.measured.length > 0 || row.latestBlockAt !== null ? (
        <div className="flex flex-col gap-0.5 text-small text-ink-secondary">
          {row.measured.map((line) => (
            <span key={line}>{line}</span>
          ))}
          {row.latestBlockAt !== null ? <LatestBlock at={row.latestBlockAt} /> : null}
        </div>
      ) : (
        <div className="text-small text-ink-muted">{STATUS_PAGE.notMeasured}</div>
      ),
  },
];

function ServiceList({
  label,
  rows,
  state,
}: {
  label: string;
  rows: ServiceRow[];
  state: ListState;
}) {
  return (
    <List
      label={label}
      columns={SERVICE_COLUMNS}
      rows={rows}
      rowKey={(row) => row.id}
      state={state}
      tableLayout="fixed"
      empty={<p className="text-small text-ink-secondary">{HEADLINE.notReported.sentence}</p>}
      noResults={null}
      error={null}
    />
  );
}

function IncidentList({ incidents }: { incidents: Incident[] }) {
  return (
    <section aria-labelledby="status-incidents" className="flex flex-col gap-4">
      <Heading level="section" id="status-incidents">
        {STATUS_PAGE.incidentsTitle}
      </Heading>
      <ul aria-label={STATUS_PAGE.incidentsLabel} className="flex flex-col gap-3">
        {incidents.map((incident) => {
          const started = incident.startedAt ? formatRelative(incident.startedAt) : null;
          const resolved = incident.resolvedAt ? formatRelative(incident.resolvedAt) : null;
          const stateWord =
            incident.status && !(incident.status === 'resolved' && resolved)
              ? INCIDENT_STATE[incident.status]
              : null;
          return (
            <Card as="li" key={incident.id} className="flex flex-col gap-2">
              <Heading level="item">{incident.title}</Heading>
              <p className="text-small text-ink-secondary">
                {[
                  stateWord,
                  incident.severity ? INCIDENT_SEVERITY[incident.severity] : null,
                  started ? incidentStarted(started) : null,
                  resolved ? incidentResolved(resolved) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </Card>
          );
        })}
      </ul>
    </section>
  );
}

export default function StatusPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [problem, setProblem] = useState<StatusLoadProblem | null>(null);
  const [nextCheckAt, setNextCheckAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const failuresRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    async function load() {
      let nextProblem: StatusLoadProblem | null = null;
      try {
        const payload = await fetchStatus();
        if (cancelled) return;
        failuresRef.current = 0;
        setSnapshot({ payload, checkedAt: Date.now() });
      } catch (error: unknown) {
        console.error('[Status] check failed', error);
        if (cancelled) return;
        failuresRef.current += 1;
        nextProblem = problemFor(error);
      }
      setProblem(nextProblem);
      const delay = retryDelay(nextProblem, failuresRef.current);
      setNextCheckAt(Date.now() + delay);
      timer = window.setTimeout(() => void load(), delay);
    }

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadKey]);

  const retryNow = () => setReloadKey((key) => key + 1);

  const payload = snapshot?.payload ?? null;
  const services = payload ? rowsFor(payload, 'service') : [];
  const jobs = payload ? rowsFor(payload, 'job') : [];
  const checked = [...services, ...jobs];
  const notReported = checked.filter((row) => row.status === 'notChecked').length;

  const headlineKind: HeadlineKind = problem
    ? 'unavailable'
    : payload
      ? headlineFor(checked)
      : 'checking';
  const headline = HEADLINE[headlineKind];
  const showLists = Boolean(payload) || !problem;
  const listState: ListState = payload ? (services.length > 0 ? 'ready' : 'empty') : 'loading';
  const jobsState: ListState = payload ? (jobs.length > 0 ? 'ready' : 'empty') : 'loading';

  const network = payload?.network?.name ?? BUILD_NETWORK;
  const onTestNetwork = payload?.network ? !payload.network.isMainnet : IS_TEST_BUILD;
  const showIncidents = Boolean(payload) && !problem;
  const incidents = showIncidents && payload ? payload.incidents : [];
  const incidentsNotTracked = showIncidents && payload ? !payload.incidentsTracked : false;
  const uptimeNotRecorded =
    showIncidents && payload
      ? payload.components.every((component) => component.uptime90d === null)
      : false;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {onTestNetwork ? <SiteBanner kind="test-network" /> : null}
      <MarketingNav />
      <main className="flex-1">
        <PageContainer>
          <PageHeader title={STATUS_PAGE.title} description={STATUS_PAGE.description} />

          <div className="flex flex-col gap-8">
            <Panel>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-col gap-2" aria-live="polite">
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusPill status={headline.status} />
                      <p className="text-title-section text-ink">{headline.sentence}</p>
                    </div>
                    {problem ? (
                      <p className="text-small text-ink-secondary">{LOAD_PROBLEM[problem]}</p>
                    ) : null}
                  </div>
                  {snapshot ? (
                    <p className="text-small text-ink-secondary">
                      {problem ? (
                        <LastGoodCheck at={snapshot.checkedAt} />
                      ) : (
                        <CheckedAgo at={snapshot.checkedAt} />
                      )}
                      {problem ? null : ` ${UPDATES_EVERY}`}
                    </p>
                  ) : problem ? null : (
                    <Skeleton kind="text" lines={1} />
                  )}
                  {!problem && notReported > 0 ? (
                    <p className="text-small text-ink-secondary">
                      {notReportedCount(notReported, checked.length)}
                    </p>
                  ) : null}
                </div>
                <div className="self-start">
                  <NetworkCapsule network={network} />
                </div>
              </div>
              {problem ? (
                <div className="flex flex-col items-start gap-3">
                  {nextCheckAt !== null ? (
                    <p className="text-small text-ink-secondary">
                      <NextCheck at={nextCheckAt} />
                    </p>
                  ) : null}
                  <Button variant="secondary" size="sm" onClick={retryNow}>
                    {STATUS_PAGE.tryAgain}
                  </Button>
                </div>
              ) : null}
            </Panel>

            {showLists ? (
              <>
                <section aria-labelledby="status-services" className="flex flex-col gap-4">
                  <Heading level="section" id="status-services">
                    {STATUS_PAGE.servicesTitle}
                  </Heading>
                  <ServiceList
                    label={STATUS_PAGE.servicesLabel}
                    rows={services}
                    state={listState}
                  />
                </section>

                <section aria-labelledby="status-jobs" className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <Heading level="section" id="status-jobs">
                      {STATUS_PAGE.jobsTitle}
                    </Heading>
                    <p className="text-small text-ink-secondary">{STATUS_PAGE.jobsDescription}</p>
                  </div>
                  <ServiceList label={STATUS_PAGE.jobsLabel} rows={jobs} state={jobsState} />
                </section>
              </>
            ) : null}

            <Notice tone="info" title={STATUS_PAGE.moneyTitle}>
              {STATUS_PAGE.moneyLine}
            </Notice>

            {uptimeNotRecorded ? (
              <section aria-labelledby="status-uptime" className="flex flex-col gap-4">
                <Heading level="section" id="status-uptime">
                  {STATUS_PAGE.uptimeTitle}
                </Heading>
                <DashedCard>
                  <p className="text-small text-ink-secondary">{MOMENTS.uptimeNotRecorded}</p>
                </DashedCard>
              </section>
            ) : null}

            {incidentsNotTracked ? (
              <section aria-labelledby="status-incidents" className="flex flex-col gap-4">
                <Heading level="section" id="status-incidents">
                  {STATUS_PAGE.incidentsTitle}
                </Heading>
                <DashedCard>
                  <p className="text-small text-ink-secondary">{STATUS_PAGE.incidentsNotTracked}</p>
                </DashedCard>
              </section>
            ) : null}
            {incidents.length > 0 ? <IncidentList incidents={incidents} /> : null}
          </div>
        </PageContainer>
      </main>
      <MarketingFooter />
    </div>
  );
}
