BEGIN;

CREATE TABLE IF NOT EXISTS sync_state (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_height BIGINT NOT NULL DEFAULT 0,
    last_safe_height BIGINT NOT NULL DEFAULT 0,
    last_block_hash BYTEA,
    recent_blocks JSONB NOT NULL DEFAULT '[]'::JSONB,
    electrum_server TEXT,
    network TEXT NOT NULL DEFAULT 'mainnet',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sync_state (id, last_height, last_safe_height, recent_blocks, network)
VALUES (1, 0, 0, '[]'::JSONB, 'mainnet')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE vaults
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_vaults_utxo ON vaults (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vaults_is_spent ON vaults (is_spent);
CREATE INDEX IF NOT EXISTS idx_vaults_contract_addr ON vaults (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE proposals
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_proposals_utxo ON proposals (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposals_is_spent ON proposals (is_spent);
CREATE INDEX IF NOT EXISTS idx_proposals_contract_addr ON proposals (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE streams
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_streams_utxo ON streams (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_streams_is_spent ON streams (is_spent);
CREATE INDEX IF NOT EXISTS idx_streams_contract_addr ON streams (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_payments_utxo ON payments (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_is_spent ON payments (is_spent);
CREATE INDEX IF NOT EXISTS idx_payments_contract_addr ON payments (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE airdrops
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_airdrops_utxo ON airdrops (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_airdrops_is_spent ON airdrops (is_spent);
CREATE INDEX IF NOT EXISTS idx_airdrops_contract_addr ON airdrops (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE rewards
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_rewards_utxo ON rewards (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_is_spent ON rewards (is_spent);
CREATE INDEX IF NOT EXISTS idx_rewards_contract_addr ON rewards (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE bounties
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bounties_utxo ON bounties (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bounties_is_spent ON bounties (is_spent);
CREATE INDEX IF NOT EXISTS idx_bounties_contract_addr ON bounties (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE grants
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_grants_utxo ON grants (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grants_is_spent ON grants (is_spent);
CREATE INDEX IF NOT EXISTS idx_grants_contract_addr ON grants (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE budget_plans
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_budget_plans_utxo ON budget_plans (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_plans_is_spent ON budget_plans (is_spent);
CREATE INDEX IF NOT EXISTS idx_budget_plans_contract_addr ON budget_plans (contract_address) WHERE contract_address IS NOT NULL;

ALTER TABLE governance_votes
    ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
    ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
    ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
    ADD COLUMN IF NOT EXISTS block_height BIGINT,
    ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
    ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS spent_txid TEXT,
    ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
    ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_governance_votes_utxo ON governance_votes (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_governance_votes_is_spent ON governance_votes (is_spent);
CREATE INDEX IF NOT EXISTS idx_governance_votes_contract_addr ON governance_votes (contract_address) WHERE contract_address IS NOT NULL;

COMMIT;
