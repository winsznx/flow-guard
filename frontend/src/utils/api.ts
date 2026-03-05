const API_BASE_URL = '/api';

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
    throw new Error('Failed to fetch vaults');
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
    if (response.status === 403) {
      throw new Error('Access denied: This vault is private');
    }
    throw new Error('Failed to fetch vault');
  }
  return response.json();
}

export async function createVault(data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create vault');
  }
  return response.json();
}

export async function fetchProposals(vaultId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`);
  if (!response.ok) {
    throw new Error('Failed to fetch proposals');
  }
  return response.json();
}

export async function createProposal(
  vaultId: string,
  data: any,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/proposals`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error('Failed to create proposal');
  }
  return response.json();
}

export async function approveProposal(
  proposalId: string,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/proposals/${proposalId}/approve`, {
    method: 'POST',
    headers: {
      'x-user-address': userAddress,
    },
  });
  if (!response.ok) {
    throw new Error('Failed to approve proposal');
  }
  return response.json();
}

export async function addSigner(
  vaultId: string,
  signerAddress: string,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/signers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify({ signerAddress }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to add signer' }));
    throw new Error(error.error || 'Failed to add signer');
  }
  return response.json();
}

export async function broadcastTransaction(
  txHex: string,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<{ txid: string; success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/transactions/broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ txHex, ...metadata }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to broadcast transaction' }));
    const base = error.userMessage || error.message || error.error || 'Failed to broadcast transaction';
    const diagnostics = error?.debug?.diagnostics ?? error?.diagnostics;
    if (diagnostics) {
      throw new Error(`${base}\n\nDiagnostics: ${JSON.stringify(diagnostics)}`);
    }
    throw new Error(base);
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
    const error = await response.json().catch(() => ({ error: 'Failed to get deposit info' }));
    throw new Error(error.error || 'Failed to get deposit info');
  }
  return response.json();
}

export async function updateVaultBalance(
  vaultId: string,
  txid: string,
  amount: number,
  userAddress: string
): Promise<any> {
  const maxAttempts = 8;
  const baseDelayMs = 1200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/confirm-funding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': userAddress,
      },
      body: JSON.stringify({ txHash: txid, amount }),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      return payload;
    }

    const retryablePending = response.status === 409 && payload?.retryable === true;
    if (!retryablePending || attempt === maxAttempts) {
      throw new Error(payload.error || payload.message || 'Failed to update vault balance');
    }

    const waitMs = Math.min(baseDelayMs * attempt, 5000);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error('Failed to update vault balance');
}

// Streams API
export async function fetchStreams(params: { sender?: string; recipient?: string; status?: string }): Promise<any> {
  const qs = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${API_BASE_URL}/streams?${qs}`);
  if (!response.ok) throw new Error('Failed to fetch streams');
  return response.json();
}

export async function fetchStream(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/streams/${id}`);
  if (!response.ok) throw new Error('Failed to fetch stream');
  return response.json();
}

export async function createStream(data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/streams/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': userAddress },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create stream');
  return response.json();
}

export async function claimStream(id: string, amount?: number): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/streams/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) throw new Error('Failed to claim stream');
  return response.json();
}

export async function cancelStream(id: string, sender: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/streams/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender }),
  });
  if (!response.ok) throw new Error('Failed to cancel stream');
  return response.json();
}

// Payments API
export async function fetchPayments(params: { sender?: string; recipient?: string }): Promise<any> {
  const qs = new URLSearchParams(params as Record<string, string>);
  const response = await fetch(`${API_BASE_URL}/payments?${qs}`);
  if (!response.ok) throw new Error('Failed to fetch payments');
  return response.json();
}

export async function fetchPayment(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/${id}`);
  if (!response.ok) throw new Error('Failed to fetch payment');
  return response.json();
}

export async function createPayment(data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': userAddress },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create payment');
  return response.json();
}

export async function pausePayment(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/${id}/pause`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to pause payment');
  return response.json();
}

export async function resumePayment(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/${id}/resume`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to resume payment');
  return response.json();
}

export async function cancelPayment(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/${id}/cancel`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to cancel payment');
  return response.json();
}

// Airdrops API
export async function fetchAirdrops(creator: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops?creator=${encodeURIComponent(creator)}`);
  if (!response.ok) throw new Error('Failed to fetch airdrops');
  return response.json();
}

export async function fetchClaimableAirdrops(address: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/claimable?address=${encodeURIComponent(address)}`);
  if (!response.ok) throw new Error('Failed to fetch claimable airdrops');
  return response.json();
}

export async function fetchAirdrop(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/${id}`);
  if (!response.ok) throw new Error('Failed to fetch airdrop');
  return response.json();
}

export async function createAirdrop(data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': userAddress },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create airdrop');
  return response.json();
}

export async function claimAirdrop(id: string, claimer: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/${id}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ claimerAddress: claimer }),
  });
  if (!response.ok) throw new Error('Failed to claim airdrop');
  return response.json();
}

export async function pauseAirdrop(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/${id}/pause`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to pause airdrop');
  return response.json();
}

export async function cancelAirdrop(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/airdrops/${id}/cancel`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to cancel airdrop');
  return response.json();
}

// Governance API
export async function fetchGovernanceProposals(vaultId: string, status?: string): Promise<any[]> {
  const qs = status ? `?status=${status}` : '';
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/governance${qs}`);
  if (!response.ok) throw new Error('Failed to fetch governance proposals');
  return response.json();
}

export async function createGovernanceProposal(vaultId: string, data: any, userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/governance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': userAddress },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create governance proposal');
  return response.json();
}

export async function castVote(proposalId: string, vote: 'FOR' | 'AGAINST' | 'ABSTAIN', userAddress: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/governance/${proposalId}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-address': userAddress },
    body: JSON.stringify({ vote }),
  });
  if (!response.ok) throw new Error('Failed to cast vote');
  return response.json();
}

// Budget Plans API
export async function createBudgetPlan(
  vaultId: string,
  data: any,
  userAddress: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/vaults/${vaultId}/budget-plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': userAddress,
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to create budget plan' }));
    throw new Error(error.error || 'Failed to create budget plan');
  }
  return response.json();
}

export async function fetchBudgetPlans(vaultId?: string): Promise<any[]> {
  const url = vaultId
    ? `${API_BASE_URL}/vaults/${vaultId}/budget-plans`
    : `${API_BASE_URL}/budget-plans`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch budget plans');
  }
  return response.json();
}

export async function fetchBudgetPlan(id: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/budget-plans/${id}`);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Budget plan not found');
    }
    throw new Error('Failed to fetch budget plan');
  }
  return response.json();
}

export async function updateBudgetPlanStatus(
  id: string,
  status: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/budget-plans/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error('Failed to update budget plan status');
  }
  return response.json();
}
