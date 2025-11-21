import { randomUUID } from 'crypto';
import db from '../database/schema';
import { Proposal, CreateProposalDto, ApproveProposalDto, ProposalStatus } from '../models/Proposal';
import { StateService } from './state-service';
import { ContractService } from './contract-service';
import { VaultService } from './vaultService';

export class ProposalService {
  /**
   * Create proposal with on-chain state management
   * This creates the proposal in the database and prepares for on-chain creation
   */
  static createProposal(dto: CreateProposalDto, creator: string): Proposal {
    const id = randomUUID();
    
    // Get vault to check state and parameters
    const vault = VaultService.getVaultByVaultId(dto.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Get next proposal ID for this vault (on-chain proposal ID)
    const vaultStmt = db.prepare('SELECT COUNT(*) as count FROM proposals WHERE vault_id = ?');
    const vaultRow = vaultStmt.get(dto.vaultId) as any;
    const proposalId = (vaultRow?.count || 0) + 1;

    // Verify proposal can be created on-chain
    const currentState = vault.state || 0;
    if (StateService.getProposalStatus(currentState, proposalId) !== 0) {
      throw new Error(`Proposal ID ${proposalId} already exists on-chain`);
    }

    // Verify amount doesn't exceed spending cap
    const amountSatoshis = Math.floor(dto.amount * 100000000); // Convert BCH to satoshis
    if (vault.spendingCap > 0 && amountSatoshis > vault.spendingCap * 100000000) {
      throw new Error(`Amount exceeds spending cap of ${vault.spendingCap} BCH`);
    }
    
    // Store proposal in database (off-chain metadata)
    const stmt = db.prepare(`
      INSERT INTO proposals (
        id, vault_id, proposal_id, recipient, amount, reason, status, approval_count, approvals
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      id,
      dto.vaultId,
      proposalId,
      dto.recipient,
      dto.amount,
      dto.reason,
      ProposalStatus.PENDING,
      0,
      JSON.stringify([])
    );

    // Note: The actual on-chain proposal creation would happen via a separate transaction
    // This is stored in the database as pending until the on-chain transaction is created

    const proposal = this.getProposalById(id);
    if (!proposal) {
      throw new Error('Failed to create proposal');
    }
    return proposal;
  }

  /**
   * Create on-chain proposal transaction
   * This prepares the transaction that will be signed and broadcast
   */
  static async createOnChainProposalTransaction(
    proposalId: string,
    signerPublicKey: string
  ): Promise<{ transaction: any; newState: number }> {
    const proposal = this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const vault = VaultService.getVaultByVaultId(proposal.vaultId);
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

    const currentState = vault.state || 0;
    const amountSatoshis = Math.floor(proposal.amount * 100000000);

    // Create on-chain proposal transaction
    const contractService = new ContractService('chipnet');
    const transaction = await contractService.createOnChainProposal(
      vault.contractAddress,
      proposal.recipient,
      amountSatoshis,
      proposal.proposalId,
      currentState,
      vault.signerPubkeys,
      vault.approvalThreshold,
      vault.spendingCap * 100000000
    );

    // Calculate new state
    const newState = StateService.setProposalPending(currentState, proposal.proposalId);

    return { transaction, newState };
  }
  
  static getProposalById(id: string): Proposal | null {
    const stmt = db.prepare('SELECT * FROM proposals WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      reason: row.reason,
      status: row.status as ProposalStatus,
      approvalCount: row.approval_count,
      approvals: JSON.parse(row.approvals),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      txHash: row.tx_hash,
    };
  }
  
  static getVaultProposals(vaultId: string): Proposal[] {
    const stmt = db.prepare('SELECT * FROM proposals WHERE vault_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(vaultId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      vaultId: row.vault_id,
      proposalId: row.proposal_id,
      recipient: row.recipient,
      amount: row.amount,
      reason: row.reason,
      status: row.status as ProposalStatus,
      approvalCount: row.approval_count,
      approvals: JSON.parse(row.approvals),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      executedAt: row.executed_at ? new Date(row.executed_at) : undefined,
      txHash: row.tx_hash,
    }));
  }
  
  /**
   * Approve proposal with on-chain state management
   */
  static approveProposal(dto: ApproveProposalDto): Proposal | null {
    const proposal = this.getProposalById(dto.proposalId);
    if (!proposal || proposal.status !== ProposalStatus.PENDING) {
      return null;
    }
    
    // Check if already approved by this approver
    if (proposal.approvals.includes(dto.approver)) {
      return proposal;
    }

    // Get vault to check state
    const vault = VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    const currentState = vault.state || 0;

    // Verify proposal is pending on-chain
    if (!StateService.isProposalPending(currentState, proposal.proposalId)) {
      throw new Error('Proposal is not pending on-chain');
    }

    // Increment approval with state check
    const { newState, isApproved } = StateService.incrementApprovalWithCheck(
      currentState,
      proposal.proposalId,
      vault.approvalThreshold
    );

    // Update database
    const newApprovals = [...proposal.approvals, dto.approver];
    const newApprovalCount = newApprovals.length;
    
    const stmt = db.prepare(`
      UPDATE proposals 
      SET approval_count = ?, approvals = ?, updated_at = CURRENT_TIMESTAMP,
          status = ?
      WHERE id = ?
    `);
    stmt.run(
      newApprovalCount,
      JSON.stringify(newApprovals),
      isApproved ? ProposalStatus.APPROVED : ProposalStatus.PENDING,
      dto.proposalId
    );

    // Update vault state in database
    VaultService.updateVaultState(proposal.vaultId, newState);
    
    return this.getProposalById(dto.proposalId);
  }

  /**
   * Create on-chain approval transaction
   */
  static async createOnChainApprovalTransaction(
    proposalId: string,
    signerPublicKey: string
  ): Promise<{ transaction: any; newState: number; isApproved: boolean }> {
    const proposal = this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    const vault = VaultService.getVaultByVaultId(proposal.vaultId);
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

    const currentState = vault.state || 0;

    // Create on-chain approval transaction
    const contractService = new ContractService('chipnet');
    const result = await contractService.createOnChainApproval(
      vault.contractAddress,
      proposal.proposalId,
      currentState,
      vault.signerPubkeys,
      vault.approvalThreshold
    );

    return result;
  }
  
  static markProposalExecuted(proposalId: string, txHash: string): void {
    const proposal = this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    // Get vault to update state
    const vault = VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault) {
      throw new Error('Vault not found');
    }

    const currentState = vault.state || 0;

    // Update state to mark proposal as executed
    const newState = StateService.setProposalExecuted(currentState, proposal.proposalId);

    // Update database
    const stmt = db.prepare(`
      UPDATE proposals 
      SET status = ?, executed_at = CURRENT_TIMESTAMP, tx_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(ProposalStatus.EXECUTED, txHash, proposalId);

    // Update vault state
    VaultService.updateVaultState(proposal.vaultId, newState);
  }

  /**
   * Create on-chain execute payout transaction
   */
  static async createExecutePayoutTransaction(
    proposalId: string
  ): Promise<{ transaction: any; newState: number }> {
    const proposal = this.getProposalById(proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (proposal.status !== ProposalStatus.APPROVED) {
      throw new Error('Proposal is not approved');
    }

    const vault = VaultService.getVaultByVaultId(proposal.vaultId);
    if (!vault || !vault.contractAddress || !vault.signerPubkeys) {
      throw new Error('Vault not found or missing contract information');
    }

    const currentState = vault.state || 0;

    // Verify proposal is approved on-chain
    if (!StateService.isProposalApproved(currentState, proposal.proposalId)) {
      throw new Error('Proposal is not approved on-chain');
    }

    const amountSatoshis = Math.floor(proposal.amount * 100000000);

    // Create execute payout transaction
    const contractService = new ContractService('chipnet');
    const result = await contractService.createExecutePayout(
      vault.contractAddress,
      proposal.recipient,
      amountSatoshis,
      proposal.proposalId,
      currentState,
      vault.signerPubkeys,
      vault.approvalThreshold,
      vault.spendingCap * 100000000
    );

    return result;
  }
}

