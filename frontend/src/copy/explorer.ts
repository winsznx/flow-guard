import { NETWORK_COPY } from './network';
import { formatCount } from './format';
import type { StatusKey } from './status';

export type ExplorerRecordKind = 'vault' | 'stream' | 'payment' | 'airdrop' | 'proposal';
export type ExplorerScope = 'everyone' | 'you';
export type ExplorerLoadProblem = 'rateLimited' | 'server' | 'offline' | 'other';

const KIND_LABEL_BASE = {
  vault: { one: 'Vault', many: 'Vaults' },
  stream: { one: 'Stream', many: 'Streams' },
  payment: { one: 'Recurring payment', many: 'Recurring payments' },
  airdrop: { one: 'Airdrop', many: 'Airdrops' },
  proposal: { one: 'Spending request', many: 'Spending requests' },
} as const;

export const EXPLORER_PAGE = {
  title: 'Explorer',
  description: NETWORK_COPY.explorerExplainer,
  coverage: 'Showing vaults, streams, recurring payments, airdrops and spending requests.',
  elsewhere: "Bounties, rewards and grants aren't listed here yet. Read about them:",
  refresh: 'Refresh',
  refreshing: 'Refreshing',
  notUpdatedYet: 'Not updated yet',
} as const;

export function lastUpdate(relative: string): string {
  return `Last update ${relative}`;
}

export const EXPLORER_ELSEWHERE_LINKS = [
  { label: 'Bounties and rewards', path: '/use-cases#send-to-many' },
  { label: 'Grants', path: '/grants-info' },
] as const;

export const EXPLORER_SEARCH = {
  label: 'Search Explorer',
  placeholder: 'Search by name, address or transaction',
  hint: {
    address: 'Press Enter to see this address.',
    transaction: 'Press Enter to find the FlowGuard activity in this transaction.',
    text: 'Matches vault names, spending request reasons, addresses and IDs.',
  },
  failedTitle: "Search didn't work",
  clear: 'Clear search',
  transactionTitle: 'This transaction',
  transactionNone: 'No FlowGuard activity uses this transaction.',
  listLabel: 'Search results',
  inTransaction: 'FlowGuard activity in this transaction',
  matchingRecords: 'Matching records',
  noneTitle: (query: string) => `Nothing matches "${query}"`,
  noneLine:
    'Try a vault name, a stream ID or an address. Recurring payments and airdrops can only be found by transaction ID for now.',
} as const;

export function searchResultsFor(count: number, query: string): string {
  return `${formatCount(count, 'result', 'results')} for "${query}"`;
}

/** Record types the search `transactions` bucket can name, including the ones the feed doesn't list yet. */
export type ExplorerTransactionEntity =
  | 'stream'
  | 'payment'
  | 'airdrop'
  | 'reward'
  | 'bounty'
  | 'grant';

export const TRANSACTION_ENTITY_LABEL: Record<
  ExplorerTransactionEntity,
  { one: string; many: string }
> = {
  stream: KIND_LABEL_BASE.stream,
  payment: KIND_LABEL_BASE.payment,
  airdrop: KIND_LABEL_BASE.airdrop,
  reward: { one: 'Reward program', many: 'Reward programs' },
  bounty: { one: 'Bounty', many: 'Bounties' },
  grant: { one: 'Grant', many: 'Grants' },
};

export const TRANSACTION_TABLE = {
  record: 'Record',
  happened: 'What happened',
  when: 'When',
} as const;

/** Hidden text after "Open in app" so each row's link has its own name. */
export function openInAppFor(label: string, id: string): string {
  return ` (${label} ${id})`;
}

export function openEntityListInApp(entity: ExplorerTransactionEntity): string {
  return `Open ${TRANSACTION_ENTITY_LABEL[entity].many.toLowerCase()} in the app`;
}

export const EVENT_DRAWER = {
  label: 'Activity details',
  happened: 'What happened',
  when: 'When',
} as const;

export const EXPLORER_STATS = {
  vaults: 'Vaults',
  streams: 'Streams',
  requests: 'Spending requests',
  recent: 'New in the last 24 hours',
  recentSub: 'Vaults, streams and spending requests',
} as const;

export function vaultsRecentSub(count: number): string {
  return `${count} in the last 24 hours`;
}

export function streamsActiveSub(count: number): string {
  return `${count} active`;
}

export function requestsWaitingSub(count: number): string {
  return `${count} waiting for approval`;
}

export const EXPLORER_SCOPE = {
  label: 'Whose activity',
  options: [
    { value: 'everyone', label: 'Everyone' },
    { value: 'you', label: 'You' },
  ] as { value: ExplorerScope; label: string }[],
  connectTitle: 'Connect your wallet to see your activity',
  connectLine:
    "We'll show what this wallet sent or received, the vaults it created, its airdrops and the spending requests that pay it.",
  youLine:
    'What this wallet sent or received, the vaults it created, its airdrops and the spending requests that pay it.',
} as const;

export const EXPLORER_FILTERS = {
  typeLabel: 'Type',
  statusLabel: 'Status',
  anyStatus: 'Any status',
  autoUpdate: 'Auto-update',
  autoUpdateLine: "Checks for new activity every 30 seconds while you're at the top of the list.",
} as const;

