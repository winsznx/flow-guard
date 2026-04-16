/**
 * Transaction Monitor Service
 * Monitors pending transactions and updates their status in the database
 */

import { ElectrumNetworkProvider } from 'cashscript';
import db from '../database/schema.js';

interface PendingTransaction {
  id: string;
  resourceType: 'stream' | 'payment' | 'airdrop' | 'governance' | 'budget_plan' | 'vault' | 'proposal';
  resourceId: string;
  txHash: string;
  expectedStatus: string; // Status to set when confirmed (e.g., 'ACTIVE', 'COMPLETED')
  createdAt: number;
}

export class TransactionMonitor {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Start monitoring pending transactions
   */
  start(intervalMs: number = 30000): void {
    if (this.isRunning) {
      console.log('[TransactionMonitor] Already running');
      return;
    }

    console.log(`[TransactionMonitor] Starting (interval: ${intervalMs}ms)`);
    this.isRunning = true;

    // Run immediately
    this.checkPendingTransactions().catch(err => {
      console.error('[TransactionMonitor] Error:', err);
    });

    // Then run periodically
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.checkPendingTransactions();
      } catch (error) {
        console.error('[TransactionMonitor] Error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isRunning = false;
    console.log('[TransactionMonitor] Stopped');
  }

  /**
   * Check all pending transactions
   */
  private async checkPendingTransactions(): Promise<void> {
    const pending = await this.getPendingTransactions();

    if (pending.length === 0) {
      return;
    }

    console.log(`[TransactionMonitor] Checking ${pending.length} pending transactions`);

    for (const tx of pending) {
      try {
        await this.checkTransaction(tx);
      } catch (error: any) {
        console.error(`[TransactionMonitor] Error checking tx ${tx.txHash}:`, error.message);
      }
    }
  }

  /**
   * Get all pending transactions from database
   */
  private async getPendingTransactions(): Promise<PendingTransaction[]> {
    const pending: PendingTransaction[] = [];

    try {
      // Get pending streams (PENDING status, has tx_hash)
      const streams = await db!.prepare(`
        SELECT id, tx_hash, created_at
        FROM streams
        WHERE status = 'PENDING' AND tx_hash IS NOT NULL AND tx_hash != ''
      `).all() as any[];

      for (const stream of streams) {
        pending.push({
          id: stream.id,
          resourceType: 'stream',
          resourceId: stream.id,
          txHash: stream.tx_hash,
          expectedStatus: 'ACTIVE',
          createdAt: stream.created_at,
        });
      }

      // Get pending payments
      const payments = await db!.prepare(`
        SELECT id, tx_hash, created_at
        FROM payments
        WHERE status = 'PENDING' AND tx_hash IS NOT NULL AND tx_hash != ''
      `).all() as any[];

      for (const payment of payments) {
        pending.push({
          id: payment.id,
          resourceType: 'payment',
          resourceId: payment.id,
          txHash: payment.tx_hash,
          expectedStatus: 'ACTIVE',
          createdAt: payment.created_at,
        });
      }

      // Get pending airdrops
      const airdrops = await db!.prepare(`
        SELECT id, tx_hash, created_at
        FROM airdrops
        WHERE status = 'PENDING' AND tx_hash IS NOT NULL AND tx_hash != ''
      `).all() as any[];

      for (const airdrop of airdrops) {
        pending.push({
          id: airdrop.id,
          resourceType: 'airdrop',
          resourceId: airdrop.id,
          txHash: airdrop.tx_hash,
          expectedStatus: 'ACTIVE',
          createdAt: airdrop.created_at,
        });
      }

      // Get pending budget plans
      const budgetPlans = await db!.prepare(`
        SELECT id, tx_hash, created_at
        FROM budget_plans
        WHERE status = 'PENDING' AND tx_hash IS NOT NULL AND tx_hash != ''
      `).all() as any[];

      for (const plan of budgetPlans) {
        pending.push({
          id: plan.id,
          resourceType: 'budget_plan',
          resourceId: plan.id,
          txHash: plan.tx_hash,
          expectedStatus: 'ACTIVE',
          createdAt: plan.created_at,
        });
      }

      // Get pending vaults (deployment_tx_hash)
      const vaults = await db!.prepare(`
        SELECT vault_id, deployment_tx_hash, created_at
        FROM vaults
        WHERE status = 'PENDING' AND deployment_tx_hash IS NOT NULL AND deployment_tx_hash != ''
      `).all() as any[];

      for (const vault of vaults) {
        pending.push({
          id: vault.vault_id,
          resourceType: 'vault',
          resourceId: vault.vault_id,
          txHash: vault.deployment_tx_hash,
          expectedStatus: 'ACTIVE',
          createdAt: vault.created_at,
        });
      }

      return pending;
    } catch (error: any) {
      console.error('[TransactionMonitor] Error getting pending transactions:', error);
      return [];
    }
  }

  /**
   * Check if a specific transaction is confirmed
   */
  private async checkTransaction(tx: PendingTransaction): Promise<void> {
    try {
      // Query blockchain for transaction
      const txData = await this.provider.getRawTransaction(tx.txHash);

      if (!txData) {
        // Transaction not found - might be dropped or invalid
        const age = Date.now() / 1000 - tx.createdAt;

        // If older than 1 hour, mark as failed
        if (age > 3600) {
          console.log(`[TransactionMonitor] Transaction ${tx.txHash} not found after 1 hour - marking as failed`);
          await this.markTransactionFailed(tx);
        }
        return;
      }

      // Transaction found - mark as confirmed
      console.log(`[TransactionMonitor] Transaction ${tx.txHash} confirmed - updating status`);
      await this.markTransactionConfirmed(tx);

    } catch (error: any) {
      // If error is "transaction not found", that's expected for pending txs
      if (error.message && !error.message.includes('not found')) {
        console.error(`[TransactionMonitor] Error checking transaction ${tx.txHash}:`, error.message);
      }
    }
  }

  /**
   * Mark transaction as confirmed and update resource status
   */
  private async markTransactionConfirmed(tx: PendingTransaction): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    try {
      switch (tx.resourceType) {
        case 'stream':
          await db!.prepare(`
            UPDATE streams
            SET status = ?, updated_at = ?
            WHERE id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;

        case 'payment':
          await db!.prepare(`
            UPDATE payments
            SET status = ?, updated_at = ?
            WHERE id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;

        case 'airdrop':
          await db!.prepare(`
            UPDATE airdrops
            SET status = ?, updated_at = ?
            WHERE id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;

        case 'budget_plan':
          await db!.prepare(`
            UPDATE budget_plans
            SET status = ?, updated_at = ?
            WHERE id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;

        case 'vault':
          await db!.prepare(`
            UPDATE vaults
            SET status = ?, updated_at = ?
            WHERE vault_id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;

        case 'proposal':
          await db!.prepare(`
            UPDATE proposals
            SET status = ?, updated_at = ?
            WHERE id = ?
          `).run(tx.expectedStatus, now, tx.resourceId);
          break;
      }

      console.log(`[TransactionMonitor] Updated ${tx.resourceType} ${tx.resourceId} to ${tx.expectedStatus}`);
    } catch (error: any) {
      console.error(`[TransactionMonitor] Error updating ${tx.resourceType}:`, error);
    }
  }

  /**
   * Mark transaction as failed (not found after timeout)
   */
  private async markTransactionFailed(tx: PendingTransaction): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    try {
      switch (tx.resourceType) {
        case 'stream':
          await db!.prepare(`
            UPDATE streams
            SET status = 'FAILED', updated_at = ?
            WHERE id = ?
          `).run(now, tx.resourceId);
          break;

        case 'payment':
          await db!.prepare(`
            UPDATE payments
            SET status = 'FAILED', updated_at = ?
            WHERE id = ?
          `).run(now, tx.resourceId);
          break;

        case 'airdrop':
          await db!.prepare(`
            UPDATE airdrops
            SET status = 'FAILED', updated_at = ?
            WHERE id = ?
          `).run(now, tx.resourceId);
          break;

        case 'budget_plan':
          await db!.prepare(`
            UPDATE budget_plans
            SET status = 'FAILED', updated_at = ?
            WHERE id = ?
          `).run(now, tx.resourceId);
          break;

        case 'vault':
          await db!.prepare(`
            UPDATE vaults
            SET status = 'FAILED', updated_at = ?
            WHERE vault_id = ?
          `).run(now, tx.resourceId);
          break;
      }

      console.log(`[TransactionMonitor] Marked ${tx.resourceType} ${tx.resourceId} as FAILED`);
    } catch (error: any) {
      console.error(`[TransactionMonitor] Error marking as failed:`, error);
    }
  }
}

// Singleton instance
let monitorInstance: TransactionMonitor | null = null;

/**
 * Start the transaction monitor service
 */
export function startTransactionMonitor(intervalMs: number = 30000): void {
  if (monitorInstance) {
    console.log('[TransactionMonitor] Already started');
    return;
  }

  const network = (process.env.BCH_NETWORK || 'chipnet') as 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';
  monitorInstance = new TransactionMonitor(network);
  monitorInstance.start(intervalMs);
}

/**
 * Stop the transaction monitor service
 */
export function stopTransactionMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
    monitorInstance = null;
  }
}
