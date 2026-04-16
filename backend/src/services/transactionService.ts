/**
 * Transaction Service
 * Tracks all on-chain transactions for transparency and history
 */

import { randomUUID } from 'crypto';
import db from '../database/schema.js';

export interface TransactionRecord {
  id: string;
  vaultId: string | null;
  proposalId: string | null;
  txHash: string;
  txType: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
  amount: number | null;
  fromAddress: string | null;
  toAddress: string | null;
  status: 'pending' | 'confirmed' | 'failed';
  blockHeight: number | null;
  createdAt: string;
  confirmedAt: string | null;
}

export class TransactionService {
  /**
   * Record a new transaction
   */
  static async recordTransaction(
    txHash: string,
    txType: TransactionRecord['txType'],
    options: {
      vaultId?: string;
      proposalId?: string;
      amount?: number;
      fromAddress?: string;
      toAddress?: string;
    } = {}
  ): Promise<TransactionRecord> {
    const id = randomUUID();

    const stmt = db!.prepare(`
      INSERT INTO transactions (
        id, vault_id, proposal_id, tx_hash, tx_type, amount,
        from_address, to_address, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    await stmt.run(
      id,
      options.vaultId || null,
      options.proposalId || null,
      txHash,
      txType,
      options.amount || null,
      options.fromAddress || null,
      options.toAddress || null
    );

    const transaction = await this.getTransaction(id);
    if (!transaction) {
      throw new Error(`Failed to retrieve transaction ${id} after insertion`);
    }
    return transaction;
  }

  /**
   * Get transaction by ID
   */
  static async getTransaction(id: string): Promise<TransactionRecord | null> {
    const stmt = db!.prepare('SELECT * FROM transactions WHERE id = ?');
    const row = await stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      txHash: row.tx_hash,
      txType: row.tx_type,
      amount: row.amount,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      status: row.status,
      blockHeight: row.block_height,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }

  /**
   * Get transaction by tx hash
   */
  static async getTransactionByHash(txHash: string): Promise<TransactionRecord | null> {
    const stmt = db!.prepare('SELECT * FROM transactions WHERE tx_hash = ?');
    const row = await stmt.get(txHash) as any;

    if (!row) return null;

    return {
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      txHash: row.tx_hash,
      txType: row.tx_type,
      amount: row.amount,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      status: row.status,
      blockHeight: row.block_height,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    };
  }

  /**
   * Get all transactions for a vault
   */
  static async getVaultTransactions(vaultId: string): Promise<TransactionRecord[]> {
    const stmt = db!.prepare(`
      SELECT * FROM transactions
      WHERE vault_id = ?
         OR vault_id = (SELECT vault_id FROM vaults WHERE id = ? LIMIT 1)
      ORDER BY created_at DESC
    `);
    const rows = await stmt.all(vaultId, vaultId) as any[];

    return rows.map((row) => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      txHash: row.tx_hash,
      txType: row.tx_type,
      amount: row.amount,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      status: row.status,
      blockHeight: row.block_height,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    }));
  }

  /**
   * Update transaction status
   */
  static async updateTransactionStatus(
    txHash: string,
    status: 'pending' | 'confirmed' | 'failed',
    blockHeight?: number
  ): Promise<void> {
    const stmt = db!.prepare(`
      UPDATE transactions 
      SET status = ?, block_height = ?, confirmed_at = ?
      WHERE tx_hash = ?
    `);

    const confirmedAt = status === 'confirmed' ? new Date().toISOString() : null;
    await stmt.run(status, blockHeight || null, confirmedAt, txHash);
  }

  /**
   * Get all pending transactions
   */
  static async getPendingTransactions(): Promise<TransactionRecord[]> {
    const stmt = db!.prepare(`
      SELECT * FROM transactions
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);
    const rows = await stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      txHash: row.tx_hash,
      txType: row.tx_type,
      amount: row.amount,
      fromAddress: row.from_address,
      toAddress: row.to_address,
      status: row.status,
      blockHeight: row.block_height,
      createdAt: row.created_at,
      confirmedAt: row.confirmed_at,
    }));
  }
}
