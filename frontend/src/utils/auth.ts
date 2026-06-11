/**
 * Sign-In With BCH client helper - provides `authFetch`, a drop-in replacement
 * for `fetch` that attaches the SIWX bearer token (or, on first call, runs the
 * full nonce → sign → verify → bearer round-trip before retrying).
 *
 * High-level flow:
 *   1. Caller invokes `authFetch(url, { wallet, ...init })`.
 *   2. If a fresh bearer is cached in sessionStorage for `wallet.address`,
 *      attach it as `Authorization: Bearer …` and call fetch directly.
 *   3. Otherwise (or on a 401 indicating the bearer expired):
 *      a. POST /api/auth/nonce → receive `{ nonceId, message }`.
 *      b. Have the wallet sign the message (`bch_signMessage` under the hood).
 *      c. POST /api/auth/verify → receive `{ bearer, expiresAt }`.
 *      d. Cache the bearer in sessionStorage keyed by address.
 *      e. Retry the original request with the bearer.
 *   4. Always also set `x-user-address` so legacy/read-only routes that read
 *      the header path keep working during the migration.
 *
 * Cache is sessionStorage so it survives tab refresh but not browser close,
 * which matches the typical 30-minute bearer TTL closely enough to avoid
 * surprising the user. A 30-second safety margin is subtracted from the cached
 * expiry to avoid races near the boundary.
 *
 * `authFetch` is wallet-aware but not wallet-coupled: the caller passes in the
 * `wallet` object (typically the value of `useWallet()` from React) so this
 * module stays usable from non-React contexts (Worker scripts, service worker,
 * etc.) and doesn't tug a Zustand store into modules that don't need it.
 */

const BEARER_STORAGE_KEY = 'flowguard.siwx.bearer';
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

const AUTH_BASE = '/api/auth';

export interface WalletForAuth {
  address: string | null;
  signMessage: (message: string) => Promise<string>;
}

export interface AuthFetchInit extends RequestInit {
  /** Connected wallet used to sign the SIWX message when no bearer is cached. */
  wallet: WalletForAuth;
}

interface CachedBearer {
  address: string;
  bearer: string;
  expiresAt: number;
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readCachedBearer(address: string): string | null {
  const store = safeSessionStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(BEARER_STORAGE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as Partial<CachedBearer>;
    if (
      cached.address !== address ||
      typeof cached.bearer !== 'string' ||
      typeof cached.expiresAt !== 'number'
    ) {
      return null;
    }
    if (cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS < Date.now()) return null;
    return cached.bearer;
  } catch {
    return null;
  }
}

function writeCachedBearer(address: string, bearer: string, expiresAt: number): void {
  const store = safeSessionStorage();
  if (!store) return;
  try {
    const payload: CachedBearer = { address, bearer, expiresAt };
    store.setItem(BEARER_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded / Safari private mode etc. - non-fatal.
  }
}

export function clearCachedBearer(): void {
  const store = safeSessionStorage();
  if (!store) return;
  try {
    store.removeItem(BEARER_STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface NonceResponse {
  success: boolean;
  nonceId: string;
  message: string;
  expiresAt: number;
}

interface VerifyResponse {
  success: boolean;
  bearer: string;
  expiresAt: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let detail = '';
    try {
      const data = (await resp.json()) as { message?: string; error?: string };
      detail = data.message || data.error || '';
    } catch {
      // ignore body parse failure - fall through with the bare status
    }
    throw new Error(`${path} failed: ${resp.status}${detail ? ` - ${detail}` : ''}`);
  }
  return (await resp.json()) as T;
}

/**
 * Run the SIWX flow end-to-end and return a fresh bearer token. Throws on
 * wallet rejection, nonce fetch failure, or verify failure.
 */
async function obtainBearer(wallet: WalletForAuth): Promise<string> {
  if (!wallet.address) {
    throw new Error('Wallet must be connected before authFetch can sign in');
  }

  const domain =
    typeof window !== 'undefined' && window.location ? window.location.host : undefined;
  const uri =
    typeof window !== 'undefined' && window.location ? window.location.origin : undefined;

  const nonce = await postJson<NonceResponse>(`${AUTH_BASE}/nonce`, {
    address: wallet.address,
    domain,
    uri,
  });

  const signature = await wallet.signMessage(nonce.message);

  const verify = await postJson<VerifyResponse>(`${AUTH_BASE}/verify`, {
    address: wallet.address,
    nonceId: nonce.nonceId,
    signature,
  });

  writeCachedBearer(wallet.address, verify.bearer, verify.expiresAt);
  return verify.bearer;
}

/**
 * SIWX-aware fetch. Use exactly like `fetch`, but pass `wallet` in the init
 * object so we can sign the login message on demand.
 *
 * Smooth-login behaviour:
 *   - First mutating call per session prompts the wallet once for a message
 *     signature.
 *   - Subsequent calls reuse the cached bearer until it expires (~30 min).
 *   - On 401 (bearer expired or revoked) the helper transparently refreshes
 *     the bearer and retries the original request once.
 *
 * If the wallet is not connected (`wallet.address` is null/empty), this falls
 * back to a plain fetch so unauth read-only routes still work.
 */
export async function authFetch(input: RequestInfo | URL, init: AuthFetchInit): Promise<Response> {
  const { wallet, ...rest } = init;

  if (!wallet?.address) {
    return fetch(input, rest);
  }

  const headers = new Headers(rest.headers ?? {});
  headers.set('x-user-address', wallet.address);

  let bearer = readCachedBearer(wallet.address);
  if (!bearer) {
    bearer = await obtainBearer(wallet);
  }
  headers.set('Authorization', `Bearer ${bearer}`);

  let response = await fetch(input, { ...rest, headers });

  if (response.status === 401) {
    // Bearer expired or rejected - burn the cache, force a refresh, retry once.
    clearCachedBearer();
    try {
      bearer = await obtainBearer(wallet);
    } catch (refreshError) {
      // Surface the original 401 if the refresh itself fails - the caller
      // typically renders the body text as the error message.
      throw refreshError;
    }
    headers.set('Authorization', `Bearer ${bearer}`);
    response = await fetch(input, { ...rest, headers });
  }

  return response;
}

/**
 * Convenience: equivalent to `authFetch(input, { wallet, ...init }).then(r => r.json())`
 * with the standard not-OK-throws-with-message handling we want at most call
 * sites.
 */
export async function authFetchJson<T = unknown>(
  input: RequestInfo | URL,
  init: AuthFetchInit,
): Promise<T> {
  const response = await authFetch(input, init);
  if (!response.ok) {
    let detail = '';
    try {
      const data = (await response.json()) as { message?: string; error?: string };
      detail = data.message || data.error || '';
    } catch {
      // ignore
    }
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}
