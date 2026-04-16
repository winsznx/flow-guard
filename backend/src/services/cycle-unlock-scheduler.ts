/**
 * Cycle Unlock Scheduler
 * Monitors vaults and triggers cycle unlocks when conditions are met
 */

import { randomUUID } from 'crypto';
import db from '../database/schema.js';
import { VaultService } from './vaultService.js';
import { StateService } from './state-service.js';
import { ContractService } from './contract-service.js';
import { Contract, ElectrumNetworkProvider, TransactionBuilder, placeholderPublicKey, placeholderSignature } from 'cashscript';
import { ContractFactory } from './ContractFactory.js';
import { binToHex, hexToBin } from '@bitauth/libauth';

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
      const stmt = db!.prepare(`
        SELECT * FROM vaults
        WHERE contract_address IS NOT NULL
        AND cycle_duration > 0
      `);
      const vaults = await stmt.all() as any[];

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
    const stmt = db!.prepare(`
      SELECT * FROM cycles
      WHERE vault_id = ? AND cycle_number = ?
    `);
    const existing = await stmt.get(vaultId, cycleNumber) as any;

    if (!existing) {
      // Create cycle record
      const id = randomUUID();
      const insertStmt = db!.prepare(`
        INSERT INTO cycles (
          id, vault_id, cycle_number, unlock_time, unlock_amount, status
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const vault = await VaultService.getVaultByVaultId(vaultId);
      const unlockAmount = vault?.unlockAmount || 0;

      await insertStmt.run(
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

  private parseConstructorParams(raw: string | undefined): any[] {
    if (!raw) return [];
    const params = JSON.parse(raw || '[]');
    return params.map((param: any) => {
      if (param && typeof param === 'object') {
        if (param.type === 'bigint') return BigInt(param.value);
        if (param.type === 'bytes') return hexToBin(param.value);
        if (param.type === 'boolean') return param.value === 'true' || param.value === true;
        return param.value;
      }
      return param;
    });
  }

  private normalizeCommitment(commitment: string | Uint8Array): Uint8Array {
    return typeof commitment === 'string' ? hexToBin(commitment) : commitment;
  }

  private readUint32BE(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  }

  private readUint64BE(bytes: Uint8Array, offset: number): bigint {
    let result = 0n;
    for (let i = 0; i < 8; i++) {
      result = (result << 8n) + BigInt(bytes[offset + i]);
    }
    return result;
  }

  private toBigIntParam(value: unknown, name: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    throw new Error(`Invalid constructor parameter for ${name}`);
  }

  private buildNextCommitment(
    current: Uint8Array,
    newPeriodId: number,
    newSpent: bigint,
    locktime: bigint,
  ): Uint8Array {
    const next = new Uint8Array(current);
    // status stays same at byte 1
    next[5] = (newPeriodId >> 24) & 0xff;
    next[6] = (newPeriodId >> 16) & 0xff;
    next[7] = (newPeriodId >> 8) & 0xff;
    next[8] = newPeriodId & 0xff;

    // spent_this_period bytes 9-16 big-endian
    for (let i = 0; i < 8; i++) {
      next[16 - i] = Number((newSpent >> BigInt(8 * i)) & 0xffn);
    }
    // last_update_timestamp bytes 17-24 big-endian
    for (let i = 0; i < 8; i++) {
      next[24 - i] = Number((locktime >> BigInt(8 * i)) & 0xffn);
    }
    // reserved remains as-is
    return next;
  }

  /**
   * Create unlock transaction for a specific cycle
   */
  async createUnlockTransaction(
    vaultId: string,
    cycleNumber: number,
    _signerPublicKey?: string
  ): Promise<{ wcTransaction: any; newState: number; newPeriodId: number }> {
    const vault = await VaultService.getVaultByVaultId(vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    const vaultStartTime = this.getVaultStartTime(vault as any);
    const currentState = vault.state || 0;

    // Verify cycle can be unlocked
    if (!StateService.canUnlockCycle(currentState, cycleNumber, vaultStartTime, vault.cycleDuration)) {
      throw new Error(`Cycle ${cycleNumber} cannot be unlocked yet`);
    }

    // Build on-chain unlock transaction using VaultCovenant.unlockPeriod
    const network: 'chipnet' = 'chipnet';
    const provider = new ElectrumNetworkProvider(network);
    const artifact = ContractFactory.getArtifact('VaultCovenant');
    const rawParams = (vault as any).constructorParamsJson || (vault as any).constructor_params;
    const constructorParams = this.parseConstructorParams(rawParams);
    const contract = new Contract(artifact, constructorParams, { provider });

    const contractUtxos = await provider.getUtxos(vault.contractAddress);
    if (!contractUtxos?.length) {
      throw new Error(`No UTXOs found for vault contract ${vault.contractAddress}`);
    }
    const contractUtxo = contractUtxos.find((u: any) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Vault contract UTXO is missing the mutable state NFT required by VaultCovenant.unlockPeriod');
    }

    const commitment = this.normalizeCommitment(contractUtxo.token.nft.commitment);
    const currentPeriodId = this.readUint32BE(commitment, 5);
    const lastUpdate = this.readUint64BE(commitment, 17);
    const periodDuration = this.toBigIntParam(constructorParams[5], 'periodDuration');

    const now = Math.floor(Date.now() / 1000);
    const earliest = Number(lastUpdate + periodDuration);
    if (periodDuration > 0n && now < earliest) {
      throw new Error(`Cycle unlock not yet allowed; earliest ${new Date(earliest * 1000).toISOString()}`);
    }

    const newPeriodId = currentPeriodId + 1;
    const newSpent = 0n;
    const feeReserve = 1500n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient vault balance to pay unlock fee from treasury UTXO');
    }

    const newCommitment = this.buildNextCommitment(commitment, newPeriodId, newSpent, BigInt(now));

    const txBuilder = new TransactionBuilder({ provider });
    txBuilder.setLocktime(now);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.unlockPeriod(
        placeholderSignature(),
        placeholderPublicKey(),
        BigInt(newPeriodId),
        newSpent,
      ),
    );

    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: `Unlock treasury period #${newPeriodId}`,
    });

    const newState = StateService.setCycleUnlocked(currentState, cycleNumber);
    return { wcTransaction, newState, newPeriodId };
  }

  /**
   * Process a specific cycle unlock (called manually or by scheduler)
   */
  async unlockCycle(vaultId: string, cycleNumber: number): Promise<CycleUnlockResult> {
    try {
      const vault = await VaultService.getVaultByVaultId(vaultId);
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
      await VaultService.updateVaultState(vaultId, newState);

      // Update cycle record
      const stmt = db!.prepare(`
        UPDATE cycles
        SET status = 'unlocked', unlocked_at = CURRENT_TIMESTAMP
        WHERE vault_id = ? AND cycle_number = ?
      `);
      await stmt.run(vaultId, cycleNumber);

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
