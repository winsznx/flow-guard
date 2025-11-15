import { randomUUID } from 'crypto';
import db from '../database/schema';
import { Proposal, CreateProposalDto, ApproveProposalDto, ProposalStatus } from '../models/Proposal';

export class ProposalService {
  static createProposal(dto: CreateProposalDto, creator: string): Proposal {
    const id = randomUUID();
    
    // Get next proposal ID for this vault
    const vaultStmt = db.prepare('SELECT COUNT(*) as count FROM proposals WHERE vault_id = ?');
    const vaultRow = vaultStmt.get(dto.vaultId) as any;
    const proposalId = (vaultRow?.count || 0) + 1;
    
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
    
    return this.getProposalById(id);
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
  
  static approveProposal(dto: ApproveProposalDto): Proposal | null {
    const proposal = this.getProposalById(dto.proposalId);
    if (!proposal || proposal.status !== ProposalStatus.PENDING) {
      return null;
    }
    
    // Check if already approved by this approver
    if (proposal.approvals.includes(dto.approver)) {
      return proposal;
    }
    
    const newApprovals = [...proposal.approvals, dto.approver];
    const newApprovalCount = newApprovals.length;
    
    const stmt = db.prepare(`
      UPDATE proposals 
      SET approval_count = ?, approvals = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(newApprovalCount, JSON.stringify(newApprovals), dto.proposalId);
    
    return this.getProposalById(dto.proposalId);
  }
  
  static markProposalExecuted(proposalId: string, txHash: string): void {
    const stmt = db.prepare(`
      UPDATE proposals 
      SET status = ?, executed_at = CURRENT_TIMESTAMP, tx_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(ProposalStatus.EXECUTED, txHash, proposalId);
  }
}

