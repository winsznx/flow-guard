-- Migration 013: pending airdrop claims.
--
-- POST /airdrops/:id/claim co-signs with the claim-authority key, and the per-wallet
-- limit used to count only rows written by confirm-claim. A wallet could broadcast,
-- skip confirm-claim and ask for another co-signed claim. Each co-signed claim is now
-- held here until it is confirmed. While the state UTXO it spends is still live, the
-- same transaction is handed back instead of a new one; once that transaction is on
-- chain it is recorded as a claim.
-- Mirrored in postgres-schema.sql (applied at boot). Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS airdrop_claim_reservations (
    campaign_id TEXT NOT NULL,
    claimer TEXT NOT NULL,
    tx_hash TEXT NOT NULL,
    state_outpoint TEXT NOT NULL,
    wc_transaction TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (campaign_id, claimer)
);

COMMIT;
