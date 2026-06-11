/**
 * Typed API wrappers for the Bounty product family.
 *
 * Every mutating call attaches the canonical `x-user-address` header so that
 * the forthcoming `authFetch` migration becomes a one-line swap inside this
 * module - page-level call sites import these helpers and stay unchanged.
 *
 * Backend surface (see backend/src/api/bounties.ts):
 *   GET    /api/bounties?creator=<addr>&showDeprecated=<bool>
 *   GET    /api/bounties/:id
 *   POST   /api/bounties/create
 *   GET    /api/bounties/:id/funding-info
 *   POST   /api/bounties/:id/confirm-funding
 *   POST   /api/bounties/:id/claim
 *   POST   /api/bounties/:id/confirm-claim
 *   POST   /api/bounties/:id/pause
 *   POST   /api/bounties/:id/confirm-pause
 *   POST   /api/bounties/:id/cancel
 *   POST   /api/bounties/:id/confirm-cancel
 */

const API_BASE_URL = '/api';

export type BountyStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export type BountyTokenType = 'BCH' | 'CASHTOKENS';

export interface BountyActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  details?: Record<string, unknown> | null;
}

export interface BountyLatestEvent {
  event_type: string;
  status?: string | null;
  tx_hash?: string | null;
  created_at: number;
}

export interface BountyClaim {
  id: string;
  bounty_id: string;
  winner_address: string;
  amount: number;
  proof_hash: string | null;
  tx_hash: string;
  claimed_at: number;
}

export interface BountyRow {
  id: string;
  campaign_id: string;
  on_chain_campaign_id?: string | null;
  contract_address?: string | null;
  creator: string;
  title: string;
  description?: string | null;
  token_type: BountyTokenType;
  token_category?: string | null;
  reward_per_winner: number;
  max_winners: number;
  winners_count: number;
  total_paid: number;
  start_date: number;
  end_date: number | null;
  status: BountyStatus;
  cancelable: boolean;
  vault_id?: string | null;
  tx_hash?: string | null;
  created_at: number;
  updated_at: number;
  latest_event?: BountyLatestEvent | null;
}

export interface BountyListResponse {
  success: true;
  campaigns: BountyRow[];
  total: number;
}

export interface BountyDetailResponse {
  success: true;
  campaign: BountyRow;
  claims: BountyClaim[];
  events: BountyActivityEvent[];
}

export interface CreateBountyInput {
  creator: string;
  title: string;
  description?: string;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  rewardPerWinner: number;
  maxWinners: number;
  startDate?: number;
  endDate?: number;
  vaultId?: string;
}

export interface CreateBountyResponse {
  success: true;
  message: string;
  campaign: BountyRow;
  deployment: {
    contractAddress: string;
    campaignId: string;
    onChainCampaignId: string;
    nftCommitment: string;
    fundingRequired: {
      toAddress: string;
      amount: number;
      tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
      tokenCategory?: string;
      tokenAmount?: number;
      withNFT: { commitment: string; capability: 'mutable' };
    };
  };
}

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
  const record = payload as Record<string, unknown>;
  const message =
    (typeof record.message === 'string' && record.message) ||
    (typeof record.error === 'string' && record.error) ||
    (typeof record.userMessage === 'string' && record.userMessage) ||
    fallback;
  return String(message);
}

/**
 * List bounties created by a specific address. Returns the full payload so
 * callers can use the `total` count and any future top-level fields.
 */
export async function fetchBounties(
  creator: string,
  options?: { showDeprecated?: boolean }
): Promise<BountyListResponse> {
  const qs = new URLSearchParams({ creator });
  if (options?.showDeprecated) qs.set('showDeprecated', 'true');

  const response = await fetch(`${API_BASE_URL}/bounties?${qs.toString()}`);
  const payload = (await parseJsonOrThrow(response, 'Failed to fetch bounties')) as BountyListResponse;
  return {
    success: true,
    campaigns: Array.isArray(payload?.campaigns) ? payload.campaigns : [],
    total: typeof payload?.total === 'number' ? payload.total : 0,
  };
}

/**
 * Fetch a single bounty with full claim + activity history.
 */
export async function fetchBounty(id: string): Promise<BountyDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/bounties/${id}`);
  const payload = (await parseJsonOrThrow(response, 'Failed to fetch bounty')) as BountyDetailResponse;
  return {
    success: true,
    campaign: payload.campaign,
    claims: Array.isArray(payload?.claims) ? payload.claims : [],
    events: Array.isArray(payload?.events) ? payload.events : [],
  };
}

/**
 * Deploy a new BountyCovenant. Returns the freshly-created DB row and the
 * funding instructions needed for the wallet-signed funding round-trip.
 */
export async function createBounty(
  data: CreateBountyInput,
  userAddress: string
): Promise<CreateBountyResponse> {
  const response = await fetch(`${API_BASE_URL}/bounties/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  const payload = (await parseJsonOrThrow(response, 'Failed to create bounty')) as CreateBountyResponse;
  return payload;
}

interface SubmitClaimInput {
  winnerAddress: string;
  proofHash: string;
  signerAddress: string;
}

/**
 * Build the unsigned claim transaction. Only the creator may call this; the
 * backend co-signs the contract input with the stored claimAuthority key.
 *
 * The returned `wcTransaction` is intended to be deserialized + signed by the
 * creator wallet via `runLifecycleAction`. See `utils/blockchain.ts` for the
 * canonical wallet round-trip.
 */
export async function submitBountyClaim(
  id: string,
  input: SubmitClaimInput
): Promise<{ success: true; claimAmount: number; wcTransaction: unknown }> {
  const response = await fetch(`${API_BASE_URL}/bounties/${id}/claim`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': input.signerAddress,
    },
    body: JSON.stringify(input),
  });
  const payload = (await parseJsonOrThrow(response, 'Failed to build claim transaction')) as {
    success: true;
    claimAmount: number;
    wcTransaction: unknown;
  };
  return payload;
}
