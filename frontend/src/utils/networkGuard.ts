/**
 * Frontend/backend network agreement check.
 *
 * Neither side supports runtime network switching: the frontend bakes
 * `VITE_BCH_NETWORK` in at build time (`useNetwork()`) and the backend reads
 * `BCH_NETWORK` from the process env at boot (`resolveBchNetwork()`). A mismatch is
 * silent and expensive — the app renders chipnet UI while the backend builds mainnet
 * transactions against real UTXOs, or the reverse, and the first symptom is a wallet
 * prompt for a transaction that cannot possibly confirm.
 *
 * `GET /api/status` reports the backend's resolved network as `network.name`, so a
 * single unauthenticated call settles it.
 *
 * Fail-open on anything inconclusive (offline, 500, unexpected shape) and fail-closed
 * only on a definite disagreement: an unreachable status endpoint must not block a
 * user whose configuration is fine.
 */

import type { Network } from '../hooks/useNetwork';
import { errorMessage, type ErrorCode } from '../copy/errors';

/** Code read by classifyWalletError(). The operator detail goes to the console and to `details`. */
export class NetworkMismatchError extends Error {
  readonly code: ErrorCode = 'MISCONFIGURED';
  readonly details: string;

  constructor(
    readonly frontendNetwork: Network,
    readonly backendNetwork: string,
  ) {
    super(errorMessage('MISCONFIGURED'));
    this.name = 'NetworkMismatchError';
    this.details = `Build network ${frontendNetwork}, server network ${backendNetwork}.`;
    console.error(
      `[networkGuard] This build targets ${frontendNetwork}, but the API at ${window.location.origin} ` +
        `runs on ${backendNetwork}. Set the frontend or backend network to match and restart both.`,
    );
  }
}

/** Cached across calls: the backend cannot change network without a restart. */
let cachedBackendNetwork: string | null = null;

/**
 * Throws `NetworkMismatchError` when the backend definitively reports a different
 * network than this build targets. Resolves silently in every other case.
 */
export async function assertBackendNetworkMatches(frontendNetwork: Network): Promise<void> {
  if (cachedBackendNetwork === null) {
    try {
      const response = await fetch('/api/status', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = (await response.json()) as { network?: { name?: unknown } };
      const name = payload?.network?.name;
      if (typeof name !== 'string' || name.length === 0) return;
      cachedBackendNetwork = name;
    } catch {
      // Offline, CORS-blocked, or malformed response: inconclusive, so allow.
      return;
    }
  }

  if (cachedBackendNetwork !== frontendNetwork) {
    throw new NetworkMismatchError(frontendNetwork, cachedBackendNetwork);
  }
}

/** Test seam — drops the memoised backend network. */
export function resetBackendNetworkCache(): void {
  cachedBackendNetwork = null;
}
