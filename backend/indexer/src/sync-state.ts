import type { Pool, PoolClient } from 'pg';

export interface RecentBlock {
  height: number;
  hash: string;
  previousHash: string;
}

export interface SyncState {
  lastHeight: number;
  lastSafeHeight: number;
  lastBlockHash: string;
  recentBlocks: RecentBlock[];
  electrumServer: string;
  network: 'mainnet' | 'chipnet';
}

interface SyncStateRow {
  last_height: string | number;
  last_safe_height: string | number;
  last_block_hash: string;
  electrum_server: string;
  network: string;
}

interface RecentBlockRow {
  height: string | number;
  hash: string;
  previous_hash: string;
}

const SINGLETON_ID = 1;

function toNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'string' ? Number(value) : value;
}

function assertNetwork(value: string): 'mainnet' | 'chipnet' {
  if (value !== 'mainnet' && value !== 'chipnet') {
    throw new Error(`invalid network in sync_state: ${value}`);
  }
  return value;
}

async function ensureSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS sync_state (
      id INTEGER PRIMARY KEY,
      last_height BIGINT NOT NULL DEFAULT 0,
      last_safe_height BIGINT NOT NULL DEFAULT 0,
      last_block_hash TEXT NOT NULL DEFAULT '',
      electrum_server TEXT NOT NULL DEFAULT '',
      network TEXT NOT NULL DEFAULT 'mainnet',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS recent_blocks (
      height BIGINT PRIMARY KEY,
      hash TEXT NOT NULL,
      previous_hash TEXT NOT NULL,
      indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await client.query(`
    INSERT INTO sync_state (id, last_height, last_safe_height, last_block_hash, electrum_server, network)
    VALUES ($1, 0, 0, '', '', 'mainnet')
    ON CONFLICT (id) DO NOTHING
  `, [SINGLETON_ID]);
}

export async function getSyncState(pool: Pool): Promise<SyncState> {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    const stateResult = await client.query<SyncStateRow>(
      `SELECT last_height, last_safe_height, last_block_hash, electrum_server, network
         FROM sync_state
        WHERE id = $1`,
      [SINGLETON_ID],
    );
    const row = stateResult.rows[0];
    if (!row) {
      throw new Error('sync_state singleton row missing after ensureSchema');
    }
    const blocksResult = await client.query<RecentBlockRow>(
      `SELECT height, hash, previous_hash
         FROM recent_blocks
        ORDER BY height ASC`,
    );
    return {
      lastHeight: toNumber(row.last_height),
      lastSafeHeight: toNumber(row.last_safe_height),
      lastBlockHash: row.last_block_hash,
      recentBlocks: blocksResult.rows.map((b) => ({
        height: toNumber(b.height),
        hash: b.hash,
        previousHash: b.previous_hash,
      })),
      electrumServer: row.electrum_server,
      network: assertNetwork(row.network),
    };
  } finally {
    client.release();
  }
}

export async function updateCursor(
  pool: Pool,
  height: number,
  blockHash: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `UPDATE sync_state
          SET last_height = $1,
              last_block_hash = $2,
              updated_at = NOW()
        WHERE id = $3`,
      [height, blockHash, SINGLETON_ID],
    );
  } finally {
    client.release();
  }
}

export async function advanceSafe(pool: Pool, safeHeight: number): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `UPDATE sync_state
          SET last_safe_height = GREATEST(last_safe_height, $1),
              updated_at = NOW()
        WHERE id = $2`,
      [safeHeight, SINGLETON_ID],
    );
  } finally {
    client.release();
  }
}

export async function pushRecentBlock(
  pool: Pool,
  height: number,
  blockHash: string,
  prevHash: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `INSERT INTO recent_blocks (height, hash, previous_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (height) DO UPDATE
         SET hash = EXCLUDED.hash,
             previous_hash = EXCLUDED.previous_hash,
             indexed_at = NOW()`,
      [height, blockHash, prevHash],
    );
  } finally {
    client.release();
  }
}

export async function trimRecentBlocks(pool: Pool, keepCount: number): Promise<void> {
  if (keepCount < 0) {
    throw new RangeError(`keepCount must be >= 0, got ${keepCount}`);
  }
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `DELETE FROM recent_blocks
        WHERE height <= (
          SELECT COALESCE(MAX(height), 0) - $1
            FROM recent_blocks
        )`,
      [keepCount],
    );
  } finally {
    client.release();
  }
}

export async function findReorgPoint(
  pool: Pool,
  recentChain: Array<{ height: number; hash: string }>,
): Promise<number | null> {
  if (recentChain.length === 0) return null;
  const client = await pool.connect();
  try {
    await ensureSchema(client);
    const heights = recentChain.map((b) => b.height);
    const stored = await client.query<{ height: string | number; hash: string }>(
      `SELECT height, hash
         FROM recent_blocks
        WHERE height = ANY($1::bigint[])`,
      [heights],
    );
    const storedByHeight = new Map<number, string>();
    for (const row of stored.rows) {
      storedByHeight.set(toNumber(row.height), row.hash);
    }
    let forkPoint: number | null = null;
    for (const incoming of recentChain) {
      const storedHash = storedByHeight.get(incoming.height);
      if (storedHash === undefined) continue;
      if (storedHash !== incoming.hash) {
        if (forkPoint === null || incoming.height < forkPoint) {
          forkPoint = incoming.height;
        }
      }
    }
    return forkPoint;
  } finally {
    client.release();
  }
}
