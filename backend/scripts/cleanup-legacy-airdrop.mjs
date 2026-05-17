/**
 * One-shot ops script.
 *
 * Removes any row in `airdrops` whose claim_authority_privkey is a 64-char
 * hex string (i.e. the pre-encryption plaintext shape). Encrypted keys are
 * longer base64 envelopes (v1 or v2), so they will not match the filter.
 *
 * Use after the C-06 encryption migration to clear stale rows whose key
 * material was never re-wrapped. Run from the backend/ directory:
 *   node scripts/cleanup-legacy-airdrop.mjs
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

try {
  const legacy = await pool.query(`
    SELECT id, title FROM airdrops
    WHERE claim_authority_privkey IS NOT NULL
      AND LENGTH(claim_authority_privkey) = 64
      AND claim_authority_privkey ~ '^[0-9a-fA-F]{64}$'
  `);

  if (legacy.rows.length === 0) {
    console.log('No legacy plaintext-keyed airdrops found.');
    process.exit(0);
  }

  console.log(`Found ${legacy.rows.length} legacy airdrop(s):`);
  for (const row of legacy.rows) {
    console.log(`  - ${row.id.slice(0, 8)}: "${row.title}"`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const row of legacy.rows) {
      const r1 = await client.query('DELETE FROM airdrop_claims WHERE campaign_id = $1', [row.id]);
      const r2 = await client.query(
        "DELETE FROM activity_events WHERE entity_type = 'airdrop' AND entity_id = $1",
        [row.id]
      );
      const r3 = await client.query('DELETE FROM airdrops WHERE id = $1', [row.id]);
      console.log(
        `  Deleted ${row.id.slice(0, 8)}: ${r1.rowCount} claims, ${r2.rowCount} events, ${r3.rowCount} airdrop row`
      );
    }
    await client.query('COMMIT');
    console.log('Cleanup complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
