/**
 * Grant API service - typed wrappers around the `/api/grants/*` surface.
 *
 * Every mutation attaches the canonical `x-user-address` header so the call
 * sites only see typed inputs / outputs. When `authFetch` lands, the migration
 * is a single-line swap inside this module: each `fetch(...)` becomes
 * `authFetch(...)` and pages stay unchanged.
 *
 * Backend surface (see `backend/src/api/grants.ts`):
 *   GET    /api/grants?creator=<addr>&showDeprecated=<bool>
 *   GET    /api/grants/:id
 *   POST   /api/grants/create
 *   GET    /api/grants/:id/funding-info
 *   POST   /api/grants/:id/confirm-funding
 *   POST   /api/grants/:id/release
 *   POST   /api/grants/:id/confirm-release
 *   POST   /api/grants/:id/pause
 *   POST   /api/grants/:id/confirm-pause
 *   POST   /api/grants/:id/cancel
 *   POST   /api/grants/:id/confirm-cancel
 *   POST   /api/grants/:id/transfer
 *   POST   /api/grants/:id/confirm-transfer
 */

const API_BASE_URL = '/api';

export type GrantStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export type GrantTokenType = 'BCH' | 'CASHTOKENS';
export type GrantMilestoneStatus = 'PENDING' | 'RELEASED' | 'CANCELLED';

export interface GrantActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  details?: Record<string, unknown> | null;
}

export interface GrantLatestEvent {
  event_type: string;
  status?: string | null;
  tx_hash?: string | null;
  created_at: number;
}

export interface GrantMilestoneRow {
  id: string;
  grant_id: string;
  milestone_index: number;
  title: string | null;
  description: string | null;
  status: GrantMilestoneStatus;
  tx_hash: string | null;
  released_at: number | null;
  created_at: number;
}

export interface GrantRow {
  id: string;
  grant_number: string;
  on_chain_campaign_id?: string | null;
  contract_address?: string | null;
  creator: string;
  recipient: string;
  title: string;
  description?: string | null;
  token_type: GrantTokenType;
  token_category?: string | null;
  vault_id?: string | null;
  milestones_total: number;
  milestones_completed: number;
  amount_per_milestone: number;
  total_amount: number;
  total_released: number;
  status: GrantStatus;
  cancelable: boolean;
  transferable: boolean;
  is_deprecated?: boolean;
  tx_hash?: string | null;
  created_at: number;
  updated_at: number;
  latest_event?: GrantLatestEvent | null;
}

export interface GrantListResponse {
  success: true;
  grants: GrantRow[];
  total: number;
}

export interface GrantDetailResponse {
  success: true;
  grant: GrantRow;
  milestones: GrantMilestoneRow[];
  events: GrantActivityEvent[];
}

export interface CreateGrantMilestoneInput {
  title?: string;
  description?: string;
}

export interface CreateGrantInput {
  title: string;
  description?: string;
  vaultId?: string;
  recipient: string;
  milestonesTotal: number;
  amountPerMilestone: number;
  totalAmount: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  cancelable?: boolean;
  transferable?: boolean;
  milestones: CreateGrantMilestoneInput[];
}

export interface CreateGrantResponse {
  success: true;
  message: string;
  grant: GrantRow;
  milestones: GrantMilestoneRow[];
  deployment: {
    contractAddress: string;
    grantNumber: string;
    onChainCampaignId: string;
    nftCommitment: string;
    fundingRequired: {
      toAddress: string;
      amount: number;
      tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
      tokenCategory?: string;
      tokenAmount?: number | string;
      withNFT: { commitment: string; capability: 'mutable' };
    };
  };
}

interface ApiErrorShape {
  message?: unknown;
  error?: unknown;
  userMessage?: unknown;
}

/**
 * Parse a fetch Response, throwing a typed Error on non-2xx. The parser is
 * defensive against text/HTML bodies (e.g. when an upstream proxy returns an
 * error page) so we never leak `[object Object]` to the user.
 */
async function parseJsonOrThrow(response: Response, fallback: string): Promise<unknown> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) return payload;

  const errorMessage = extractErrorMessage(payload, fallback);
  throw new Error(errorMessage);
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') return fallback;
  const record = payload as ApiErrorShape;
  const message =
    (typeof record.message === 'string' && record.message) ||
    (typeof record.error === 'string' && record.error) ||
    (typeof record.userMessage === 'string' && record.userMessage) ||
    fallback;
  return String(message);
}

/**
 * List grants created by a specific address. Returns the full payload so
 * callers can use the `total` count and any future top-level fields. Hides
 * deprecated grants by default; pass `showDeprecated` to include them.
 */
export async function fetchGrants(
  creator: string,
  options?: { showDeprecated?: boolean },
): Promise<GrantListResponse> {
  const qs = new URLSearchParams({ creator });
  if (options?.showDeprecated) qs.set('showDeprecated', 'true');

  const response = await fetch(`${API_BASE_URL}/grants?${qs.toString()}`);
  const payload = (await parseJsonOrThrow(response, 'Failed to fetch grants')) as Partial<GrantListResponse>;
  return {
    success: true,
    grants: Array.isArray(payload?.grants) ? payload.grants : [],
    total: typeof payload?.total === 'number' ? payload.total : 0,
  };
}

/**
 * Fetch a single grant with its ordered milestone list and the last 200
 * activity events. Returns 404 from the backend as a thrown Error.
 */
export async function fetchGrant(id: string): Promise<GrantDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/grants/${id}`);
  const payload = (await parseJsonOrThrow(response, 'Failed to fetch grant')) as Partial<GrantDetailResponse>;
  if (!payload?.grant) {
    throw new Error('Grant payload missing in API response');
  }
  return {
    success: true,
    grant: payload.grant as GrantRow,
    milestones: Array.isArray(payload?.milestones) ? payload.milestones as GrantMilestoneRow[] : [],
    events: Array.isArray(payload?.events) ? payload.events as GrantActivityEvent[] : [],
  };
}

/**
 * Deploy a new GrantCovenant. The backend generates a fresh claim authority
 * keypair (encrypted at rest) and returns the funding instructions that the
 * creator wallet must sign next via `fundGrantContract`.
 */
export async function createGrant(
  data: CreateGrantInput,
  userAddress: string,
): Promise<CreateGrantResponse> {
  const response = await fetch(`${API_BASE_URL}/grants/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  const payload = (await parseJsonOrThrow(response, 'Failed to create grant')) as CreateGrantResponse;
  return payload;
}
