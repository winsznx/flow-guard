/**
 * Ops audit script.
 *
 * Lists every row in `airdrops` with its status, whether a claim-authority
 * private key is present, and the length of that key (so a quick eyeball can
 * distinguish v1/v2 base64 envelopes from any legacy 64-char hex stragglers).
 *
 * Run from the backend/ directory:
 *   node scripts/check-airdrops.mjs
 */

import { Pool } from 'pg';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const r = await pool.query(
  "SELECT id, title, status, claim_authority_privkey IS NOT NULL AS has_key, LENGTH(claim_authority_privkey) AS key_len, created_at FROM airdrops ORDER BY created_at DESC"
);

console.log('Airdrops in DB:');
for (const row of r.rows) {
  const createdMs = Number(row.created_at) * 1000;
  console.log(
    `  id=${row.id.slice(0, 8)} title="${row.title}" status=${row.status} keyLen=${row.key_len} created=${new Date(createdMs).toISOString()}`
  );
}

await pool.end();
