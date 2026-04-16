/**
 * Database Schema and Initialization — PostgreSQL (Supabase)
 *
 * Historically this file owned both the SQLite connection and the CREATE TABLE
 * statements. After the migration to Supabase Postgres, the schema is managed
 * via `postgres-schema.sql` and applied at boot (idempotent).
 *
 * This file stays in place so existing imports `from '../database/schema.js'`
 * continue to resolve. It simply re-exports the `pg` adapter.
 *
 * IMPORTANT: The adapter is async. Callers must `await` every
 * `db.prepare(sql).run/get/all(...)` call.
 */

export { db, pool } from './pg.js';
export { db as default } from './pg.js';
