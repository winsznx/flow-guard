-- Migration 006: flag bounty / grant / reward rows that were created against
-- the pre-C-06 (one-slot authorityHash) covenant shape.
--
-- Those covenants reject every claim/release/distribute signature on chain
-- because the deployment service bound `authorityHash` to the creator's BCH
-- wallet but the claim service signs with an unrelated backend-generated key.
-- After C-06 landed, new rows use the two-slot constructor and work
-- correctly. Old rows are forensic dead state.
--
-- This migration:
--   1. Adds an idempotent `is_deprecated` boolean column on each table.
--   2. Marks every existing PENDING / ACTIVE row as deprecated, with a note.
--   3. Leaves the rows in place so that operators can drop or refund them
--      manually after review (we don't auto-delete records that may still
--      hold on-chain BCH).
--
-- Once C-06 was deployed, fresh creates write `is_deprecated = false`. Read
-- paths that surface campaign listings should filter `WHERE is_deprecated = false`
-- to hide dead state from the UI.

BEGIN;

ALTER TABLE bounties ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bounties ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;
ALTER TABLE grants   ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE grants   ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;
ALTER TABLE rewards  ADD COLUMN IF NOT EXISTS is_deprecated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE rewards  ADD COLUMN IF NOT EXISTS deprecation_reason TEXT;

-- One-shot flagging. Idempotent because we look at the existing flag value.
UPDATE bounties
   SET is_deprecated = TRUE,
       deprecation_reason = 'Created against pre-C-06 BountyCovenant (single authorityHash). On-chain claims will not succeed; redeploy under the C-06 two-slot covenant to restart the campaign.'
 WHERE is_deprecated = FALSE
   AND status IN ('PENDING', 'ACTIVE', 'PAUSED');

UPDATE grants
   SET is_deprecated = TRUE,
       deprecation_reason = 'Created against pre-C-06 GrantCovenant (single authorityHash). On-chain milestone releases will not succeed; redeploy under the C-06 two-slot covenant to restart the program.'
 WHERE is_deprecated = FALSE
   AND status IN ('PENDING', 'ACTIVE', 'PAUSED');

UPDATE rewards
   SET is_deprecated = TRUE,
       deprecation_reason = 'Created against pre-C-06 RewardCovenant (single authorityHash). On-chain distributions will not succeed; redeploy under the C-06 two-slot covenant to restart the program.'
 WHERE is_deprecated = FALSE
   AND status IN ('PENDING', 'ACTIVE', 'PAUSED');

-- Indexes so listings can cheaply filter out deprecated rows.
CREATE INDEX IF NOT EXISTS idx_bounties_active ON bounties (created_at DESC) WHERE is_deprecated = FALSE;
CREATE INDEX IF NOT EXISTS idx_grants_active   ON grants   (created_at DESC) WHERE is_deprecated = FALSE;
CREATE INDEX IF NOT EXISTS idx_rewards_active  ON rewards  (created_at DESC) WHERE is_deprecated = FALSE;

COMMIT;
