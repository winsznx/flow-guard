export interface Vault {
  id: string;
  vaultId: string; // On-chain vault ID
  creator: string; // Creator address
  totalDeposit: number; // Total BCH deposited
  spendingCap: number; // Spending cap per period
  approvalThreshold: number; // Required approvals (e.g., 2-of-3)
  signers: string[]; // Array of signer addresses
  state: number; // Bitwise encoded state
  cycleDuration: number; // Cycle duration in seconds
  unlockAmount: number; // Amount to unlock per cycle
  isPublic: boolean; // Whether vault is publicly visible
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVaultDto {
  totalDeposit: number;
  spendingCap: number;
  approvalThreshold: number;
  signers: string[];
  cycleDuration: number;
  unlockAmount: number;
  isPublic?: boolean; // Optional, defaults to false (private)
}

