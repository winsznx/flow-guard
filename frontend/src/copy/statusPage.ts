import type { StatusKey } from './status';

export type IncidentState = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentSeverity = 'minor' | 'major' | 'critical' | 'maintenance';
export type HeadlineKind =
  | 'running'
  | 'slow'
  | 'down'
  | 'maintenance'
  | 'notReported'
  | 'unavailable'
  | 'checking';
export type StatusLoadProblem = 'rateLimited' | 'other';

export const STATUS_PAGE = {
  title: 'Status',
  description: "Whether FlowGuard's services are running right now.",
  servicesTitle: 'Services',
  servicesLabel: 'FlowGuard services',
  jobsTitle: 'Background jobs',
  jobsDescription: 'Work FlowGuard does on its own in the background.',
  jobsLabel: 'Background jobs',
  service: 'Service',
  state: 'Status',
  measured: 'Measured',
  notMeasured: 'Not measured',
  uptimeTitle: 'Uptime',
  moneyTitle: 'Your money stays on Bitcoin Cash',
  moneyLine:
    "Your money is held by contracts on Bitcoin Cash, not on FlowGuard's servers. If a service here is down, the money stays where it is.",
  incidentsTitle: 'Incidents',
  incidentsLabel: 'Recent incidents',
  incidentsNotTracked: "We don't track past incidents yet.",
  tryAgain: 'Try again',
  checking: 'Checking',
} as const;

export const HEADLINE: Record<HeadlineKind, { status: StatusKey; sentence: string }> = {
  running: { status: 'running', sentence: 'Everything is running.' },
  slow: { status: 'slow', sentence: 'Some things are slow.' },
  down: { status: 'down', sentence: 'Something is down.' },
  maintenance: { status: 'maintenance', sentence: 'Maintenance in progress.' },
  notReported: { status: 'notChecked', sentence: "Some checks didn't report." },
  unavailable: { status: 'notChecked', sentence: "We couldn't check right now." },
  checking: { status: 'notChecked', sentence: 'Checking our services.' },
};

export const LOAD_PROBLEM: Record<StatusLoadProblem, string> = {
  rateLimited: 'Too many checks came from your network.',
  other: "We couldn't reach FlowGuard's servers.",
};

export function checkedAt(relative: string): string {
  return `Checked ${relative}.`;
}

export function lastGoodCheck(relative: string): string {
  return `Showing the last good check, from ${relative}.`;
}

export const UPDATES_EVERY = 'Updates every 30 seconds.';

export function checkingAgainIn(duration: string): string {
  return `Checking again in ${duration}.`;
}

export function notReportedCount(count: number, total: number): string {
  return `${count} of ${total} checks didn't report.`;
}

export function respondsIn(ms: number): string {
  return ms < 1 ? 'Responds in under 1 ms' : `Responds in ${Math.round(ms)} ms`;
}

export function latestDataAt(relative: string): string {
  return `Latest Bitcoin Cash data from ${relative}`;
}

export function uptimeOver90Days(percent: number): string {
  const shown = percent >= 99.995 ? '100' : percent.toFixed(2).replace(/\.?0+$/, '');
  return `Up ${shown}% over the last 90 days`;
}

export function lastIncidentAt(relative: string): string {
  return `Last incident ${relative}`;
}

/** Plain names and lines for each component id the status endpoint returns. Unknown ids are not shown. */
export const SERVICE_COPY: Record<
  string,
  { name: string; line: string; group: 'service' | 'job' }
> = {
  frontend_app: {
    name: 'App',
    line: 'Where you create and manage vaults, streams and payments.',
    group: 'service',
  },
  api: { name: 'API', line: 'Powers the app and Explorer.', group: 'service' },
  explorer: {
    name: 'Explorer',
    line: 'The public list of everything created with FlowGuard.',
    group: 'service',
  },
  docs: { name: 'Docs', line: 'Guides and reference.', group: 'service' },
  bch_network: {
    name: 'Reading Bitcoin Cash data',
    line: 'How FlowGuard sees new payments and claims.',
    group: 'service',
  },
  database: {
    name: 'Database',
    line: "Stores FlowGuard's records. Your money is on Bitcoin Cash, not here.",
    group: 'service',
  },
  indexer: {
    name: 'Chain reader',
    line: 'Watches FlowGuard contracts on Bitcoin Cash for new activity.',
    group: 'job',
  },
  executor: {
    name: 'Scheduled tasks',
    line: "Checks which payments are due so the app can show them. It doesn't send anything.",
    group: 'job',
  },
  blockchain_monitor: {
    name: 'Vault balances',
    line: 'Keeps vault balances up to date.',
    group: 'job',
  },
  transaction_monitor: {
    name: 'Transaction checks',
    line: 'Checks that each transaction reached Bitcoin Cash.',
    group: 'job',
  },
  cycle_unlock_scheduler: {
    name: 'Vault spending periods',
    line: "Checks when each vault's next spending period can be opened. A signer opens it.",
    group: 'job',
  },
};

export const INCIDENT_STATE: Record<IncidentState, string> = {
  investigating: 'Looking into it',
  identified: 'Cause found',
  monitoring: 'Fix in place',
  resolved: 'Resolved',
};

export const INCIDENT_SEVERITY: Record<IncidentSeverity, string> = {
  minor: 'Minor',
  major: 'Major',
  critical: 'Critical',
  maintenance: 'Maintenance',
};

export function incidentStarted(when: string): string {
  return `Started ${when}`;
}

export function incidentResolved(when: string): string {
  return `Resolved ${when}`;
}
