export interface Vault {
  id: string;
  vaultId: string; // On-chain vault ID
  creator: string; // Creator address
  totalDeposit: number; // Total BCH deposited
  spendingCap: number; // Spending cap per period
  approvalThreshold: number; // Required approvals (e.g., 2-of-3)
  signers: string[]; // Array of signer addresses
  signerPubkeys?: string[]; // Array of signer public keys (hex)
  state: number; // Bitwise encoded state
  cycleDuration: number; // Cycle duration in seconds
  unlockAmount: number; // Amount to unlock per cycle
  isPublic: boolean; // Whether vault is publicly visible
  contractAddress?: string; // BCH contract address (cashaddr)
  contractBytecode?: string; // Contract bytecode (hex)
  balance?: number; // Current on-chain balance in satoshis
  createdAt: Date;
  updatedAt: Date;
  startTime?: Date; // Vault start time for cycle calculations
}

export interface CreateVaultDto {
  totalDeposit: number;
  spendingCap: number;
  approvalThreshold: number;
  signers: string[]; // Signer addresses
  signerPubkeys: string[]; // Signer public keys (hex) - required for contract deployment
  cycleDuration: number;
  unlockAmount: number;
  isPublic?: boolean; // Optional, defaults to false (private)
}

