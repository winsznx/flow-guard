/**
 * Typed fetch wrappers for the FlowGuard Explorer backend.
 *
 * Mirrors the response shapes documented in backend/src/api/explorer.ts and
 * backend/src/api/explorer-advanced.ts so the page can drop every `any` cast.
 *
 * All fetchers normalise paths through a single `/api` prefix and throw
 * `ExplorerApiError` on non-2xx responses so callers can render specific
 * empty / error states.
 */

const API_BASE = '/api';

export class ExplorerApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'ExplorerApiError';
    this.status = status;
    this.path = path;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = await response.json();
      if (body?.error && typeof body.error === 'string') detail = body.error;
    } catch {
      // body might not be JSON - swallow and surface statusText.
    }
    throw new ExplorerApiError(detail, response.status, path);
  }
  return (await response.json()) as T;
}

type QueryValue = string | number | boolean | undefined | null;

function toQueryString(params: Record<string, QueryValue> | object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, QueryValue>)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/stats                                             */
/* ------------------------------------------------------------------ */

export interface ExplorerStatsResponse {
  network: {
    blockHeight: number;
    network: 'chipnet' | 'mainnet' | string;
  };
  flowguard: {
    vaults: { total: number; totalValue: number; recent24h: number };
    streams: { total: number; active: number; totalVolume: number; recent24h: number };
    proposals: { total: number; active: number; totalAmount: number; recent24h: number };
  };
}

