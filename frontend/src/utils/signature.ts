/**
 * Normalize a `bch_signMessage` response into the base64 signature string the
 * SIWX verifier expects. The wc2-bch-bcr spec returns a bare base64 string, but
 * wallets in practice also return `{ signature }` or a nested `{ signature }`.
 * Casting the raw response `as string` silently produces "[object Object]" for
 * the object shape, which fails server-side verification with no clue why.
 */
export function normalizeSignatureResponse(result: unknown): string {
  if (typeof result === 'string') return result.trim();

  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    const candidate = record.signature ?? record.signedMessage ?? record.result;
    if (typeof candidate === 'string') return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const inner = (candidate as Record<string, unknown>).signature;
      if (typeof inner === 'string') return inner.trim();
    }
  }

  throw new Error('Wallet returned an unrecognized signature format');
}
