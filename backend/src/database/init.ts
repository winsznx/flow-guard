/**
 * Schema initialization — runs the Postgres DDL at boot.
 * Idempotent (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from './pg.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function initializeSchema(): Promise<void> {
  const schemaPath = join(__dirname, 'postgres-schema.sql');
  const schemaSQL = readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(schemaSQL);
    console.log('[db] Postgres schema applied successfully.');
  } catch (err: any) {
    console.error('[db] Schema init failed:', err.message);
    throw err;
  }
}
