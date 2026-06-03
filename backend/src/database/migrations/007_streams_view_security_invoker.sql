-- Migration 007: flip streams_with_vested to security_invoker=true.
--
-- Supabase Advisor flagged the view as a Security Definer View. Postgres
-- views default to security_invoker=false, which means the view executes
-- the underlying SELECT with the owner's privileges and bypasses any RLS
-- policy on `streams`. With security_invoker=true the view inherits the
-- caller's grants and RLS exactly like `streams` itself.
--
-- Idempotent: ALTER VIEW ... SET is a no-op if the option is already set.

BEGIN;

ALTER VIEW streams_with_vested SET (security_invoker = true);

COMMIT;
