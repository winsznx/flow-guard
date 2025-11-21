import { randomUUID } from 'crypto';
import db from '../database/schema';
import { Vault, CreateVaultDto } from '../models/Vault';
import { ContractService } from './contract-service';

export class VaultService {
  static async createVault(dto: CreateVaultDto, creator: string): Promise<Vault> {
    const id = randomUUID();
    const vaultId = `vault_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const isPublic = dto.isPublic ?? false; // Default to private

    // Validate that we have 3 signer public keys
    if (!dto.signerPubkeys || dto.signerPubkeys.length !== 3) {
      throw new Error('Exactly 3 signer public keys are required for contract deployment');
    }

    let contractAddress: string | undefined;
    let contractBytecode: string | undefined;

    // Deploy contract to blockchain
    try {
      const contractService = new ContractService('chipnet');
      const startTimeUnix = Math.floor(Date.now() / 1000);
      const deployment = await contractService.deployVault(
        dto.signerPubkeys[0],
        dto.signerPubkeys[1],
        dto.signerPubkeys[2],
        dto.approvalThreshold,
        0, // Initial state
        dto.cycleDuration,
        startTimeUnix,
        dto.spendingCap
      );

      contractAddress = deployment.contractAddress;
      contractBytecode = deployment.bytecode;

      console.log('Contract deployed successfully:', {
        vaultId,
        contractAddress,
      });
    } catch (error) {
      console.error('Failed to deploy contract:', error);
      // For now, continue without contract deployment (graceful degradation)
      // In production, you might want to throw an error here
      console.warn('Continuing vault creation without blockchain deployment');
    }

    // Set start time to now (for cycle calculations)
    const startTime = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO vaults (
        id, vault_id, creator, total_deposit, spending_cap, approval_threshold,
        signers, signer_pubkeys, state, cycle_duration, unlock_amount, is_public,
        contract_address, contract_bytecode, balance, start_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      vaultId,
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
      startTime
    );

    const vault = this.getVaultById(id);
    if (!vault) {
      throw new Error('Failed to create vault');
    }
    return vault;
  }
  
  static getVaultById(id: string): Vault | null {
    const stmt = db.prepare('SELECT * FROM vaults WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

      return {
        id: row.id,
        vaultId: row.vault_id,
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
  
  static getVaultByVaultId(vaultId: string): Vault | null {
    const stmt = db.prepare('SELECT * FROM vaults WHERE vault_id = ?');
    const row = stmt.get(vaultId) as any;

    if (!row) return null;

    return {
      id: row.id,
      vaultId: row.vault_id,
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
  
  static getUserVaults(userAddress: string): Vault[] {
    const stmt = db.prepare(`
      SELECT * FROM vaults
      WHERE creator = ? OR signers LIKE ?
    `);
    const rows = stmt.all(userAddress, `%${userAddress}%`) as any[];

    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
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

  static getPublicVaults(): Vault[] {
    const stmt = db.prepare('SELECT * FROM vaults WHERE is_public = 1');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
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
  
  static updateVaultState(vaultId: string, newState: number): void {
    const stmt = db.prepare(`
      UPDATE vaults 
      SET state = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE vault_id = ?
    `);
    stmt.run(newState, vaultId);
  }

  static addSigner(vaultId: string, newSignerAddress: string, requesterAddress: string): Vault {
    const vault = this.getVaultByVaultId(vaultId);
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

    const stmt = db.prepare(`
      UPDATE vaults 
      SET signers = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE vault_id = ?
    `);
    stmt.run(JSON.stringify(updatedSigners), vaultId);

    return this.getVaultByVaultId(vaultId)!;
  }
}

