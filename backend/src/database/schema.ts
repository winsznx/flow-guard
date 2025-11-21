import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_PATH || './flowguard.db';
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS vaults (
    id TEXT PRIMARY KEY,
    vault_id TEXT UNIQUE NOT NULL,
    creator TEXT NOT NULL,
    total_deposit REAL NOT NULL,
    spending_cap REAL NOT NULL,
    approval_threshold INTEGER NOT NULL,
    signers TEXT NOT NULL, -- JSON array
    state INTEGER DEFAULT 0,
    cycle_duration INTEGER NOT NULL,
    unlock_amount REAL NOT NULL,
    is_public INTEGER DEFAULT 0,
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
    approvals TEXT NOT NULL DEFAULT '[]', -- JSON array
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    executed_at DATETIME,
    tx_hash TEXT,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id)
  );

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
    tx_type TEXT NOT NULL, -- 'create', 'unlock', 'proposal', 'approve', 'payout'
    amount REAL,
    from_address TEXT,
    to_address TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
    block_height INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME,
    FOREIGN KEY (vault_id) REFERENCES vaults(vault_id),
    FOREIGN KEY (proposal_id) REFERENCES proposals(id)
  );

`);

// Migrations: Add columns if they don't exist
// This handles existing databases that don't have the columns yet
try {
  const tableInfo = db.prepare("PRAGMA table_info(vaults)").all() as Array<{ name: string }>;

  // Add is_public column
  const hasIsPublic = tableInfo.some(col => col.name === 'is_public');
  if (!hasIsPublic) {
    db.exec(`ALTER TABLE vaults ADD COLUMN is_public INTEGER DEFAULT 0`);
    console.log('Added is_public column to vaults table');
  }

  // Add contract_address column for blockchain integration
  const hasContractAddress = tableInfo.some(col => col.name === 'contract_address');
  if (!hasContractAddress) {
    db.exec(`ALTER TABLE vaults ADD COLUMN contract_address TEXT`);
    console.log('Added contract_address column to vaults table');
  }

  // Add contract_bytecode column for contract deployment
  const hasContractBytecode = tableInfo.some(col => col.name === 'contract_bytecode');
  if (!hasContractBytecode) {
    db.exec(`ALTER TABLE vaults ADD COLUMN contract_bytecode TEXT`);
    console.log('Added contract_bytecode column to vaults table');
  }

  // Add balance column for current on-chain balance
  const hasBalance = tableInfo.some(col => col.name === 'balance');
  if (!hasBalance) {
    db.exec(`ALTER TABLE vaults ADD COLUMN balance REAL DEFAULT 0`);
    console.log('Added balance column to vaults table');
  }

  // Add signer_pubkeys column for storing public keys
  const hasSignerPubkeys = tableInfo.some(col => col.name === 'signer_pubkeys');
  if (!hasSignerPubkeys) {
    db.exec(`ALTER TABLE vaults ADD COLUMN signer_pubkeys TEXT`); // JSON array
    console.log('Added signer_pubkeys column to vaults table');
  }

  // Add start_time column for cycle calculations
  const hasStartTime = tableInfo.some(col => col.name === 'start_time');
  if (!hasStartTime) {
    db.exec(`ALTER TABLE vaults ADD COLUMN start_time DATETIME`);
    console.log('Added start_time column to vaults table');
  }
} catch (error) {
  // Columns might already exist, log warning
  console.warn('Migration error:', error);
}

export default db;

