/**
 * Columns that must never leave the API. The privkey columns hold the encrypted
 * campaign authority keys; merkle_data is the full recipient/amount/proof set,
 * which claimers fetch one proof at a time from GET /airdrops/:id/proof/:address.
 */
const SECRET_COLUMNS = ['authority_privkey', 'claim_authority_privkey', 'merkle_data'] as const;

export function omitSecretColumns<T>(row: T): T {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return row;
  }
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const column of SECRET_COLUMNS) {
    delete copy[column];
  }
  return copy as T;
}