export function getExplorerStats(): Promise<ExplorerStatsResponse> {
  return fetchJson<ExplorerStatsResponse>('/explorer/stats');
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/transactions                                      */
/* ------------------------------------------------------------------ */

export type ExplorerTxType = 'VAULT' | 'STREAM' | 'PAYMENT' | 'AIRDROP' | 'PROPOSAL';
export type ExplorerTokenType = 'BCH' | 'CASHTOKENS' | string;

export interface ExplorerLatestEvent {
  event_type: string;
  status?: string | null;
  tx_hash?: string | null;
  created_at: string | number;
}

export interface ExplorerTransactionRow {
  id: string;
  name?: string | null;
  sender?: string | null;
  recipient?: string | null;
  amount: number;
  token_type?: ExplorerTokenType | null;
  token_category?: string | null;
  tx_type: ExplorerTxType;
  status: string;
  created_at: number;
  tx_hash?: string | null;
  contract_address?: string | null;
  vault_id?: string | null;
  latest_event?: ExplorerLatestEvent | null;
}

export interface ExplorerTransactionsResponse {
  transactions: ExplorerTransactionRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ExplorerTransactionsQuery {
  type?: 'vault' | 'stream' | 'payment' | 'airdrop' | 'proposal';
  status?: string;
  address?: string;
  minAmount?: number;
  maxAmount?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function getExplorerTransactions(
  query: ExplorerTransactionsQuery = {},
): Promise<ExplorerTransactionsResponse> {
  return fetchJson<ExplorerTransactionsResponse>(
    `/explorer/transactions${toQueryString(query)}`,
  );
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/address/:address                                  */
/* ------------------------------------------------------------------ */

export interface ExplorerAddressVault {
  vault_id: string;
  id?: string;
  name: string;
  creator: string;
  contract_address?: string | null;
  total_deposit: number;
  created_at: string | number;
}

export interface ExplorerAddressStream {
  id?: string;
  stream_id: string;
  sender: string;
  recipient: string;
  total_amount: number;
  status: string;
  stream_type?: string;
  created_at: string | number;
}

export interface ExplorerAddressProposal {
  id: string;
  vault_id: string;
  recipient: string;
  amount: number;
  reason?: string | null;
  status: string;
  created_at: string | number;
}

export interface ExplorerAddressResponse {
  address: string;
  balance: number;
  balanceSat: number;
  activity: {
    vaultsCreated: number;
    vaultsAsSigner: number;
    streamsSent: number;
    streamsReceived: number;
    proposalsReceived: number;
  };
  totals: {
    sent: number;
    received: number;
    proposed: number;
  };
  vaults: ExplorerAddressVault[];
  streams: {
    sent: ExplorerAddressStream[];
    received: ExplorerAddressStream[];
  };
  proposals: ExplorerAddressProposal[];
}

export function getExplorerAddress(address: string): Promise<ExplorerAddressResponse> {
  return fetchJson<ExplorerAddressResponse>(`/explorer/address/${encodeURIComponent(address)}`);
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/contract/:address                                 */
/* ------------------------------------------------------------------ */

export interface ExplorerContractResponse {
  contract: {
    address: string;
    type: string;
    balance: number;
    balanceSat: number;
    utxoCount: number;
  };
  vault: {
    id: string;
    name: string;
    creator: string;
    signerCount: number;
    approvalThreshold: number;
    totalDeposit: number;
    createdAt: string | number;
  };
  stats: {
    proposalCount: number;
    pendingProposals: number;
    totalProposed: number;
    totalExecuted: number;
    cycleCount: number;
    transactionCount: number;
  };
  proposals: ExplorerAddressProposal[];
  cycles: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
}

export function getExplorerContract(address: string): Promise<ExplorerContractResponse> {
  return fetchJson<ExplorerContractResponse>(`/explorer/contract/${encodeURIComponent(address)}`);
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/search                                            */
/* ------------------------------------------------------------------ */

export interface ExplorerSearchResponse {
  query: string;
  results: {
    vaults: ExplorerAddressVault[];
    streams: ExplorerAddressStream[];
    proposals: ExplorerAddressProposal[];
    addresses: Array<{ address: string }>;
  };
  totalResults: number;
}

export function searchExplorer(query: string): Promise<ExplorerSearchResponse> {
  return fetchJson<ExplorerSearchResponse>(`/explorer/search${toQueryString({ q: query })}`);
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/timeline                                          */
/* ------------------------------------------------------------------ */

export type ExplorerTimelineEventType =
  | 'VAULT_CREATED'
  | 'STREAM_CREATED'
  | 'PROPOSAL_CREATED';

export interface ExplorerTimelineEvent {
  type: ExplorerTimelineEventType;
  id: string;
  name?: string | null;
  creator?: string | null;
  sender?: string | null;
  recipient?: string | null;
  vaultId?: string | null;
  reason?: string | null;
  amount: number;
  timestamp: string | number;
}

export interface ExplorerTimelineResponse {
  timeline: ExplorerTimelineEvent[];
  total: number;
  limit: number;
  offset: number;
}

export function getExplorerTimeline(
  query: { limit?: number; offset?: number } = {},
): Promise<ExplorerTimelineResponse> {
  return fetchJson<ExplorerTimelineResponse>(`/explorer/timeline${toQueryString(query)}`);
}

/* ------------------------------------------------------------------ */
/* GET /api/explorer/activity (legacy aggregate feed)                  */
/* ------------------------------------------------------------------ */

export type ExplorerActivityType = 'STREAM' | 'PAYMENT' | 'AIRDROP' | 'TREASURY';

export interface ExplorerActivityRow {
  id: string;
  stream_id: string;
  sender: string;
  recipient: string;
  token_type: string;
  token_category?: string | null;
  total_amount: number;
  vested_amount: number;
  progress_percentage: number;
  stream_type: string;
  status: string;
  created_at: number;
  activity_type: ExplorerActivityType;
}

export interface ExplorerActivityResponse {
  streams: ExplorerActivityRow[];
  stats: {
    totalVolume: number;
    activeCount: number;
    completedCount: number;
    totalCount: number;
  };
}

export interface ExplorerActivityQuery {
  type?: 'vesting' | 'payments' | 'airdrops' | 'treasuries';
  token?: string;
  status?: string;
  limit?: number;
}

export function getExplorerActivity(
  query: ExplorerActivityQuery = {},
): Promise<ExplorerActivityResponse> {
  return fetchJson<ExplorerActivityResponse>(`/explorer/activity${toQueryString(query)}`);
}

/* ------------------------------------------------------------------ */
/* GET /api/streams/activity - canonical event-sourced feed            */
/* ------------------------------------------------------------------ */

export interface StreamActivityStream {
  stream_id: string;
  vault_id?: string | null;
  sender: string;
  recipient: string;
  stream_type: string;
  schedule_template?: string | null;
  launch_context?: {
    source: string;
    title?: string;
    description?: string;
    preferredLane?: string;
  } | null;
}

export interface StreamActivityEvent {
  id: string;
  entity_id: string;
  entity_type?: 'stream' | 'payment' | 'airdrop' | 'reward' | 'bounty' | 'grant';
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  details?: unknown;
  created_at: number;
  stream: StreamActivityStream;
}

export interface StreamActivityResponse {
  success?: boolean;
  events: StreamActivityEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface StreamActivityQuery {
  address?: string;
  vaultId?: string;
  treasury?: boolean;
  contextSource?: string;
  eventType?: string;
  dateFrom?: number | string;
  dateTo?: number | string;
  limit?: number;
  page?: number;
}

export function getStreamActivity(
  query: StreamActivityQuery = {},
): Promise<StreamActivityResponse> {
  return fetchJson<StreamActivityResponse>(`/streams/activity${toQueryString(query)}`);
}

/* ------------------------------------------------------------------ */
/* Local helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Coerce a created_at field that may be (a) unix seconds, (b) unix
 * milliseconds, or (c) an ISO string into a millisecond timestamp.
 */
export function toUnixMs(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return NaN;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1_000_000_000_000 ? value : value * 1000;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Best-effort detection of a Bitcoin Cash address. Accepts mainnet and
 * chipnet prefixes plus prefixless cashaddrs.
 */
export function looksLikeBchAddress(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (/^bitcoincash:[qpzr][a-z0-9]{40,90}$/.test(trimmed)) return true;
  if (/^bchtest:[qpzr][a-z0-9]{40,90}$/.test(trimmed)) return true;
  if (/^bchreg:[qpzr][a-z0-9]{40,90}$/.test(trimmed)) return true;
  if (/^[qpzr][a-z0-9]{40,90}$/.test(trimmed)) return true;
  return false;
}

/** Best-effort detection of a Bitcoin Cash transaction hash. */
export function looksLikeTxHash(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

/** Best-effort detection of a CashTokens category (32-byte hex). */
export function looksLikeTokenCategory(value: string): boolean {
  return looksLikeTxHash(value);
}

export type DetectedQueryKind = 'address' | 'tx' | 'category' | 'text';

export function detectQueryKind(value: string): DetectedQueryKind {
  const trimmed = value.trim();
  if (!trimmed) return 'text';
  if (looksLikeBchAddress(trimmed)) return 'address';
  if (looksLikeTxHash(trimmed)) return 'tx';
  if (looksLikeTokenCategory(trimmed)) return 'category';
  return 'text';
}
