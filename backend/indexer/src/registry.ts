import type { Pool } from 'pg';

export type Family =
  | 'VAULT'
  | 'PROPOSAL'
  | 'STREAM'
  | 'PAYMENT'
  | 'BUDGET'
  | 'AIRDROP'
  | 'REWARD'
  | 'BOUNTY'
  | 'GRANT'
  | 'GOVERNANCE_PROPOSAL'
  | 'VOTE_LOCK';

export interface RegistryEntry {
  address: string;
  family: Family;
  localId: string;
  bytecodeHex?: string;
}

interface RegistryRow {
  address: string;
  family: Family;
  local_id: string;
  bytecode_hex: string | null;
}

const REGISTRY_QUERY = `
  SELECT contract_address AS address,
         'VAULT'::text     AS family,
         id                AS local_id,
         contract_bytecode AS bytecode_hex
    FROM vaults
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'PROPOSAL'::text,
         id,
         NULL::text
    FROM proposals
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'STREAM'::text,
         id,
         NULL::text
    FROM streams
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'PAYMENT'::text,
         id,
         NULL::text
    FROM payments
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'BUDGET'::text,
         id,
         NULL::text
    FROM budget_plans
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'AIRDROP'::text,
         id,
         NULL::text
    FROM airdrops
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'REWARD'::text,
         id,
         NULL::text
    FROM rewards
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'BOUNTY'::text,
         id,
         NULL::text
    FROM bounties
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'GRANT'::text,
         id,
         NULL::text
    FROM grants
   WHERE contract_address IS NOT NULL

  UNION ALL
  SELECT contract_address,
         'VOTE_LOCK'::text,
         id,
         NULL::text
    FROM governance_votes
   WHERE contract_address IS NOT NULL
`;

export async function loadRegistry(pool: Pool): Promise<RegistryEntry[]> {
  const result = await pool.query<RegistryRow>(REGISTRY_QUERY);
  return result.rows.map((row) => {
    const entry: RegistryEntry = {
      address: row.address,
      family: row.family,
      localId: row.local_id,
    };
    if (row.bytecode_hex !== null && row.bytecode_hex !== undefined && row.bytecode_hex !== '') {
      entry.bytecodeHex = row.bytecode_hex;
    }
    return entry;
  });
}
