-- Migration 005: normalize JSON columns into proper relations.
--
-- Pre-migration the following columns held JSON arrays:
--   vaults.signers          (array of BCH addresses)
--   vaults.signer_pubkeys   (array of compressed pubkey hex)
--   proposals.approvals     (array of approver BCH addresses)
--   airdrops.merkle_data    (object with `recipients[]` for KYC merkle drops)
--
-- Substring-matching against those JSON columns surfaced membership leaks
-- (audit M-10) and made integrity constraints impossible. This migration
-- introduces normalized relations and backfills them from the JSON columns.
-- The JSON columns stay in place so existing read paths keep working until
-- service code is migrated; once every reader uses the relations, a follow-up
-- migration can drop them.

BEGIN;

-- ---------------------------------------------------------------------------
-- vault_signers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vault_signers (
    vault_id        TEXT    NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    signer_address  TEXT    NOT NULL,
    signer_pubkey   TEXT,
    position        INTEGER NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (vault_id, signer_address)
);
CREATE INDEX IF NOT EXISTS idx_vault_signers_address ON vault_signers(signer_address);
CREATE INDEX IF NOT EXISTS idx_vault_signers_vault   ON vault_signers(vault_id);

-- Idempotent backfill from existing JSON columns. Skips rows that fail to
-- parse (legacy / corrupted). NULLs in `signer_pubkeys` are tolerated.
INSERT INTO vault_signers (vault_id, signer_address, signer_pubkey, position)
SELECT
    v.id AS vault_id,
    addr.value::text AS signer_address,
    NULLIF(pk.value::text, '') AS signer_pubkey,
    addr.ordinality::int - 1 AS position
FROM vaults v
JOIN LATERAL jsonb_array_elements_text(NULLIF(v.signers, '')::jsonb) WITH ORDINALITY AS addr ON TRUE
LEFT JOIN LATERAL jsonb_array_elements_text(NULLIF(v.signer_pubkeys, '')::jsonb) WITH ORDINALITY AS pk
    ON pk.ordinality = addr.ordinality
WHERE v.signers IS NOT NULL AND v.signers <> '' AND v.signers <> '[]'
ON CONFLICT (vault_id, signer_address) DO NOTHING;

-- ---------------------------------------------------------------------------
-- proposal_approvals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS proposal_approvals (
    proposal_id      TEXT    NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    approver_address TEXT    NOT NULL,
    approved_at      TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (proposal_id, approver_address)
);
CREATE INDEX IF NOT EXISTS idx_proposal_approvals_proposal ON proposal_approvals(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_approvals_approver ON proposal_approvals(approver_address);

INSERT INTO proposal_approvals (proposal_id, approver_address)
SELECT
    p.id AS proposal_id,
    addr.value::text AS approver_address
FROM proposals p
JOIN LATERAL jsonb_array_elements_text(NULLIF(p.approvals, '')::jsonb) AS addr ON TRUE
WHERE p.approvals IS NOT NULL AND p.approvals <> '' AND p.approvals <> '[]'
ON CONFLICT (proposal_id, approver_address) DO NOTHING;

-- ---------------------------------------------------------------------------
-- airdrop_recipients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS airdrop_recipients (
    campaign_id  TEXT    NOT NULL REFERENCES airdrops(id) ON DELETE CASCADE,
    address      TEXT    NOT NULL,
    amount       DOUBLE PRECISION NOT NULL,
    proof        JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (campaign_id, address)
);
CREATE INDEX IF NOT EXISTS idx_airdrop_recipients_address ON airdrop_recipients(address);
CREATE INDEX IF NOT EXISTS idx_airdrop_recipients_campaign ON airdrop_recipients(campaign_id);

-- Backfill: airdrops.merkle_data is JSON of shape
--   { "recipients": [ { "address": "...", "amount": 0.05 } ], "proofs": [ [address, [proofHex,...]], ... ] }
-- We unpack recipients[] and join the matching proof when present.
INSERT INTO airdrop_recipients (campaign_id, address, amount, proof)
SELECT
    a.id AS campaign_id,
    rec->>'address' AS address,
    COALESCE((rec->>'amount')::double precision, 0) AS amount,
    (
        SELECT proof_pair->1
        FROM jsonb_array_elements(NULLIF(a.merkle_data, '')::jsonb -> 'proofs') AS proof_pair
        WHERE proof_pair->>0 = rec->>'address'
        LIMIT 1
    ) AS proof
FROM airdrops a
JOIN LATERAL jsonb_array_elements(NULLIF(a.merkle_data, '')::jsonb -> 'recipients') AS rec ON TRUE
WHERE a.merkle_data IS NOT NULL AND a.merkle_data <> '' AND a.merkle_data <> '{}'
  AND rec->>'address' IS NOT NULL
ON CONFLICT (campaign_id, address) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- Follow-up (NOT in this migration):
--   1. Migrate reader code paths (VaultService.getUserVaults,
--      ProposalService.getProposalById, AirdropClaimService) to read from
--      these relations instead of parsing JSON.
--   2. Add NOT NULL / CHECK constraints (signer_pubkey CHECK length 66 hex,
--      address CHECK regexp).
--   3. Once every reader is migrated, drop the JSON columns:
--        ALTER TABLE vaults    DROP COLUMN signers, DROP COLUMN signer_pubkeys;
--        ALTER TABLE proposals DROP COLUMN approvals;
--        ALTER TABLE airdrops  DROP COLUMN merkle_data;
-- ---------------------------------------------------------------------------
