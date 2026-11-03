-- Migration 014: who created a spending request.
--
-- POST /vaults/:vaultId/proposals took a creator argument and never stored it, so
-- nothing could tell which wallet a pending request belongs to. DELETE /proposals/:id
-- (abandon a request whose on-chain create never landed) is limited to its creator.
-- Rows created before this migration stay NULL and can't be abandoned.
-- Mirrored in postgres-schema.sql (applied at boot). Safe to re-run.

BEGIN;

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS creator TEXT;

COMMIT;
