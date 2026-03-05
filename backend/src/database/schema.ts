/**
 * Database Schema and Initialization
 * SQLite-only implementation
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3';

// Initialize SQLite database
const dbPath = process.env.DATABASE_PATH || './flowguard.db';
const db = new Database(dbPath);
console.log('Using SQLite database:', dbPath);

// SQL schema for SQLite — all tables defined upfront, no missing tables on fresh install
const createTablesSQL = `
  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    vault_id TEXT UNIQUE NOT NULL,
    name TEXT,
    description TEXT,
    creator TEXT NOT NULL,
    total_deposit REAL NOT NULL,
    spending_cap REAL NOT NULL,
    approval_threshold INTEGER NOT NULL,
    signers TEXT NOT NULL,
    signer_pubkeys TEXT,
    state INTEGER DEFAULT 0,
    cycle_duration INTEGER NOT NULL,
    unlock_amount REAL NOT NULL,
    is_public INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    contract_address TEXT,
    contract_bytecode TEXT,
    constructor_params TEXT,
    balance REAL DEFAULT 0,
    start_time DATETIME,
    tx_hash TEXT,
    deployment_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    proposal_id INTEGER NOT NULL,
    recipient TEXT NOT NULL,
    amount REAL NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    approval_count INTEGER DEFAULT 0,
    approvals TEXT NOT NULL DEFAULT '[]',
    contract_address TEXT,
    constructor_params TEXT,
    payout_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    tx_hash TEXT,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proposal_id) REFERENCES proposals(id),
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
  );

  CREATE INDEX IF NOT EXISTS idx_proposal_exec_sessions_proposal ON proposal_execution_sessions(proposal_id);
  CREATE INDEX IF NOT EXISTS idx_proposal_exec_sessions_status ON proposal_execution_sessions(status);

  CREATE TABLE IF NOT EXISTS cycles (
    id TEXT PRIMARY KEY,
    vault_id TEXT NOT NULL,
    cycle_number INTEGER NOT NULL,
    unlock_time DATETIME NOT NULL,
    unlock_amount REAL NOT NULL,
    unlocked_at DATETIME,
    spent_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
    UNIQUE(vault_id, cycle_number)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    proposal_id TEXT,
    tx_hash TEXT UNIQUE NOT NULL,
    tx_type TEXT NOT NULL,
    amount REAL,
    from_address TEXT,
    to_address TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    block_height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
    FOREIGN KEY (proposal_id) REFERENCES proposals(id)
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
    total_amount REAL NOT NULL,
    withdrawn_amount REAL DEFAULT 0,
    stream_type TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    interval_seconds INTEGER,
    cliff_timestamp INTEGER,
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
    activated_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS stream_claims (
    id TEXT PRIMARY KEY,
    stream_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    amount REAL NOT NULL,
    claimed_at INTEGER DEFAULT (strftime('%s', 'now')),
    tx_hash TEXT,
    FOREIGN KEY (stream_id) REFERENCES streams(stream_id)
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
    total_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'PENDING',
    tx_hash TEXT,
    launch_source TEXT,
    launch_title TEXT,
    launch_description TEXT,
    preferred_lane TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_stream_batches_vault ON stream_batches(vault_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stream_batches_sender ON stream_batches(sender, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stream_batches_status ON stream_batches(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_stream_batches_launch_source ON stream_batches(launch_source, created_at DESC);

  CREATE VIEW IF NOT EXISTS streams_with_vested AS
  SELECT
    s.*,
    CASE
      WHEN s.status != 'ACTIVE' THEN s.withdrawn_amount
      WHEN s.cliff_timestamp IS NOT NULL AND strftime('%s', 'now') < s.cliff_timestamp THEN 0
      WHEN s.end_time IS NULL THEN s.total_amount
      WHEN strftime('%s', 'now') >= s.end_time THEN s.total_amount
      ELSE (s.total_amount * (strftime('%s', 'now') - s.start_time)) / (s.end_time - s.start_time)
    END AS vested_amount,
    CASE
      WHEN s.status != 'ACTIVE' THEN 0
      WHEN s.cliff_timestamp IS NOT NULL AND strftime('%s', 'now') < s.cliff_timestamp THEN 0
      WHEN s.end_time IS NULL THEN s.total_amount - s.withdrawn_amount
      WHEN strftime('%s', 'now') >= s.end_time THEN s.total_amount - s.withdrawn_amount
      ELSE ((s.total_amount * (strftime('%s', 'now') - s.start_time)) / (s.end_time - s.start_time)) - s.withdrawn_amount
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
    amount_per_period REAL NOT NULL,
    interval TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL,
    start_date INTEGER NOT NULL,
    end_date INTEGER,
    next_payment_date INTEGER NOT NULL,
    total_paid REAL DEFAULT 0,
    payment_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'ACTIVE',
    pausable INTEGER DEFAULT 1,
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    tx_hash TEXT,
    activated_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS payment_executions (
    id TEXT PRIMARY KEY,
    payment_id TEXT NOT NULL,
    amount REAL NOT NULL,
    paid_at INTEGER DEFAULT (strftime('%s', 'now')),
    tx_hash TEXT,
    FOREIGN KEY (payment_id) REFERENCES payments(id)
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
    total_amount REAL NOT NULL,
    amount_per_claim REAL NOT NULL,
    total_recipients INTEGER NOT NULL DEFAULT 0,
    claimed_count INTEGER DEFAULT 0,
    claim_link TEXT,
    start_date INTEGER NOT NULL,
    end_date INTEGER,
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
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS airdrop_claims (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    claimer TEXT NOT NULL,
    amount REAL NOT NULL,
    claimed_at INTEGER DEFAULT (strftime('%s', 'now')),
    tx_hash TEXT,
    FOREIGN KEY (campaign_id) REFERENCES airdrops(id)
  );

  CREATE INDEX IF NOT EXISTS idx_airdrops_creator ON airdrops(creator);
  CREATE INDEX IF NOT EXISTS idx_airdrops_status ON airdrops(status);
  CREATE INDEX IF NOT EXISTS idx_airdrop_claims_campaign ON airdrop_claims(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_airdrop_claims_claimer ON airdrop_claims(claimer);

  CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL, -- stream | payment | airdrop
    entity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor TEXT,
    amount REAL,
    status TEXT,
    tx_hash TEXT,
    details TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_activity_events_entity
    ON activity_events(entity_type, entity_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_events_tx_hash
    ON activity_events(tx_hash);

  CREATE TABLE IF NOT EXISTS budget_plans (
    id TEXT PRIMARY KEY,
    vault_id TEXT,
    creator TEXT NOT NULL,
    recipient TEXT NOT NULL,
    recipient_name TEXT,
    token_type TEXT NOT NULL DEFAULT 'BCH',
    token_category TEXT,
    total_amount REAL NOT NULL,
    released_amount REAL DEFAULT 0,
    current_milestone INTEGER DEFAULT 0,
    total_milestones INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING',
    contract_address TEXT,
    constructor_params TEXT,
    nft_commitment TEXT,
    nft_capability TEXT DEFAULT 'mutable',
    tx_hash TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS budget_milestones (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    duration_seconds INTEGER,
    status TEXT DEFAULT 'PENDING',
    FOREIGN KEY (budget_id) REFERENCES budget_plans(id)
  );

  CREATE TABLE IF NOT EXISTS budget_releases (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    milestone_index INTEGER NOT NULL,
    amount REAL NOT NULL,
    released_at INTEGER DEFAULT (strftime('%s', 'now')),
    tx_hash TEXT,
    FOREIGN KEY (budget_id) REFERENCES budget_plans(id)
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT,
    FOREIGN KEY (proposal_id) REFERENCES governance_proposals(id),
    UNIQUE (proposal_id, voter)
  );

  CREATE INDEX IF NOT EXISTS idx_governance_proposals_vault ON governance_proposals(vault_id);
  CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal ON governance_votes(proposal_id);
  CREATE INDEX IF NOT EXISTS idx_governance_votes_voter ON governance_votes(voter);
`;

// Initialize tables
db.pragma('foreign_keys = ON');
db.exec(createTablesSQL);

// Migration: Add columns to existing databases that predate this schema version
// All columns are already included in CREATE TABLE above, so these only apply to old DBs
try {
  const addIfMissing = (tableInfo: Array<{ name: string }>, table: string, col: string, sql: string) => {
    if (!tableInfo.some(c => c.name === col)) {
      db.exec(sql);
      console.log(`Migration: added ${col} to ${table}`);
    }
  };

  const vaultCols = db.prepare('PRAGMA table_info(vaults)').all() as Array<{ name: string }>;
  addIfMissing(vaultCols, 'vaults', 'is_public',          'ALTER TABLE vaults ADD COLUMN is_public INTEGER DEFAULT 0');
  addIfMissing(vaultCols, 'vaults', 'contract_address',   'ALTER TABLE vaults ADD COLUMN contract_address TEXT');
  addIfMissing(vaultCols, 'vaults', 'contract_bytecode',  'ALTER TABLE vaults ADD COLUMN contract_bytecode TEXT');
  addIfMissing(vaultCols, 'vaults', 'balance',            'ALTER TABLE vaults ADD COLUMN balance REAL DEFAULT 0');
  addIfMissing(vaultCols, 'vaults', 'signer_pubkeys',     'ALTER TABLE vaults ADD COLUMN signer_pubkeys TEXT');
  addIfMissing(vaultCols, 'vaults', 'start_time',         'ALTER TABLE vaults ADD COLUMN start_time DATETIME');
  addIfMissing(vaultCols, 'vaults', 'name',               'ALTER TABLE vaults ADD COLUMN name TEXT');
  addIfMissing(vaultCols, 'vaults', 'description',        'ALTER TABLE vaults ADD COLUMN description TEXT');
  addIfMissing(vaultCols, 'vaults', 'constructor_params', 'ALTER TABLE vaults ADD COLUMN constructor_params TEXT');
  addIfMissing(vaultCols, 'vaults', 'deployment_tx_hash', 'ALTER TABLE vaults ADD COLUMN deployment_tx_hash TEXT');
  addIfMissing(vaultCols, 'vaults', 'status',             "ALTER TABLE vaults ADD COLUMN status TEXT DEFAULT 'ACTIVE'");
  addIfMissing(vaultCols, 'vaults', 'tx_hash',            'ALTER TABLE vaults ADD COLUMN tx_hash TEXT');

  const proposalCols = db.prepare('PRAGMA table_info(proposals)').all() as Array<{ name: string }>;
  addIfMissing(proposalCols, 'proposals', 'constructor_params', 'ALTER TABLE proposals ADD COLUMN constructor_params TEXT');
  addIfMissing(proposalCols, 'proposals', 'contract_address',   'ALTER TABLE proposals ADD COLUMN contract_address TEXT');
  addIfMissing(proposalCols, 'proposals', 'payout_hash',        'ALTER TABLE proposals ADD COLUMN payout_hash TEXT');

  const streamCols = db.prepare('PRAGMA table_info(streams)').all() as Array<{ name: string }>;
  addIfMissing(streamCols, 'streams', 'constructor_params', 'ALTER TABLE streams ADD COLUMN constructor_params TEXT');
  addIfMissing(streamCols, 'streams', 'contract_address',   'ALTER TABLE streams ADD COLUMN contract_address TEXT');
  addIfMissing(streamCols, 'streams', 'token_type',         "ALTER TABLE streams ADD COLUMN token_type TEXT DEFAULT 'BCH'");
  addIfMissing(streamCols, 'streams', 'token_category',     'ALTER TABLE streams ADD COLUMN token_category TEXT');
  addIfMissing(streamCols, 'streams', 'nft_commitment',     'ALTER TABLE streams ADD COLUMN nft_commitment TEXT');
  addIfMissing(streamCols, 'streams', 'nft_capability',     "ALTER TABLE streams ADD COLUMN nft_capability TEXT DEFAULT 'mutable'");
  addIfMissing(streamCols, 'streams', 'schedule_template',  'ALTER TABLE streams ADD COLUMN schedule_template TEXT');
  addIfMissing(streamCols, 'streams', 'launch_source',      'ALTER TABLE streams ADD COLUMN launch_source TEXT');
  addIfMissing(streamCols, 'streams', 'launch_title',       'ALTER TABLE streams ADD COLUMN launch_title TEXT');
  addIfMissing(streamCols, 'streams', 'launch_description', 'ALTER TABLE streams ADD COLUMN launch_description TEXT');
  addIfMissing(streamCols, 'streams', 'preferred_lane',     'ALTER TABLE streams ADD COLUMN preferred_lane TEXT');
  addIfMissing(streamCols, 'streams', 'description',        'ALTER TABLE streams ADD COLUMN description TEXT');
  addIfMissing(streamCols, 'streams', 'tx_hash',            'ALTER TABLE streams ADD COLUMN tx_hash TEXT');
  addIfMissing(streamCols, 'streams', 'activated_at',       'ALTER TABLE streams ADD COLUMN activated_at INTEGER');
  addIfMissing(streamCols, 'streams', 'refillable',         'ALTER TABLE streams ADD COLUMN refillable INTEGER DEFAULT 0');
  addIfMissing(streamCols, 'streams', 'batch_id',           'ALTER TABLE streams ADD COLUMN batch_id TEXT');

  const paymentCols = db.prepare('PRAGMA table_info(payments)').all() as Array<{ name: string }>;
  addIfMissing(paymentCols, 'payments', 'constructor_params', 'ALTER TABLE payments ADD COLUMN constructor_params TEXT');
  addIfMissing(paymentCols, 'payments', 'contract_address',   'ALTER TABLE payments ADD COLUMN contract_address TEXT');
  addIfMissing(paymentCols, 'payments', 'token_type',         "ALTER TABLE payments ADD COLUMN token_type TEXT DEFAULT 'BCH'");
  addIfMissing(paymentCols, 'payments', 'token_category',     'ALTER TABLE payments ADD COLUMN token_category TEXT');
  addIfMissing(paymentCols, 'payments', 'nft_commitment',     'ALTER TABLE payments ADD COLUMN nft_commitment TEXT');
  addIfMissing(paymentCols, 'payments', 'nft_capability',     "ALTER TABLE payments ADD COLUMN nft_capability TEXT DEFAULT 'mutable'");
  addIfMissing(paymentCols, 'payments', 'tx_hash',            'ALTER TABLE payments ADD COLUMN tx_hash TEXT');
  addIfMissing(paymentCols, 'payments', 'activated_at',       'ALTER TABLE payments ADD COLUMN activated_at INTEGER');

  const airdropCols = db.prepare('PRAGMA table_info(airdrops)').all() as Array<{ name: string }>;
  addIfMissing(airdropCols, 'airdrops', 'constructor_params',      'ALTER TABLE airdrops ADD COLUMN constructor_params TEXT');
  addIfMissing(airdropCols, 'airdrops', 'token_type',              "ALTER TABLE airdrops ADD COLUMN token_type TEXT DEFAULT 'BCH'");
  addIfMissing(airdropCols, 'airdrops', 'token_category',          'ALTER TABLE airdrops ADD COLUMN token_category TEXT');
  addIfMissing(airdropCols, 'airdrops', 'nft_commitment',          'ALTER TABLE airdrops ADD COLUMN nft_commitment TEXT');
  addIfMissing(airdropCols, 'airdrops', 'nft_capability',          "ALTER TABLE airdrops ADD COLUMN nft_capability TEXT DEFAULT 'mutable'");
  addIfMissing(airdropCols, 'airdrops', 'merkle_root',             'ALTER TABLE airdrops ADD COLUMN merkle_root TEXT');
  addIfMissing(airdropCols, 'airdrops', 'merkle_data',             'ALTER TABLE airdrops ADD COLUMN merkle_data TEXT');
  addIfMissing(airdropCols, 'airdrops', 'tx_hash',                 'ALTER TABLE airdrops ADD COLUMN tx_hash TEXT');
  addIfMissing(airdropCols, 'airdrops', 'claim_authority_privkey', 'ALTER TABLE airdrops ADD COLUMN claim_authority_privkey TEXT');

  const budgetCols = db.prepare('PRAGMA table_info(budget_plans)').all() as Array<{ name: string }>;
  addIfMissing(budgetCols, 'budget_plans', 'tx_hash',            'ALTER TABLE budget_plans ADD COLUMN tx_hash TEXT');
  addIfMissing(budgetCols, 'budget_plans', 'contract_address',   'ALTER TABLE budget_plans ADD COLUMN contract_address TEXT');
  addIfMissing(budgetCols, 'budget_plans', 'constructor_params', 'ALTER TABLE budget_plans ADD COLUMN constructor_params TEXT');
  addIfMissing(budgetCols, 'budget_plans', 'token_type',         "ALTER TABLE budget_plans ADD COLUMN token_type TEXT DEFAULT 'BCH'");
  addIfMissing(budgetCols, 'budget_plans', 'token_category',     'ALTER TABLE budget_plans ADD COLUMN token_category TEXT');
  addIfMissing(budgetCols, 'budget_plans', 'nft_commitment',     'ALTER TABLE budget_plans ADD COLUMN nft_commitment TEXT');
  addIfMissing(budgetCols, 'budget_plans', 'nft_capability',     "ALTER TABLE budget_plans ADD COLUMN nft_capability TEXT DEFAULT 'mutable'");

  const govVoteCols = db.prepare('PRAGMA table_info(governance_votes)').all() as Array<{ name: string }>;
  addIfMissing(govVoteCols, 'governance_votes', 'contract_address',   'ALTER TABLE governance_votes ADD COLUMN contract_address TEXT');
  addIfMissing(govVoteCols, 'governance_votes', 'constructor_params', 'ALTER TABLE governance_votes ADD COLUMN constructor_params TEXT');
  addIfMissing(govVoteCols, 'governance_votes', 'nft_commitment',     'ALTER TABLE governance_votes ADD COLUMN nft_commitment TEXT');
  addIfMissing(govVoteCols, 'governance_votes', 'vote_id',            'ALTER TABLE governance_votes ADD COLUMN vote_id TEXT');
  addIfMissing(govVoteCols, 'governance_votes', 'lock_tx_hash',       'ALTER TABLE governance_votes ADD COLUMN lock_tx_hash TEXT');
  addIfMissing(govVoteCols, 'governance_votes', 'updated_at',         'ALTER TABLE governance_votes ADD COLUMN updated_at TEXT');

} catch (error) {
  console.warn('Migration error (non-fatal):', error);
}

// Export database instance
export { db };
export default db;
