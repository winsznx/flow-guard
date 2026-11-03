/**
 * Reward API service - typed wrappers around the /api/rewards/* surface.
 *
 * Every mutation attaches the canonical `x-user-address` header so the call
 * sites only see typed inputs/outputs. When `authFetch` lands, swap the
 * inline `fetch` for `authFetch` in one place per function.
 */

import { apiFailure, type ErrorCode } from '../copy/errors';

const API_BASE_URL = '/api';

export type RewardStatus = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED';
export type RewardTokenType = 'BCH' | 'FUNGIBLE_TOKEN' | 'CASHTOKENS';
export type RewardCategory = 'ACHIEVEMENT' | 'REFERRAL' | 'LOYALTY' | 'CUSTOM';

export interface RewardActivityEvent {
  id: string;
  event_type: string;
  actor: string | null;
  amount: number | null;
  status: string | null;
  tx_hash: string | null;
  created_at: number;
  details?: Record<string, unknown> | null;
}

export interface RewardRow {
  id: string;
  campaign_id: string;
  creator: string;
  title: string;
  description?: string | null;
  reward_category: RewardCategory;
  token_type: RewardTokenType;
  token_category?: string | null;
  token_decimals?: number | null;
  total_pool: number;
  max_reward_amount: number;
  distributed_total: number;
  distributed_count: number;
  start_date: number;
  end_date?: number | null;
  status: RewardStatus;
  vault_id?: string | null;
  contract_address?: string | null;
  tx_hash?: string | null;
  created_at: number;
  cancelable?: boolean;
  latest_event?: RewardActivityEvent | null;
}

export interface RewardDistributionRow {
  id: string;
  reward_id: string;
  recipient: string;
  amount: number;
  tx_hash: string;
  distributed_at: number;
}

export interface RewardListResponse {
  success: boolean;
  campaigns: RewardRow[];
  total: number;
}

export interface RewardDetailResponse {
  success: boolean;
  campaign: RewardRow;
  distributions: RewardDistributionRow[];
  events: RewardActivityEvent[];
}

export interface CreateRewardInput {
  title: string;
  description?: string;
  rewardCategory: RewardCategory;
  tokenType: RewardTokenType;
  tokenCategory?: string;
  tokenDecimals?: number;
  totalPool: number;
  maxRewardAmount: number;
  startDate?: number;
  endDate?: number;
  vaultId?: string;
}

export interface CreateRewardResponse {
  success: boolean;
  message: string;
  campaign: RewardRow;
  deployment: {
    contractAddress: string;
    campaignId: string;
    onChainCampaignId: string;
    fundingRequired: {
      toAddress: string;
      amount: number;
      tokenType?: RewardTokenType;
      tokenCategory?: string;
      tokenAmount?: string | number;
      withNFT: { commitment: string; capability: 'mutable' };
    };
    nftCommitment: string;
  };
}

export interface DistributeRewardInput {
  recipientAddress: string;
  amount: number;
  signerAddress?: string;
}

/**
 * Identity header. Backend filters and authorizes by wallet address; there is
 * no JWT today. Wrapped in a function so the future `authFetch` migration is
 * a one-line change here.
 */
function authHeaders(userAddress: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-user-address': userAddress,
  };
}

async function readJsonOrThrow<T>(response: Response, fallback: ErrorCode): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw apiFailure(payload, response.status, response.status === 404 ? 'NOT_FOUND' : fallback);
  }

  return payload as T;
}

export async function fetchRewards(creator: string, showDeprecated = false): Promise<RewardListResponse> {
  const qs = new URLSearchParams({ creator });
  if (showDeprecated) qs.set('showDeprecated', 'true');
  const response = await fetch(`${API_BASE_URL}/rewards?${qs.toString()}`);
  const payload = await readJsonOrThrow<RewardListResponse>(response, 'LOAD_FAILED');
  return {
    success: true,
    campaigns: Array.isArray(payload?.campaigns) ? payload.campaigns : [],
    total: typeof payload?.total === 'number' ? payload.total : 0,
  };
}

export async function fetchReward(id: string): Promise<RewardDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/rewards/${id}`);
  const payload = await readJsonOrThrow<RewardDetailResponse>(response, 'LOAD_FAILED');
  return {
    success: true,
    campaign: payload.campaign,
    distributions: Array.isArray(payload?.distributions) ? payload.distributions : [],
    events: Array.isArray(payload?.events) ? payload.events : [],
  };
}

export async function createReward(
  input: CreateRewardInput,
  userAddress: string,
): Promise<CreateRewardResponse> {
  const response = await fetch(`${API_BASE_URL}/rewards/create`, {
    method: 'POST',
    headers: authHeaders(userAddress),
    body: JSON.stringify(input),
  });
  return readJsonOrThrow<CreateRewardResponse>(response, 'UNKNOWN');
}