export const KIND_LABEL: Record<ExplorerRecordKind, { one: string; many: string }> =
  KIND_LABEL_BASE;

export const ALL_TYPES = 'All';

/** Stored status values each type accepts as a filter, in the order the menu shows them. */
export const KIND_STATUSES: Record<ExplorerRecordKind, { value: string; status: StatusKey }[]> = {
  vault: [
    { value: 'DEPLOYED', status: 'active' },
    { value: 'CREATED', status: 'draft' },
  ],
  stream: [
    { value: 'ACTIVE', status: 'active' },
    { value: 'PENDING', status: 'notFunded' },
    { value: 'PAUSED', status: 'paused' },
    { value: 'COMPLETED', status: 'finished' },
    { value: 'CANCELLED', status: 'cancelled' },
  ],
  payment: [
    { value: 'ACTIVE', status: 'active' },
    { value: 'PENDING', status: 'notFunded' },
    { value: 'PAUSED', status: 'paused' },
    { value: 'COMPLETED', status: 'finished' },
    { value: 'CANCELLED', status: 'cancelled' },
  ],
  airdrop: [
    { value: 'ACTIVE', status: 'openForClaims' },
    { value: 'PENDING', status: 'notFunded' },
    { value: 'PAUSED', status: 'paused' },
    { value: 'COMPLETED', status: 'closed' },
    { value: 'CANCELLED', status: 'cancelled' },
  ],
  proposal: [
    { value: 'PENDING', status: 'waitingForApproval' },
    { value: 'APPROVED', status: 'approved' },
    { value: 'EXECUTED', status: 'paid' },
    { value: 'REJECTED', status: 'rejected' },
  ],
};

/** Name for a record with no name of its own: "Stream #FG-BCH-022". */
export function unnamedRecord(kind: ExplorerRecordKind, id: string): string {
  return `${KIND_LABEL[kind].one} ${id}`;
}

/** Fixed-length payment intervals, in the words VOICE 3.12 allows. */
export const PAYMENT_INTERVAL: Record<string, string> = {
  DAILY: 'every day',
  WEEKLY: 'every week',
  BIWEEKLY: 'every 2 weeks',
  MONTHLY: 'every 30 days',
  QUARTERLY: 'every 90 days',
  YEARLY: 'every 365 days',
};

export const EXPLORER_TABLE = {
  label: 'FlowGuard activity',
  name: 'Name',
  status: 'Status',
  from: 'From',
  to: 'To',
  amount: 'Amount',
  lastUpdate: 'Last update',
  timeNotRecorded: 'Time not recorded',
  nobody: 'None',
  claimList: 'Claim list',
  notRecorded: 'Not recorded',
  things: 'items',
} as const;

export function eventAt(word: string, when: string): string {
  return `${word} · ${when}`;
}

export function openListInApp(kind: ExplorerRecordKind): string {
  return `Open ${KIND_LABEL[kind].many.toLowerCase()} in the app`;
}

/** "Airdrop · " before a record ID, so the ID can be kept on one line. */
export function recordMetaPrefix(kind: ExplorerRecordKind): string {
  return `${KIND_LABEL[kind].one} · `;
}

export const EXPLORER_EMPTY = {
  everyoneTitle: 'Nothing here yet',
  everyoneLine: 'When people create vaults, streams or airdrops with FlowGuard, they show up here.',
  youTitle: 'Nothing for this wallet yet',
  youLine: "This wallet hasn't sent or received anything through FlowGuard yet.",
  youAction: 'Create stream',
} as const;

export const EXPLORER_ERRORS = {
  activityTitle: "Activity didn't load",
  statsTitle: "Totals didn't load",
  addressTitle: "This address didn't load",
  reason: {
    rateLimited: 'Too many requests from your network. Wait a minute, then try again.',
    server: "FlowGuard's server had a problem. Try again in a minute.",
    offline: "We couldn't reach FlowGuard. Check your connection.",
    other: 'Check your connection and try again.',
  } satisfies Record<ExplorerLoadProblem, string>,
} as const;

export const RECORD_DRAWER = {
  label: 'Record details',
  type: 'Type',
  id: 'ID',
  from: 'From',
  to: 'To',
  amount: 'Amount',
  howOften: 'How often',
  deposited: 'Deposited',
  created: 'Created',
  lastUpdate: 'Last update',
  contract: 'Contract address',
  vault: 'Vault',
  transaction: 'Transaction',
  copyId: 'Copy ID',
  openInApp: 'Open in app',
  openInAppLine: 'Opening it in the app asks you to connect a wallet.',
  openVault: 'Open the vault in the app',
  seeAddress: 'See this address',
  readOnly: 'Anyone can see this. Only the people involved can act on it.',
} as const;

export const ADDRESS_DRAWER = {
  label: 'Address details',
  title: 'Address',
  balance: 'Balance',
  vaultsCreated: 'Vaults they created',
  streamsSent: 'Streams sent',
  streamsReceived: 'Streams received',
  requestsPaying: 'Spending requests that pay them',
  streams: 'Streams',
  vaults: 'Vaults they created',
  noStreams: 'No streams for this address.',
  noVaults: 'No vaults created by this address.',
  partMissing: "This part didn't load. Try again in a minute.",
  countMissing: "Didn't load",
  sent: 'Sent',
  received: 'Received',
} as const;
