import Database from 'better-sqlite3';
import path from 'path';

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

// Migration: Add is_public column if it doesn't exist
// This handles existing databases that don't have the column yet
try {
  const tableInfo = db.prepare("PRAGMA table_info(vaults)").all() as Array<{ name: string }>;
  const hasIsPublic = tableInfo.some(col => col.name === 'is_public');
  
  if (!hasIsPublic) {
    db.exec(`ALTER TABLE vaults ADD COLUMN is_public INTEGER DEFAULT 0`);
  }
} catch (error) {
  // Column might already exist, ignore error
  console.warn('Migration check for is_public column:', error);
}

export default db;

