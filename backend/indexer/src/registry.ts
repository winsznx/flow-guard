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

interface TableSpec {
  table: string;
  family: Family;
  bytecodeColumn?: string;
}

const TABLE_SPECS: TableSpec[] = [
  { table: 'vaults',            family: 'VAULT',     bytecodeColumn: 'contract_bytecode' },
  { table: 'proposals',         family: 'PROPOSAL' },
  { table: 'streams',           family: 'STREAM' },
  { table: 'payments',          family: 'PAYMENT' },
  { table: 'budget_plans',      family: 'BUDGET' },
  { table: 'airdrops',          family: 'AIRDROP' },
  { table: 'rewards',           family: 'REWARD' },
  { table: 'bounties',          family: 'BOUNTY' },
  { table: 'grants',            family: 'GRANT' },
  { table: 'governance_votes',  family: 'VOTE_LOCK' },
];

interface RegistryRow {
  address: string;
  family: Family;
  local_id: string;
  bytecode_hex: string | null;
}

async function tableHasColumn(
  pool: Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return result.rows[0]?.exists === true;
}

async function pickIdColumn(pool: Pool, table: string): Promise<string | null> {
  for (const candidate of ['id', `${table.slice(0, -1)}_id`, 'pk', 'uuid']) {
    if (await tableHasColumn(pool, table, candidate)) return candidate;
  }
  return null;
}

export async function loadRegistry(pool: Pool): Promise<RegistryEntry[]> {
  const all: RegistryEntry[] = [];

  for (const spec of TABLE_SPECS) {
    if (!(await tableHasColumn(pool, spec.table, 'contract_address'))) {
      continue;
    }
    const idColumn = await pickIdColumn(pool, spec.table);
    if (!idColumn) continue;

    const hasBytecode =
      spec.bytecodeColumn !== undefined &&
      (await tableHasColumn(pool, spec.table, spec.bytecodeColumn));
    const bytecodeSelect = hasBytecode
      ? `${spec.bytecodeColumn} AS bytecode_hex`
      : `NULL::text AS bytecode_hex`;

    const sql = `
      SELECT contract_address AS address,
             '${spec.family}'::text AS family,
             ${idColumn}::text AS local_id,
             ${bytecodeSelect}
        FROM ${spec.table}
       WHERE contract_address IS NOT NULL
    `;

    const result = await pool.query<RegistryRow>(sql);
    for (const row of result.rows) {
      const entry: RegistryEntry = {
        address: row.address,
        family: row.family,
        localId: row.local_id,
      };
      if (row.bytecode_hex !== null && row.bytecode_hex !== undefined && row.bytecode_hex !== '') {
        entry.bytecodeHex = row.bytecode_hex;
      }
      all.push(entry);
    }
  }

  return all;
}
