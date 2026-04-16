/**
 * Blockchain Monitor Service
 * Monitors all vault contracts and updates balances
 */

import { ContractService } from './contract-service.js';
import { VaultService } from './vaultService.js';
import db from '../database/schema.js';

export class BlockchainMonitor {
  private contractService: ContractService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.contractService = new ContractService(network);
  }

  /**
   * Start monitoring blockchain for vault balance changes
   * @param intervalMs Monitoring interval in milliseconds (default: 30000 = 30 seconds)
   */
  async start(intervalMs: number = 30000): Promise<void> {
    if (this.isRunning) {
      console.warn('Blockchain monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting blockchain monitor (checking every ${intervalMs / 1000}s)...`);

    // Run initial check
    await this.checkAllVaults();

    // Set up interval for periodic checks
    this.intervalId = setInterval(async () => {
      await this.checkAllVaults();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Blockchain monitor stopped');
  }

  /**
   * Check all vaults and update balances
   */
  private async checkAllVaults(): Promise<void> {
    try {
      // Get all vaults that have contract addresses
      const stmt = db!.prepare('SELECT * FROM vaults WHERE contract_address IS NOT NULL');
      const vaults = await stmt.all() as any[];

      if (vaults.length === 0) {
        console.log('No vaults with contract addresses to monitor');
        return;
      }

      console.log(`Checking ${vaults.length} vault(s) for balance updates...`);

      for (const vault of vaults) {
        try {
          await this.updateVaultBalance(vault.id, vault.contract_address);
        } catch (error) {
          console.error(`Failed to update balance for vault ${vault.vault_id}:`, error);
        }
      }

      console.log('Balance check complete');
    } catch (error) {
      console.error('Error checking vaults:', error);
    }
  }

  /**
   * Update a specific vault's balance
   * @param vaultId Database ID of the vault
   * @param contractAddress Contract address to check
   */
  async updateVaultBalance(vaultId: string, contractAddress: string): Promise<void> {
    try {
      // Get current balance from blockchain
      const balance = await this.contractService.getBalance(contractAddress);

      // Update database
      const stmt = db!.prepare(`
        UPDATE vaults
        SET balance = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      await stmt.run(balance, vaultId);

      console.log(`Updated vault ${vaultId} balance: ${balance} satoshis`);
    } catch (error) {
      console.error(`Failed to update balance for vault ${vaultId}:`, error);
      throw error;
    }
  }

  /**
   * Get UTXOs for a specific vault
   * @param contractAddress Contract address
   */
  async getVaultUTXOs(contractAddress: string) {
    return await this.contractService.getUTXOs(contractAddress);
  }

  /**
   * Monitor a specific transaction until confirmed
   * @param txid Transaction ID
   */
  async waitForConfirmation(txid: string, maxAttempts: number = 60): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const tx = await this.contractService.getTransaction(txid) as any;
        if (tx && tx.confirmations && tx.confirmations > 0) return true;
      } catch {}
      await new Promise(r => setTimeout(r, 10000));
    }
    return false;
  }

  /**
   * Get transaction details
   * @param txid Transaction ID
   */
  async getTransaction(txid: string) {
    return await this.contractService.getTransaction(txid);
  }

  /**
   * Get current block height
   */
  async getBlockHeight(): Promise<number> {
    return await this.contractService.getBlockHeight();
  }
}

// Create singleton instance
let monitorInstance: BlockchainMonitor | null = null;

export function getBlockchainMonitor(): BlockchainMonitor {
  if (!monitorInstance) {
    monitorInstance = new BlockchainMonitor('chipnet');
  }
  return monitorInstance;
}

export function startBlockchainMonitor(intervalMs: number = 30000): void {
  const monitor = getBlockchainMonitor();
  monitor.start(intervalMs);
}

export function stopBlockchainMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop();
  }
}
