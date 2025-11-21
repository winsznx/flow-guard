/**
 * Cycle Unlock Scheduler
 * Monitors vaults and triggers cycle unlocks when conditions are met
 */

import db from '../database/schema';
import { VaultService } from './vaultService';
import { StateService } from './state-service';
import { ContractService } from './contract-service';

export interface CycleUnlockResult {
  vaultId: string;
  cycleNumber: number;
  unlocked: boolean;
  transaction?: any;
  error?: string;
}

export class CycleUnlockScheduler {
  private contractService: ContractService;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.contractService = new ContractService(network);
  }

  /**
   * Start monitoring and unlocking cycles
   * @param intervalMs Check interval in milliseconds (default: 60000 = 1 minute)
   */
  async start(intervalMs: number = 60000): Promise<void> {
    if (this.isRunning) {
      console.warn('Cycle unlock scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log(`Starting cycle unlock scheduler (checking every ${intervalMs / 1000}s)...`);

    // Run initial check
    await this.checkAndUnlockCycles();

    // Set up interval for periodic checks
    this.intervalId = setInterval(async () => {
      await this.checkAndUnlockCycles();
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
    console.log('Cycle unlock scheduler stopped');
  }

  /**
   * Check all vaults and unlock eligible cycles
   */
  private async checkAndUnlockCycles(): Promise<void> {
    try {
      // Get all vaults with contract addresses
      const stmt = db.prepare(`
        SELECT * FROM vaults 
        WHERE contract_address IS NOT NULL 
        AND cycle_duration > 0
      `);
      const vaults = stmt.all() as any[];

      if (vaults.length === 0) {
        return;
      }

      console.log(`Checking ${vaults.length} vault(s) for cycle unlocks...`);

      for (const vault of vaults) {
        try {
          await this.processVaultCycles(vault);
        } catch (error) {
          console.error(`Failed to process cycles for vault ${vault.vault_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error checking cycles:', error);
    }
  }

  /**
   * Process cycles for a specific vault
   */
  private async processVaultCycles(vault: any): Promise<void> {
    const vaultStartTime = this.getVaultStartTime(vault);
    const cycleDuration = vault.cycle_duration;
    const currentState = vault.state || 0;

    // Calculate current cycle
    const currentCycle = StateService.getCurrentCycle(vaultStartTime, cycleDuration);

    // Check cycles that should be unlocked (up to current cycle)
    for (let cycleNumber = 0; cycleNumber <= currentCycle && cycleNumber < 16; cycleNumber++) {
      // Check if cycle can be unlocked
      if (StateService.canUnlockCycle(currentState, cycleNumber, vaultStartTime, cycleDuration)) {
        console.log(`Cycle ${cycleNumber} is eligible for unlock in vault ${vault.vault_id}`);

        // Create cycle unlock record in database if it doesn't exist
        await this.ensureCycleRecord(vault.vault_id, cycleNumber, vaultStartTime, cycleDuration);

        // Note: The actual on-chain unlock transaction would be created here
        // For now, we just log and update the database state
        // In production, this would:
        // 1. Create the unlock transaction
        // 2. Queue it for signing by a signer
        // 3. Update state once confirmed
      }
    }
  }

  /**
   * Ensure cycle record exists in database
   */
  private async ensureCycleRecord(
    vaultId: string,
    cycleNumber: number,
    vaultStartTime: number,
    cycleDuration: number
  ): Promise<void> {
    const unlockTime = vaultStartTime + cycleNumber * cycleDuration;

    // Check if cycle record exists
    const stmt = db.prepare(`
      SELECT * FROM cycles 
      WHERE vault_id = ? AND cycle_number = ?
    `);
    const existing = stmt.get(vaultId, cycleNumber) as any;

    if (!existing) {
      // Create cycle record
      const id = require('crypto').randomUUID();
      const insertStmt = db.prepare(`
        INSERT INTO cycles (
          id, vault_id, cycle_number, unlock_time, unlock_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const vault = VaultService.getVaultByVaultId(vaultId);
      const unlockAmount = vault?.unlockAmount || 0;

      insertStmt.run(
        id,
        vaultId,
        cycleNumber,
        new Date(unlockTime * 1000).toISOString(),
        unlockAmount,
        'pending'
      );

      console.log(`Created cycle record for vault ${vaultId}, cycle ${cycleNumber}`);
    }
  }

  /**
   * Get vault start time (from created_at or a dedicated field)
   */
  private getVaultStartTime(vault: any): number {
    // If vault has a start_time field, use it
    // Otherwise, use created_at timestamp
    const startTime = vault.start_time || vault.created_at;
    return Math.floor(new Date(startTime).getTime() / 1000);
  }

  /**
   * Create unlock transaction for a specific cycle
   */
  async createUnlockTransaction(
    vaultId: string,
    cycleNumber: number,
    signerPublicKey: string
  ): Promise<{ transaction: any; newState: number }> {
    const vault = VaultService.getVaultByVaultId(vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    // Verify signer is authorized
    const signerIndex = vault.signerPubkeys.findIndex(
      pk => pk.toLowerCase() === signerPublicKey.toLowerCase()
    );
    if (signerIndex === -1) {
      throw new Error('Signer not authorized');
    }

    const vaultStartTime = this.getVaultStartTime(vault as any);
    const currentState = vault.state || 0;

    // Verify cycle can be unlocked
    if (!StateService.canUnlockCycle(currentState, cycleNumber, vaultStartTime, vault.cycleDuration)) {
      throw new Error(`Cycle ${cycleNumber} cannot be unlocked yet`);
    }

    // Create unlock transaction
    const result = await this.contractService.createCycleUnlock(
      vault.contractAddress,
      cycleNumber,
      currentState,
      vaultStartTime,
      vault.cycleDuration,
      vault.signerPubkeys
    );

    return result;
  }

  /**
   * Process a specific cycle unlock (called manually or by scheduler)
   */
  async unlockCycle(vaultId: string, cycleNumber: number): Promise<CycleUnlockResult> {
    try {
      const vault = VaultService.getVaultByVaultId(vaultId);
      if (!vault) {
        return {
          vaultId,
          cycleNumber,
          unlocked: false,
          error: 'Vault not found',
        };
      }

      const vaultStartTime = this.getVaultStartTime(vault as any);
      const currentState = vault.state || 0;

      // Check if cycle can be unlocked
      if (!StateService.canUnlockCycle(currentState, cycleNumber, vaultStartTime, vault.cycleDuration)) {
        return {
          vaultId,
          cycleNumber,
          unlocked: false,
          error: 'Cycle cannot be unlocked yet',
        };
      }

      // Calculate new state
      const newState = StateService.setCycleUnlocked(currentState, cycleNumber);

      // Update vault state in database
      VaultService.updateVaultState(vaultId, newState);

      // Update cycle record
      const stmt = db.prepare(`
        UPDATE cycles 
        SET status = 'unlocked', unlocked_at = CURRENT_TIMESTAMP
        WHERE vault_id = ? AND cycle_number = ?
      `);
      stmt.run(vaultId, cycleNumber);

      console.log(`Unlocked cycle ${cycleNumber} for vault ${vaultId}`);

      return {
        vaultId,
        cycleNumber,
        unlocked: true,
      };
    } catch (error) {
      console.error(`Failed to unlock cycle ${cycleNumber} for vault ${vaultId}:`, error);
      return {
        vaultId,
        cycleNumber,
        unlocked: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Create singleton instance
let schedulerInstance: CycleUnlockScheduler | null = null;

export function getCycleUnlockScheduler(): CycleUnlockScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new CycleUnlockScheduler('chipnet');
  }
  return schedulerInstance;
}

export function startCycleUnlockScheduler(intervalMs: number = 60000): void {
  const scheduler = getCycleUnlockScheduler();
  scheduler.start(intervalMs);
}

export function stopCycleUnlockScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
  }
}

