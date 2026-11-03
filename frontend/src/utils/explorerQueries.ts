/**
 * Typed fetch wrappers for the Explorer endpoints in backend/src/api/explorer-advanced.ts.
 * Every fetcher throws ExplorerApiError, with status 0 when the request never got a response,
 * so pages can map the cause to plain copy and keep the raw detail out of the UI.
 * Responses are read field by field: a missing or malformed field becomes null (or drops the row)
 * instead of reaching the page with the wrong shape.
 */

import type { ExplorerLoadProblem, ExplorerTransactionEntity } from '../copy/explorer';

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

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
      return body.error;
  } catch (parseError) {
    return parseError instanceof Error
      ? `${response.statusText} (${parseError.message})`
      : response.statusText;
  }
  return response.statusText;
}

async function fetchJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`);
  } catch (networkError) {
    throw new ExplorerApiError(
      networkError instanceof Error ? networkError.message : 'Network error',
      0,
      path
    );
  }
  if (!response.ok) {
    throw new ExplorerApiError(await readErrorDetail(response), response.status, path);
  }
  try {
    return (await response.json()) as unknown;
  } catch (parseError) {
    throw new ExplorerApiError(
      parseError instanceof Error ? parseError.message : 'Unreadable response',
      response.status,
      path
    );
  }
}

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldsOf(value: unknown): Fields {
  return isFields(value) ? value : {};
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readId(value: unknown): string | null {
  if (typeof value === 'string' && value !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readTime(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Rows that can't be read are dropped; a missing list is null so the page can tell it apart from an empty one. */
function readRows<T>(value: unknown, readRow: (fields: Fields) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const rows: T[] = [];
  for (const item of value) {
    if (!isFields(item)) continue;
    const row = readRow(item);
    if (row !== null) rows.push(row);
  }
  return rows;
}

export function explorerLoadProblem(error: unknown): ExplorerLoadProblem {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (!(error instanceof ExplorerApiError)) return 'other';
  if (error.status === 429) return 'rateLimited';
  if (error.status >= 500) return 'server';
  if (error.status === 0) return 'offline';
  return 'other';
}

type QueryValue = string | number | boolean | undefined | null;

function toQueryString(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export interface ExplorerStatsCounts {
  total: number | null;
  active: number | null;
  recent24h: number | null;
}

export interface ExplorerStatsResponse {
  vaults: ExplorerStatsCounts;
  streams: ExplorerStatsCounts;
  proposals: ExplorerStatsCounts;
}

function readStatsCounts(value: unknown): ExplorerStatsCounts {
  const fields = fieldsOf(value);
  return {
    total: readNumber(fields.total),
    active: readNumber(fields.active),
    recent24h: readNumber(fields.recent24h),
  };
}

export async function getExplorerStats(): Promise<ExplorerStatsResponse> {
  const flowguard = fieldsOf(fieldsOf(await fetchJson('/explorer/stats')).flowguard);
  return {
    vaults: readStatsCounts(flowguard.vaults),
    streams: readStatsCounts(flowguard.streams),
    proposals: readStatsCounts(flowguard.proposals),
  };
}

export type ExplorerTxType = 'VAULT' | 'STREAM' | 'PAYMENT' | 'AIRDROP' | 'PROPOSAL';

const TX_TYPES: readonly ExplorerTxType[] = ['VAULT', 'STREAM', 'PAYMENT', 'AIRDROP', 'PROPOSAL'];

export interface ExplorerLatestEvent {
  entity_id: string | null;
  event_type: string;
  tx_hash: string | null;
  created_at: string | number | null;
}

export interface ExplorerTransactionRow {
  id: string;
  name: string | null;
  sender: string | null;
  recipient: string | null;
  amount: number | null;
  token_type: string | null;
  token_category: string | null;
  tx_type: ExplorerTxType;
  status: string;
  created_at: number | string | null;
  tx_hash: string | null;
  contract_address: string | null;
  vault_id: string | null;
  latest_event: ExplorerLatestEvent | null;
}

export interface ExplorerTransactionsResponse {
  transactions: ExplorerTransactionRow[];
  total: number;
  /** Rows on this page that couldn't be read and were left out. */
  dropped: number;
}

function readLatestEvent(value: unknown): ExplorerLatestEvent | null {
  if (!isFields(value)) return null;
  const eventType = readString(value.event_type);
  if (!eventType) return null;
  return {
    entity_id: readId(value.entity_id),
    event_type: eventType,
    tx_hash: readString(value.tx_hash),
    created_at: readTime(value.created_at),
  };
}

function readTransactionRow(fields: Fields): ExplorerTransactionRow | null {
  const id = readId(fields.id);
  const txType = TX_TYPES.find((type) => type === fields.tx_type);
  if (!id || !txType) return null;
  return {
    id,
    name: readString(fields.name),
    sender: readString(fields.sender),
    recipient: readString(fields.recipient),
    amount: readNumber(fields.amount),
    token_type: readString(fields.token_type),
    token_category: readString(fields.token_category),
    tx_type: txType,
    status: readString(fields.status) ?? '',
    created_at: readTime(fields.created_at),
    tx_hash: readString(fields.tx_hash),
    contract_address: readString(fields.contract_address),
    vault_id: readId(fields.vault_id),
    latest_event: readLatestEvent(fields.latest_event),
  };
}

export type ExplorerSortField = 'time' | 'amount' | 'type' | 'status';
export type ExplorerSortOrder = 'asc' | 'desc';

export interface ExplorerTransactionsQuery {
  type?: 'vault' | 'stream' | 'payment' | 'airdrop' | 'proposal';
  status?: string;
  address?: string;
  sort?: ExplorerSortField;
  order?: ExplorerSortOrder;
  limit?: number;
  offset?: number;
}

export async function getExplorerTransactions(
  query: ExplorerTransactionsQuery = {}
): Promise<ExplorerTransactionsResponse> {
  const path = `/explorer/transactions${toQueryString({ ...query })}`;
  const fields = fieldsOf(await fetchJson(path));
  const transactions = readRows(fields.transactions, readTransactionRow);
  if (transactions === null)
    throw new ExplorerApiError('Response has no transactions list', 200, path);
  const sent = Array.isArray(fields.transactions) ? fields.transactions.length : 0;
  return {
    transactions,
    total: Math.max(readNumber(fields.total) ?? 0, transactions.length),
    dropped: sent - transactions.length,
  };
}

export interface ExplorerAddressVault {
  vault_id: string;
  name: string | null;
  creator: string | null;
  contract_address: string | null;
  total_deposit: number | null;
  created_at: string | number | null;
}

export interface ExplorerAddressStream {
  /** The stream's record UUID, which activity events use as `entity_id`. Null until the endpoint returns it. */
  id: string | null;
  stream_id: string;
  sender: string | null;
  recipient: string | null;
  total_amount: number | null;
  token_type: string | null;
  token_category: string | null;
  status: string;
  created_at: string | number | null;
}

export interface ExplorerAddressProposal {
  id: string;
  vault_id: string | null;
  recipient: string | null;
  amount: number | null;
  reason: string | null;
  status: string;
  created_at: string | number | null;
}

/** Every part is null when the server left it out, so the drawer can say that part didn't load. */
export interface ExplorerAddressResponse {
  balance: number | null;
  activity: {
    vaultsCreated: number | null;
    streamsSent: number | null;
    streamsReceived: number | null;
    proposalsReceived: number | null;
  };
  vaults: ExplorerAddressVault[] | null;
  streams: {
    sent: ExplorerAddressStream[] | null;
    received: ExplorerAddressStream[] | null;
  };
  proposals: ExplorerAddressProposal[] | null;
}

function readVault(fields: Fields): ExplorerAddressVault | null {
  const id = readId(fields.vault_id);
  if (!id) return null;
  return {
    vault_id: id,
    name: readString(fields.name),
    creator: readString(fields.creator),
    contract_address: readString(fields.contract_address),
    total_deposit: readNumber(fields.total_deposit),
    created_at: readTime(fields.created_at),
  };
}

function readStream(fields: Fields): ExplorerAddressStream | null {
  const id = readId(fields.stream_id);
  if (!id) return null;
  return {
    id: readId(fields.id),
    stream_id: id,
    sender: readString(fields.sender),
    recipient: readString(fields.recipient),
    total_amount: readNumber(fields.total_amount),
    token_type: readString(fields.token_type),
    token_category: readString(fields.token_category),
    status: readString(fields.status) ?? '',
    created_at: readTime(fields.created_at),
  };
}

function readProposal(fields: Fields): ExplorerAddressProposal | null {
  const id = readId(fields.id);
  if (!id) return null;
  return {
    id,
    vault_id: readId(fields.vault_id),
    recipient: readString(fields.recipient),
    amount: readNumber(fields.amount),
    reason: readString(fields.reason),
    status: readString(fields.status) ?? '',
    created_at: readTime(fields.created_at),
  };
}

export async function getExplorerAddress(address: string): Promise<ExplorerAddressResponse> {
  const fields = fieldsOf(await fetchJson(`/explorer/address/${encodeURIComponent(address)}`));
  const activity = fieldsOf(fields.activity);
  const streams = fieldsOf(fields.streams);
  return {
    balance: readNumber(fields.balance),
    activity: {
      vaultsCreated: readNumber(activity.vaultsCreated),
      streamsSent: readNumber(activity.streamsSent),
      streamsReceived: readNumber(activity.streamsReceived),
      proposalsReceived: readNumber(activity.proposalsReceived),
    },
    vaults: readRows(fields.vaults, readVault),
    streams: {
      sent: readRows(streams.sent, readStream),
      received: readRows(streams.received, readStream),
    },
    proposals: readRows(fields.proposals, readProposal),
  };
}

const SEARCH_ENTITIES: readonly ExplorerTransactionEntity[] = [
  'stream',
  'payment',
  'airdrop',
  'reward',
  'bounty',
  'grant',
];

/** One FlowGuard event recorded against a transaction ID, from the search `transactions` bucket. */
export interface ExplorerSearchTransaction {
  tx_hash: string;
  entity_type: ExplorerTransactionEntity;
  entity_id: string;
  event_type: string;
  created_at: string | number | null;
}

export interface ExplorerSearchResponse {
  vaults: ExplorerAddressVault[];
  streams: ExplorerAddressStream[];
  proposals: ExplorerAddressProposal[];
  transactions: ExplorerSearchTransaction[];
}

function readSearchTransaction(fields: Fields): ExplorerSearchTransaction | null {
  const txHash = readString(fields.tx_hash);
  const entityId = readId(fields.entity_id);
  const entityType = SEARCH_ENTITIES.find(
    (entity) => entity === readString(fields.entity_type)?.toLowerCase()
  );
  if (!txHash || !entityId || !entityType) return null;
  return {
    tx_hash: txHash,
    entity_type: entityType,
    entity_id: entityId,
    event_type: readString(fields.event_type) ?? '',
    created_at: readTime(fields.created_at),
  };
}

export async function searchExplorer(query: string): Promise<ExplorerSearchResponse> {
  const results = fieldsOf(
    fieldsOf(await fetchJson(`/explorer/search${toQueryString({ q: query })}`)).results
  );
  return {
    vaults: readRows(results.vaults, readVault) ?? [],
    streams: readRows(results.streams, readStream) ?? [],
    proposals: readRows(results.proposals, readProposal) ?? [],
    transactions: readRows(results.transactions, readSearchTransaction) ?? [],
  };
}

export function looksLikeBchAddress(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  return /^(?:(?:bitcoincash|bchtest|bchreg):)?[qpzr][a-z0-9]{40,90}$/.test(trimmed);
}

export function looksLikeTxHash(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value.trim());
}

export type DetectedQueryKind = 'address' | 'transaction' | 'text';

export function detectQueryKind(value: string): DetectedQueryKind {
  const trimmed = value.trim();
  if (looksLikeBchAddress(trimmed)) return 'address';
  if (looksLikeTxHash(trimmed)) return 'transaction';
  return 'text';
}

/**
 * Security test records sit in the public mainnet data until they're purged (PLAN 5.2).
 * The Explorer hides them by name meanwhile.
 */
const TEST_RECORD_NAME = /ABTEST-SECURITY-TEST|PLEASE-PURGE/i;

export function isHiddenTestRecord(name: string | null | undefined): boolean {
  return Boolean(name && TEST_RECORD_NAME.test(name));
}

export interface StreamActivityStream {
  stream_id: string;
  vault_id?: string | null;
  sender: string;
  recipient: string;
  stream_type: string;
  schedule_template?: string | null;
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
  eventType?: string;
  limit?: number;
  page?: number;
}

export async function getStreamActivity(
  query: StreamActivityQuery = {}
): Promise<StreamActivityResponse> {
  return (await fetchJson(
    `/streams/activity${toQueryString({ ...query })}`
  )) as StreamActivityResponse;
}
