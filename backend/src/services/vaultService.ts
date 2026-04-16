import { randomUUID } from 'crypto';
import db from '../database/schema.js';
import { Vault, CreateVaultDto } from '../models/Vault.js';
import { ContractService } from './contract-service.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

export class VaultService {
  static async createVault(dto: CreateVaultDto, creator: string): Promise<Vault> {
    const id = randomUUID();
    const vaultId = `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isPublic = dto.isPublic ?? false; // Default to private

    // Validate that we have 3 signer public keys
    if (!dto.signerPubkeys || dto.signerPubkeys.length !== 3) {
      throw new Error('Exactly 3 signer public keys are required for contract deployment');
    }
    if (!Number.isInteger(dto.approvalThreshold) || dto.approvalThreshold < 1 || dto.approvalThreshold > 2) {
      throw new Error('approvalThreshold must be 1 or 2 (current vault spend path supports up to 2-of-3)');
    }

    let contractAddress: string | undefined;
    let contractBytecode: string | undefined;
    let constructorParams: any[] = [];

    // Non-custodial instantiation
    try {
      const contractService = new ContractService('chipnet');
      const spendingCapSatoshis = displayAmountToOnChain(dto.spendingCap || 0, 'BCH');

      const deployment = await contractService.deployVault({
        signerPubkeys: dto.signerPubkeys,
        requiredApprovals: dto.approvalThreshold,
        periodDuration: dto.cycleDuration,
        periodCap: spendingCapSatoshis,
        recipientCap: 0,
        allowlistEnabled: false,
      });

      contractAddress = deployment.contractAddress;
      contractBytecode = deployment.bytecode;
      constructorParams = deployment.constructorParams;

      console.log('Vault initialized (waiting for funding):', { vaultId, contractAddress });

    } catch (error) {
      console.error('Failed to initialize vault contract:', error);
      console.warn('Continuing without contract address');
    }

    // Set start time to now (for cycle calculations)
    const startTime = new Date().toISOString();

    const stmt = db!.prepare(`
      INSERT INTO vaults (
        id, vault_id, name, description, creator, total_deposit, spending_cap, approval_threshold,
        signers, signer_pubkeys, state, cycle_duration, unlock_amount, is_public,
        contract_address, contract_bytecode, balance, start_time, constructor_params, tx_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    await stmt.run(
      id,
      vaultId,
      dto.name || null,
      dto.description || null,
      creator,
      dto.totalDeposit,
      dto.spendingCap,
      dto.approvalThreshold,
      JSON.stringify(dto.signers),
      JSON.stringify(dto.signerPubkeys),
      0, // Initial state
      dto.cycleDuration,
      dto.unlockAmount,
      isPublic ? 1 : 0,
      contractAddress || null,
      contractBytecode || null,
      0, // Initial balance
      startTime,
      JSON.stringify(constructorParams),
      null // tx_hash will be set when vault is funded
    );

    const vault = await this.getVaultById(id);
    if (!vault) {
      throw new Error('Failed to create vault');
    }
    return vault;
  }

  static async getVaultById(id: string): Promise<Vault | null> {
    const stmt = db!.prepare('SELECT * FROM vaults WHERE id = ?');
    const row = await stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      vaultId: row.vault_id,
      name: row.name || undefined,
      description: row.description || undefined,
      creator: row.creator,
      totalDeposit: row.total_deposit,
      spendingCap: row.spending_cap,
      approvalThreshold: row.approval_threshold,
      signers: JSON.parse(row.signers),
      signerPubkeys: row.signer_pubkeys ? JSON.parse(row.signer_pubkeys) : undefined,
      state: row.state,
      cycleDuration: row.cycle_duration,
      unlockAmount: row.unlock_amount,
      isPublic: Boolean(row.is_public),
      contractAddress: row.contract_address || undefined,
      contractBytecode: row.contract_bytecode || undefined,
      balance: row.balance || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startTime: row.start_time ? new Date(row.start_time) : new Date(row.created_at),
    };
  }

  static async getVaultByVaultId(vaultId: string): Promise<Vault | null> {
    const stmt = db!.prepare(`
      SELECT * FROM vaults
      WHERE vault_id = ? OR id = ?
      LIMIT 1
    `);
    const row = await stmt.get(vaultId, vaultId) as any;

    if (!row) return null;

    return {
      id: row.id,
      vaultId: row.vault_id,
      name: row.name || undefined,
      description: row.description || undefined,
      creator: row.creator,
      totalDeposit: row.total_deposit,
      spendingCap: row.spending_cap,
      approvalThreshold: row.approval_threshold,
      signers: JSON.parse(row.signers),
      signerPubkeys: row.signer_pubkeys ? JSON.parse(row.signer_pubkeys) : undefined,
      state: row.state,
      cycleDuration: row.cycle_duration,
      unlockAmount: row.unlock_amount,
      isPublic: Boolean(row.is_public),
      contractAddress: row.contract_address || undefined,
      contractBytecode: row.contract_bytecode || undefined,
      balance: row.balance || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startTime: row.start_time ? new Date(row.start_time) : new Date(row.created_at),
    };
  }

