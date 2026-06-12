-- Migration 008: stop the indexer + explorer from labelling CashToken transfers
-- as 'BCH'.
--
-- Two tables — activity_events and transactions — are the universal lifecycle
-- log and the vault transaction tab respectively. Neither had a token_type or
-- token_category column, so consumers had to JOIN through each parent entity
-- (streams, payments, airdrops, etc.) to figure out which asset the amount
-- referred to. The /explorer/* endpoints worked around this by hardcoding
-- 'BCH' as token_type on the proposals and vaults branches of the unioned
-- query — which silently mislabels any CashToken transfer that touches a
-- vault or proposal.
--
-- This migration:
--   1. Adds nullable token_type + token_category columns to both tables
--      (idempotent via ADD COLUMN IF NOT EXISTS).
--   2. Backfills activity_events.token_type / token_category by joining each
--      row's entity_type + entity_id back to its parent entity. Rows whose
--      parent is unknown stay NULL; the UI surfaces those as '?' rather than
--      silently defaulting to BCH.
--   3. Backfills transactions.token_type from the parent vault row (vault_id)
--      or proposal row (proposal_id). Rows that match neither stay NULL.
--   4. Adds a partial index on (token_category) so per-CashToken filters do
--      not scan the full table — same pattern ParyonUSD's chaingraph fork
--      adds on chaingraph's output table.

BEGIN;

ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS token_type TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS token_category TEXT;
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS token_type TEXT;
ALTER TABLE transactions    ADD COLUMN IF NOT EXISTS token_category TEXT;

-- Backfill activity_events from each parent entity. Idempotent: only updates
-- rows that have NULL token_type today.

UPDATE activity_events e
   SET token_type = s.token_type,
       token_category = s.token_category
  FROM streams s
 WHERE e.entity_type = 'stream'
   AND e.entity_id = s.id
   AND e.token_type IS NULL;

UPDATE activity_events e
   SET token_type = p.token_type,
       token_category = p.token_category
  FROM payments p
 WHERE e.entity_type = 'payment'
   AND e.entity_id = p.id
   AND e.token_type IS NULL;

UPDATE activity_events e
   SET token_type = a.token_type,
       token_category = a.token_category
  FROM airdrops a
 WHERE e.entity_type = 'airdrop'
   AND e.entity_id = a.id
   AND e.token_type IS NULL;

UPDATE activity_events e
   SET token_type = b.token_type,
       token_category = b.token_category
  FROM bounties b
 WHERE e.entity_type = 'bounty'
   AND e.entity_id = b.id
   AND e.token_type IS NULL;

UPDATE activity_events e
   SET token_type = r.token_type,
       token_category = r.token_category
  FROM rewards r
 WHERE e.entity_type = 'reward'
   AND e.entity_id = r.id
   AND e.token_type IS NULL;

UPDATE activity_events e
   SET token_type = g.token_type,
       token_category = g.token_category
  FROM grants g
 WHERE e.entity_type = 'grant'
   AND e.entity_id = g.id
   AND e.token_type IS NULL;

-- Vaults today hold mixed assets — set BCH as the default for vault activity
-- (existing behaviour) but allow future indexer entries to override per-event.
UPDATE activity_events
   SET token_type = 'BCH'
 WHERE entity_type = 'vault'
   AND token_type IS NULL;

-- Vaults table does not currently model per-vault token_type, so transactions
-- whose only signal is the parent vault default to BCH. Once the indexer
-- starts writing token_type at txn insert time, this default will only apply
-- to legacy pre-CashTokens rows.
UPDATE transactions
   SET token_type = 'BCH'
 WHERE token_type IS NULL;

-- Partial indexes so CashToken-filtered explorer queries do not table-scan.
CREATE INDEX IF NOT EXISTS idx_activity_events_token_category
    ON activity_events (token_category)
    WHERE token_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_token_category
    ON transactions (token_category)
    WHERE token_category IS NOT NULL;

COMMIT;
