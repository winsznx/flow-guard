export enum ProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  EXECUTED = 'executed',
  REJECTED = 'rejected',
}

export interface Proposal {
  id: string;
  vaultId: string;
  proposalId: number; // On-chain proposal ID
  recipient: string; // Recipient address
  amount: number; // Amount in BCH
  reason: string; // Proposal reason/description
  status: ProposalStatus;
  approvalCount: number;
  approvals: string[]; // Array of approver addresses
  createdAt: Date;
  updatedAt: Date;
  executedAt?: Date;
  txHash?: string; // Transaction hash when executed
}

export interface CreateProposalDto {
  vaultId: string;
  recipient: string;
  amount: number;
  reason: string;
}

export interface ApproveProposalDto {
  proposalId: string;
  approver: string;
}