  static async getUserVaults(userAddress: string): Promise<Vault[]> {
    const stmt = db!.prepare(`
      SELECT * FROM vaults
      WHERE creator = ? OR signers LIKE ?
    `);
    const rows = await stmt.all(userAddress, `%${userAddress}%`) as any[];

    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
      name: row.name || undefined,
      description: row.description || undefined,
      creator: row.creator,
      totalDeposit: row.total_deposit,
      spendingCap: row.spending_cap,
      approvalThreshold: row.approval_threshold,
      signers: JSON.parse(row.signers),
      signerPubkeys: row.signer_pubkeys ? JSON.parse(row.signer_pubkeys) : undefined,
      state: row.state,
      cycleDuration: row.cycle_duration,
      unlockAmount: row.unlock_amount,
      isPublic: Boolean(row.is_public),
      contractAddress: row.contract_address || undefined,
      contractBytecode: row.contract_bytecode || undefined,
      balance: row.balance || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  static async getPublicVaults(): Promise<Vault[]> {
    const stmt = db!.prepare('SELECT * FROM vaults WHERE is_public = 1');
    const rows = await stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
      name: row.name || undefined,
      description: row.description || undefined,
      creator: row.creator,
      totalDeposit: row.total_deposit,
      spendingCap: row.spending_cap,
      approvalThreshold: row.approval_threshold,
      signers: JSON.parse(row.signers),
      signerPubkeys: row.signer_pubkeys ? JSON.parse(row.signer_pubkeys) : undefined,
      state: row.state,
      cycleDuration: row.cycle_duration,
      unlockAmount: row.unlock_amount,
      isPublic: Boolean(row.is_public),
      contractAddress: row.contract_address || undefined,
      contractBytecode: row.contract_bytecode || undefined,
      balance: row.balance || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      startTime: row.start_time ? new Date(row.start_time) : new Date(row.created_at),
    }));
  }

  static isCreator(vault: Vault, userAddress: string): boolean {
    return vault.creator.toLowerCase() === userAddress.toLowerCase();
  }

  static isSigner(vault: Vault, userAddress: string): boolean {
    return vault.signers.some(
      signer => signer.toLowerCase() === userAddress.toLowerCase()
    );
  }

  static canViewVault(vault: Vault, userAddress: string): boolean {
    // Public vaults can be viewed by anyone
    if (vault.isPublic) return true;

    // Private vaults can only be viewed by creator or signers
    return this.isCreator(vault, userAddress) || this.isSigner(vault, userAddress);
  }

  static async updateVaultState(vaultId: string, newState: number): Promise<void> {
    const stmt = db!.prepare(`
      UPDATE vaults
      SET state = ?, updated_at = CURRENT_TIMESTAMP
      WHERE vault_id = ? OR id = ?
    `);
    await stmt.run(newState, vaultId, vaultId);
  }

  static async addSigner(vaultId: string, newSignerAddress: string, requesterAddress: string): Promise<Vault> {
    const vault = await this.getVaultByVaultId(vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Only creator can add signers
    if (!this.isCreator(vault, requesterAddress)) {
      throw new Error('Only the vault creator can add signers');
    }

    // Check if signer already exists
    if (this.isSigner(vault, newSignerAddress)) {
      throw new Error('Signer already exists');
    }

    // Add new signer
    const updatedSigners = [...vault.signers, newSignerAddress];

    const stmt = db!.prepare(`
      UPDATE vaults
      SET signers = ?, updated_at = CURRENT_TIMESTAMP
      WHERE vault_id = ?
    `);
    await stmt.run(JSON.stringify(updatedSigners), vaultId);

    return (await this.getVaultByVaultId(vaultId))!;
  }

  /**
   * Update vault balance after deposit
   * @param vaultId The vault database ID
   * @param amount The amount to add to balance (in BCH)
   * @param txid Optional transaction ID for tracking
   */
  static async updateBalance(vaultId: string, amount: number, txid?: string): Promise<Vault> {
    const vault = await this.getVaultById(vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Update balance (add to existing balance)
    const newBalance = (vault.balance || 0) + amount;

    // Update balance and tx_hash if this is the first funding transaction
    const stmt = db!.prepare(`
      UPDATE vaults
      SET balance = ?,
          tx_hash = COALESCE(tx_hash, ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    await stmt.run(newBalance, txid || null, vaultId);

    // Log the transaction
    if (txid) {
      const txStmt = db!.prepare(`
        INSERT INTO transactions (id, tx_hash, vault_id, tx_type, amount, to_address, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      await txStmt.run(
        randomUUID(),
        txid,
        vault.vaultId,
        'deposit',
        amount,
        vault.contractAddress || null,
        'confirmed'
      );
    }

    return (await this.getVaultById(vaultId))!;
  }
}
