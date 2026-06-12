-- Self-applied by the indexer on boot (backend/indexer/src/sync-state.ts ensureSchema). This file exists for documentation + manual replay. Safe to re-run.

BEGIN;

CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY,
    last_height BIGINT NOT NULL DEFAULT 0,
    last_safe_height BIGINT NOT NULL DEFAULT 0,
    last_block_hash TEXT NOT NULL DEFAULT '',
    electrum_server TEXT NOT NULL DEFAULT '',
    network TEXT NOT NULL DEFAULT 'mainnet',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recent_blocks (
    height BIGINT PRIMARY KEY,
    hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sync_state (id, last_height, last_safe_height, last_block_hash, electrum_server, network)
VALUES (1, 0, 0, '', '', 'mainnet')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'vaults'
    ) THEN
        ALTER TABLE vaults
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'proposals'
    ) THEN
        ALTER TABLE proposals
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'streams'
    ) THEN
        ALTER TABLE streams
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'payments'
    ) THEN
        ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'budget_plans'
    ) THEN
        ALTER TABLE budget_plans
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'airdrops'
    ) THEN
        ALTER TABLE airdrops
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'rewards'
    ) THEN
        ALTER TABLE rewards
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'bounties'
    ) THEN
        ALTER TABLE bounties
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'grants'
    ) THEN
        ALTER TABLE grants
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'governance_votes'
    ) THEN
        ALTER TABLE governance_votes
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
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
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'governance_proposals'
    ) THEN
        ALTER TABLE governance_proposals
            ADD COLUMN IF NOT EXISTS contract_address TEXT,
            ADD COLUMN IF NOT EXISTS utxo_txid TEXT,
            ADD COLUMN IF NOT EXISTS utxo_vout INTEGER,
            ADD COLUMN IF NOT EXISTS nft_commitment TEXT,
            ADD COLUMN IF NOT EXISTS block_height BIGINT,
            ADD COLUMN IF NOT EXISTS block_timestamp BIGINT,
            ADD COLUMN IF NOT EXISTS is_spent BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS spent_txid TEXT,
            ADD COLUMN IF NOT EXISTS spent_at_height BIGINT,
            ADD COLUMN IF NOT EXISTS created_by_indexer BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_governance_proposals_utxo ON governance_proposals (utxo_txid, utxo_vout) WHERE utxo_txid IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_governance_proposals_is_spent ON governance_proposals (is_spent);
        CREATE INDEX IF NOT EXISTS idx_governance_proposals_contract_addr ON governance_proposals (contract_address) WHERE contract_address IS NOT NULL;
    END IF;
END $$;

COMMIT;
