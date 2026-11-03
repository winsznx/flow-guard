-- Migration 011: token_decimals on the distribution products.
--
-- BCMR decimals for fungible-token payments, airdrops, rewards, bounties and grants.
-- Amounts stay in display units (whole tokens); conversions scale by 10^token_decimals.
-- Existing rows keep 0, which matches the base-unit amounts their contracts were deployed with.
-- Mirrored in postgres-schema.sql (applied at boot). Safe to re-run.

BEGIN;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS token_decimals INTEGER DEFAULT 0;
ALTER TABLE airdrops ADD COLUMN IF NOT EXISTS token_decimals INTEGER DEFAULT 0;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS token_decimals INTEGER DEFAULT 0;
ALTER TABLE bounties ADD COLUMN IF NOT EXISTS token_decimals INTEGER DEFAULT 0;
ALTER TABLE grants ADD COLUMN IF NOT EXISTS token_decimals INTEGER DEFAULT 0;

COMMIT;
