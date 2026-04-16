/**
 * PostgreSQL connection + thin adapter
 *
 * Exposes a `db` object that mimics the `better-sqlite3` API shape
 * (`db.prepare(sql).run(...) / .get(...) / .all(...)`) but against
 * a Postgres connection pool.
 *
 * All methods are async. Callers must `await` every .run/.get/.all call.
 *
 * Placeholders: use `$1`, `$2`, ... (Postgres native), not `?`.
 */

import { Pool, types, type PoolClient, type QueryResult } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL env var is required');
}

// Parse BIGINT (OID 20) as Number. Safe for COUNT(*) results and our
// epoch-seconds columns (all well within Number.MAX_SAFE_INTEGER for this app's lifetime).
// Callers that need exact bigint precision for on-chain satoshi math should
// wrap the value in BigInt() explicitly.
types.setTypeParser(20, (value) => (value === null ? null : parseInt(value, 10)));
// Parse NUMERIC/DECIMAL (OID 1700) as Number (affects SUM() aggregates and DOUBLE PRECISION casts).
types.setTypeParser(1700, (value) => (value === null ? null : parseFloat(value)));

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_SIZE ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  console.error('[pg] Unexpected pool error:', err.message);
});

export interface RunResult {
  changes: number;
  lastInsertRowid?: number | null;
}

export interface PreparedStatement {
  run: (...params: any[]) => Promise<RunResult>;
  get: <T = any>(...params: any[]) => Promise<T | undefined>;
  all: <T = any>(...params: any[]) => Promise<T[]>;
}

function normalizeParams(params: any[]): any[] {
  if (params.length === 1 && Array.isArray(params[0])) return params[0];
  return params;
}

/**
 * Converts SQLite-style `?` placeholders to Postgres `$1, $2, ...`.
 * Preserves `?` occurrences inside string literals.
 */
function convertPlaceholders(sql: string): string {
  if (!sql.includes('?')) return sql;
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let paramIndex = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (ch === '?' && !inSingle && !inDouble) {
      paramIndex++;
      out += `$${paramIndex}`;
      continue;
    }
    out += ch;
  }
  return out;
}

function prepare(rawSql: string): PreparedStatement {
  const sql = convertPlaceholders(rawSql);
  return {
    run: async (...params: any[]): Promise<RunResult> => {
      const result: QueryResult = await pool.query(sql, normalizeParams(params));
      return { changes: result.rowCount ?? 0, lastInsertRowid: null };
    },
    get: async <T = any>(...params: any[]): Promise<T | undefined> => {
      const result: QueryResult = await pool.query(sql, normalizeParams(params));
      return (result.rows[0] as T | undefined);
    },
    all: async <T = any>(...params: any[]): Promise<T[]> => {
      const result: QueryResult = await pool.query(sql, normalizeParams(params));
      return result.rows as T[];
    },
  };
}

async function exec(sql: string): Promise<void> {
  await pool.query(sql);
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const db = {
  prepare,
  exec,
  withTransaction,
  pool,
};

export default db;
