-- FlowGuard — PostgreSQL schema
-- Translated from backend/src/database/schema.ts (SQLite)
-- Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    vault_id TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    creator TEXT NOT NULL,
    total_deposit DOUBLE PRECISION NOT NULL,
    spending_cap DOUBLE PRECISION NOT NULL,
    approval_threshold INTEGER NOT NULL,
    signers TEXT NOT NULL,
    signer_pubkeys TEXT,
    state INTEGER DEFAULT 0,
    cycle_duration INTEGER NOT NULL,
    unlock_amount DOUBLE PRECISION NOT NULL,
    is_public INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    contract_address TEXT,
    contract_bytecode TEXT,
    constructor_params TEXT,
    balance DOUBLE PRECISION DEFAULT 0,
    start_time TIMESTAMPTZ,
    tx_hash TEXT,
    deployment_tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    proposal_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approval_count INTEGER DEFAULT 0,
    approvals TEXT NOT NULL DEFAULT '[]',
    contract_address TEXT,
    constructor_params TEXT,
    payout_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ,
    tx_hash TEXT
);

CREATE TABLE IF NOT EXISTS proposal_execution_sessions (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    vault_id TEXT NOT NULL,
    signer_addresses TEXT NOT NULL,
    signer_pubkeys TEXT NOT NULL,
    signed_by TEXT NOT NULL DEFAULT '[]',
    required_signatures INTEGER NOT NULL DEFAULT 2,
    tx_hex TEXT NOT NULL,
    source_outputs TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    broadcast_tx_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_proposal_exec_sessions_proposal ON proposal_execution_sessions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_exec_sessions_status ON proposal_execution_sessions(status);

CREATE TABLE IF NOT EXISTS cycles (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    unlock_time TIMESTAMPTZ NOT NULL,
    unlock_amount DOUBLE PRECISION NOT NULL,
    unlocked_at TIMESTAMPTZ,
    spent_amount DOUBLE PRECISION DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(vault_id, cycle_number)
);

CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    proposal_id TEXT,
    tx_hash TEXT UNIQUE NOT NULL,
    tx_type TEXT NOT NULL,
    amount DOUBLE PRECISION,
    from_address TEXT,
    to_address TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    block_height INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS streams (
    id TEXT PRIMARY KEY,
    stream_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    batch_id TEXT,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    total_amount DOUBLE PRECISION NOT NULL,
    withdrawn_amount DOUBLE PRECISION DEFAULT 0,
    stream_type TEXT NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT,
    interval_seconds INTEGER,
    cliff_timestamp BIGINT,
    cancelable INTEGER DEFAULT 1,
    transferable INTEGER DEFAULT 0,
    refillable INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    schedule_template TEXT,
    launch_source TEXT,
    launch_title TEXT,
    launch_description TEXT,
    preferred_lane TEXT,
    description TEXT,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    tx_hash TEXT,
    activated_at BIGINT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS stream_claims (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    claimed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_streams_recipient ON streams(recipient);
CREATE INDEX IF NOT EXISTS idx_streams_sender ON streams(sender);
CREATE INDEX IF NOT EXISTS idx_streams_status ON streams(status);
CREATE INDEX IF NOT EXISTS idx_streams_vault_context ON streams(vault_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streams_launch_source ON streams(launch_source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streams_batch_id ON streams(batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_stream ON stream_claims(stream_id);

CREATE TABLE IF NOT EXISTS stream_batches (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    sender TEXT NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    stream_count INTEGER NOT NULL DEFAULT 0,
    total_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    tx_hash TEXT,
    launch_source TEXT,
    launch_title TEXT,
    launch_description TEXT,
    preferred_lane TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_stream_batches_vault ON stream_batches(vault_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_batches_sender ON stream_batches(sender, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_batches_status ON stream_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stream_batches_launch_source ON stream_batches(launch_source, created_at DESC);

CREATE OR REPLACE VIEW streams_with_vested AS
SELECT
    s.*,
    CASE
        WHEN s.status <> 'ACTIVE' THEN s.withdrawn_amount
        WHEN s.cliff_timestamp IS NOT NULL AND EXTRACT(EPOCH FROM NOW())::BIGINT < s.cliff_timestamp THEN 0
        WHEN s.end_time IS NULL THEN s.total_amount
        WHEN EXTRACT(EPOCH FROM NOW())::BIGINT >= s.end_time THEN s.total_amount
        ELSE (s.total_amount * (EXTRACT(EPOCH FROM NOW())::BIGINT - s.start_time)) / (s.end_time - s.start_time)
    END AS vested_amount,
    CASE
        WHEN s.status <> 'ACTIVE' THEN 0
        WHEN s.cliff_timestamp IS NOT NULL AND EXTRACT(EPOCH FROM NOW())::BIGINT < s.cliff_timestamp THEN 0
        WHEN s.end_time IS NULL THEN s.total_amount - s.withdrawn_amount
        WHEN EXTRACT(EPOCH FROM NOW())::BIGINT >= s.end_time THEN s.total_amount - s.withdrawn_amount
        ELSE ((s.total_amount * (EXTRACT(EPOCH FROM NOW())::BIGINT - s.start_time)) / (s.end_time - s.start_time)) - s.withdrawn_amount
    END AS claimable_amount
FROM streams s;

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    payment_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    sender TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_name TEXT,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    amount_per_period DOUBLE PRECISION NOT NULL,
    "interval" TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL,
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    next_payment_date BIGINT NOT NULL,
    total_paid DOUBLE PRECISION DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    pausable INTEGER DEFAULT 1,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    tx_hash TEXT,
    activated_at BIGINT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS payment_executions (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    paid_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_sender ON payments(sender);
CREATE INDEX IF NOT EXISTS idx_payments_recipient ON payments(recipient);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS airdrops (
    id TEXT PRIMARY KEY,
    campaign_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    campaign_type TEXT NOT NULL DEFAULT 'AIRDROP',
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    total_amount DOUBLE PRECISION NOT NULL,
    amount_per_claim DOUBLE PRECISION NOT NULL,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    claimed_count INTEGER DEFAULT 0,
    claim_link TEXT,
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    status TEXT DEFAULT 'ACTIVE',
    require_kyc INTEGER DEFAULT 0,
    max_claims_per_address INTEGER DEFAULT 1,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    merkle_root TEXT,
    merkle_data TEXT,
    tx_hash TEXT,
    claim_authority_privkey TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS airdrop_claims (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    claimer TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    claimed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_airdrops_creator ON airdrops(creator);
CREATE INDEX IF NOT EXISTS idx_airdrops_status ON airdrops(status);
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_campaign ON airdrop_claims(campaign_id);
CREATE INDEX IF NOT EXISTS idx_airdrop_claims_claimer ON airdrop_claims(claimer);
CREATE UNIQUE INDEX IF NOT EXISTS idx_airdrop_claims_unique ON airdrop_claims(campaign_id, claimer);

CREATE TABLE IF NOT EXISTS rewards (
    id TEXT PRIMARY KEY,
    campaign_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    reward_category TEXT NOT NULL DEFAULT 'CUSTOM',
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    total_pool DOUBLE PRECISION NOT NULL,
    max_reward_amount DOUBLE PRECISION NOT NULL,
    distributed_count INTEGER DEFAULT 0,
    distributed_total DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    authority_privkey TEXT,
    tx_hash TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS reward_distributions (
    id TEXT PRIMARY KEY,
    reward_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    reward_category TEXT,
    tx_hash TEXT,
    distributed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_rewards_creator ON rewards(creator);
CREATE INDEX IF NOT EXISTS idx_rewards_status ON rewards(status);
CREATE INDEX IF NOT EXISTS idx_reward_distributions_reward ON reward_distributions(reward_id);
CREATE INDEX IF NOT EXISTS idx_reward_distributions_recipient ON reward_distributions(recipient);

CREATE TABLE IF NOT EXISTS bounties (
    id TEXT PRIMARY KEY,
    campaign_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    reward_per_winner DOUBLE PRECISION NOT NULL,
    max_winners INTEGER NOT NULL,
    winners_count INTEGER DEFAULT 0,
    total_paid DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'PENDING',
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    authority_privkey TEXT,
    tx_hash TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS bounty_claims (
    id TEXT PRIMARY KEY,
    bounty_id TEXT NOT NULL,
    winner TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    proof_hash TEXT,
    tx_hash TEXT,
    claimed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_bounties_creator ON bounties(creator);
CREATE INDEX IF NOT EXISTS idx_bounties_status ON bounties(status);
CREATE INDEX IF NOT EXISTS idx_bounty_claims_bounty ON bounty_claims(bounty_id);
CREATE INDEX IF NOT EXISTS idx_bounty_claims_winner ON bounty_claims(winner);

CREATE TABLE IF NOT EXISTS grants (
    id TEXT PRIMARY KEY,
    campaign_id TEXT UNIQUE NOT NULL,
    vault_id TEXT,
    creator TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    recipient TEXT NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    milestones_total INTEGER NOT NULL,
    amount_per_milestone DOUBLE PRECISION NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL,
    milestones_completed INTEGER DEFAULT 0,
    total_released DOUBLE PRECISION DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    authority_privkey TEXT,
    cancelable INTEGER DEFAULT 1,
    transferable INTEGER DEFAULT 0,
    tx_hash TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS grant_milestones (
    id TEXT PRIMARY KEY,
    grant_id TEXT NOT NULL,
    milestone_number INTEGER NOT NULL,
    title TEXT,
    description TEXT,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    tx_hash TEXT,
    released_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_grants_creator ON grants(creator);
CREATE INDEX IF NOT EXISTS idx_grants_status ON grants(status);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_grant ON grant_milestones(grant_id);

CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT,
    amount DOUBLE PRECISION,
    status TEXT,
    tx_hash TEXT,
    details TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);
CREATE INDEX IF NOT EXISTS idx_activity_events_entity ON activity_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_tx_hash ON activity_events(tx_hash);

CREATE TABLE IF NOT EXISTS budget_plans (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    creator TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_name TEXT,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    total_amount DOUBLE PRECISION NOT NULL,
    released_amount DOUBLE PRECISION DEFAULT 0,
    current_milestone INTEGER DEFAULT 0,
    total_milestones INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    tx_hash TEXT,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
);

CREATE TABLE IF NOT EXISTS budget_milestones (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    description TEXT,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS budget_releases (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    released_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
    tx_hash TEXT
);

CREATE TABLE IF NOT EXISTS governance_proposals (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    proposer TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    votes_for INTEGER NOT NULL DEFAULT 0,
    votes_against INTEGER NOT NULL DEFAULT 0,
    votes_abstain INTEGER NOT NULL DEFAULT 0,
    quorum INTEGER NOT NULL DEFAULT 0,
    voting_ends_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
    updated_at TEXT NOT NULL DEFAULT NOW()::TEXT
);

CREATE TABLE IF NOT EXISTS governance_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    voter TEXT NOT NULL,
    vote TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    vote_id TEXT,
    lock_tx_hash TEXT,
    created_at TEXT NOT NULL DEFAULT NOW()::TEXT,
    updated_at TEXT,
    UNIQUE (proposal_id, voter)
);
CREATE INDEX IF NOT EXISTS idx_governance_proposals_vault ON governance_proposals(vault_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter);
