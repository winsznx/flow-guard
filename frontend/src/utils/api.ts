import { authFetch, type WalletForAuth } from './auth';
import { CodedError, apiErrorDetails, apiFailure, flowFailure, rawErrorText, type ErrorCode } from '../copy/errors';

const API_BASE_URL = '/api';

/** Reads a failed response's body and throws its catalog error. Raw server text goes to details. */
export async function throwApiError(response: Response, fallback: ErrorCode): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  throw apiFailure(body, response.status, fallback);
}

/** A read of one record: a missing or private record isn't a connection problem. */
function readFailureCode(status: number): ErrorCode {
  if (status === 404) return 'NOT_FOUND';
  if (status === 403) return 'NO_ACCESS';
  return 'LOAD_FAILED';
}

export interface VaultsResponse {
  created: any[];
  signerIn: any[];
  public: any[];
  all: any[];
}

export async function fetchVaults(userAddress?: string): Promise<VaultsResponse> {
  const headers: HeadersInit = {};
  if (userAddress) {
    headers['x-user-address'] = userAddress;
  }

  const response = await fetch(`${API_BASE_URL}/vaults`, { headers });
  if (!response.ok) {
    await throwApiError(response, 'LOAD_FAILED');
  }
  return response.json();
}

export async function fetchVault(id: string, userAddress?: string): Promise<any> {
  const headers: HeadersInit = {};
  if (userAddress) {
    headers['x-user-address'] = userAddress;
  }

  const response = await fetch(`${API_BASE_URL}/vaults/${id}`, { headers });
  if (!response.ok) {
    await throwApiError(response, readFailureCode(response.status));
  }
  return response.json();
}

/**
 * Create a new vault. Goes through `authFetch`, which on first call per session
 * prompts the wallet for a SIWX login signature and caches a 30-minute bearer
 * - subsequent guarded calls reuse the bearer with no further wallet prompts.
 */
export async function createVault(data: any, wallet: WalletForAuth): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/vaults`, {
    wallet,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    await throwApiError(response, 'UNKNOWN');
  }
  return response.json();
}

export async function fetchProposals(vaultId: string, userAddress?: string | null): Promise<any[]> {
  const headers: Record<string, string> = {};
  if (userAddress) headers['x-user-address'] = userAddress;
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`, { headers });
  if (!response.ok) {
    await throwApiError(response, 'LOAD_FAILED');
  }
  return response.json();
}

export async function createProposal(
  vaultId: string,
  data: any,
  wallet: WalletForAuth,
): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`, {
    wallet,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    await throwApiError(response, 'UNKNOWN');
  }
  return response.json();
}

export async function addSigner(
  vaultId: string,
  signerAddress: string,
  wallet: WalletForAuth,
): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/vaults/${vaultId}/signers`, {
    wallet,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signerAddress }),
  });
  if (!response.ok) {
    await throwApiError(response, 'UNKNOWN');
  }
  return response.json();
}

export async function broadcastTransaction(
  txHex: string,
  wallet: WalletForAuth,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<{ txid: string; success: boolean }> {
  const response = await authFetch(`${API_BASE_URL}/transactions/broadcast`, {
    wallet,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ txHex, ...metadata }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === 'object' && 'diagnostics' in body) {
      console.debug('[api] Broadcast diagnostics:', body.diagnostics);
    }
    throw apiFailure(body, response.status, 'BROADCAST_REJECTED');
  }
  return response.json();
}

export async function getDepositInfo(vaultId: string, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/deposit`, {
    method: 'GET',
    headers: {
      'x-user-address': userAddress,
    },
  });
  if (!response.ok) {
    await throwApiError(response, 'SERVER_PREPARE_FAILED');
  }
  return response.json();
}

/**
 * The deposit is already on the network when this runs, so a failure here is never a
 * failed deposit: it throws SENT_NOT_SYNCED with the transaction, and the page keeps
 * checking instead of offering a second deposit.
 */
export async function updateVaultBalance(
  vaultId: string,
  txid: string,
  amount: number,
  wallet: WalletForAuth,
): Promise<any> {
  const maxAttempts = 8;
  const baseDelayMs = 1200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await authFetch(`${API_BASE_URL}/vaults/${vaultId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ txHash: txid, amount }),
      });
    } catch (error) {
      throw depositNotSynced(txid, rawErrorText(error));
    }

    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      return payload;
    }

    const retryablePending = response.status === 409 && payload?.retryable === true;
    if (!retryablePending || attempt === maxAttempts) {
      throw depositNotSynced(txid, apiErrorDetails(payload, response.status));
    }

    const waitMs = Math.min(baseDelayMs * attempt, 5000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw depositNotSynced(txid);
}

function depositNotSynced(txid: string, details?: string): CodedError {
  return flowFailure('SENT_NOT_SYNCED', { params: { outcome: 'deposit' }, txid, details });
}

// Streams API
export async function fetchStreams(params: { sender?: string; recipient?: string; status?: string }): Promise<any> {
  const qs = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${API_BASE_URL}/streams?${qs}`);
  if (!response.ok) await throwApiError(response, 'LOAD_FAILED');
  return response.json();
}

export async function fetchPayments(params: { sender?: string; recipient?: string }): Promise<any> {
  const qs = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${API_BASE_URL}/payments?${qs}`);
  if (!response.ok) await throwApiError(response, 'LOAD_FAILED');
  return response.json();
}

// Budget Plans API
export async function createBudgetPlan(
  vaultId: string,
  data: any,
  wallet: WalletForAuth,
): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/vaults/${vaultId}/budget-plans`, {
    wallet,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    await throwApiError(response, 'UNKNOWN');
  }
  return response.json();
}

export async function fetchBudgetPlans(vaultId?: string): Promise<any[]> {
  const url = vaultId
    ? `${API_BASE_URL}/vaults/${vaultId}/budget-plans`
    : `${API_BASE_URL}/budget-plans`;

  const response = await fetch(url);
  if (!response.ok) {
    await throwApiError(response, 'LOAD_FAILED');
  }
  return response.json();
}

