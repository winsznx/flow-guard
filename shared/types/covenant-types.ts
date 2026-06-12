export enum VaultStatus {
  ACTIVE = 0,
  PAUSED = 1,
  FROZEN = 2,
  CLOSED = 3,
}

export enum ProposalStatus {
  PENDING = 0,
  APPROVED = 1,
  EXECUTED = 2,
  CANCELLED = 3,
  EXPIRED = 4,
}

export enum ScheduleStatus {
  ACTIVE = 0,
  PAUSED = 1,
  CANCELLED = 2,
  COMPLETED = 3,
}

export enum AirdropStatus {
  ACTIVE = 0,
  PAUSED = 1,
  CANCELLED = 2,
  COMPLETED = 3,
}

export enum TallyStatus {
  OPEN = 0,
  FINALIZED = 1,
}

export enum VoteChoice {
  AGAINST = 0,
  FOR = 1,
  ABSTAIN = 2,
}

export enum ScheduleType {
  RECURRING = 0,
  LINEAR_VESTING = 1,
  STEP_VESTING = 2,
}

// VaultState - 32 bytes
// [0]     version              uint8
// [1]     status               uint8
// [2-4]   rolesMask            bytes3 (bit0=owner, bit1=guardian, bit2=executor)
// [5-8]   currentPeriodId      uint32 LE
// [9-16]  spentThisPeriod      uint64 LE (satoshis)
// [17-24] lastUpdateTimestamp  uint64 LE (unix seconds)
// [25-31] reserved             bytes7
export interface VaultState {
  version: number;
  status: VaultStatus;
  rolesMask: Buffer;
  currentPeriodId: bigint;
  spentThisPeriod: bigint;
  lastUpdateTimestamp: bigint;
}

// ProposalState - 40 bytes
// [0]     version             uint8
// [1]     status              uint8
// [2]     approvalCount       uint8
// [3]     requiredApprovals   uint8
// [4-8]   votingEndTimestamp  uint40 LE (unix seconds)
// [9-13]  executionTimelock   uint40 LE (unix seconds)
// [14-33] payoutHash          bytes20 (hash160(recipient || amount_bytes))
// [34-39] reserved            bytes6
export interface ProposalState {
  version: number;
  status: ProposalStatus;
  approvalCount: number;
  requiredApprovals: number;
  votingEndTimestamp: number;
  executionTimelock: number;
  payoutHash: Buffer;
}

// ScheduleState - 40 bytes
// [0]     status            uint8
// [1]     flags             uint8 (bit0=cancelable, bit1=transferable, bit2=usesTokens)
// [2-9]   totalReleased     uint64 LE
// [10-14] scheduleCursor    uint40 LE (RECURRING/STEP: next_unlock, LINEAR: effective_start)
// [15-19] pauseStart        uint40 LE (0 if not paused)
// [20-39] recipientHash     bytes20
export interface ScheduleState {
  status: ScheduleStatus;
  flags: number;
  cancelable: boolean;
  transferable: boolean;
  usesTokens: boolean;
  totalReleased: bigint;
  scheduleCursor: number;
  pauseStart: number;
  recipientHash: Buffer;
}

// VoteState - 32 bytes
// [0]     version            uint8
// [1-4]   proposalIdPrefix   bytes4
// [5]     voteChoice         uint8
// [6-7]   reserved           bytes2
// [8-12]  lockTimestamp      uint40 LE
// [13-17] unlockTimestamp    uint40 LE
// [18-31] reserved           bytes14
export interface VoteState {
  version: number;
  proposalIdPrefix: Buffer;
  voteChoice: VoteChoice;
  lockTimestamp: number;
  unlockTimestamp: number;
}

// TallyState - 40 bytes
// [0]     version            uint8
// [1]     status             uint8
// [2-5]   proposalIdPrefix   bytes4
// [6-9]   votesFor           uint32 LE
// [10-13] votesAgainst       uint32 LE
// [14-17] votesAbstain       uint32 LE
// [18-21] quorumThreshold    uint32 LE
// [22-26] tallyTimestamp     uint40 LE
// [27-39] reserved           bytes13
export interface TallyState {
  version: number;
  status: TallyStatus;
  proposalIdPrefix: Buffer;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumThreshold: number;
  tallyTimestamp: number;
}

// AirdropState - 32 bytes
// [0]     version            uint8
// [1]     status             uint8
// [2-9]   totalClaimed       uint64 LE
// [10-17] claimsCount        uint64 LE
// [18-31] reserved           bytes14
export interface AirdropState {
  version: number;
  status: AirdropStatus;
  totalClaimed: bigint;
  claimsCount: bigint;
}

export const STATE_SIZES = {
  vault: 32,
  proposal: 40,
  schedule: 40,
  vote: 32,
  tally: 40,
  airdrop: 32,
} as const;

export type CovenantFamily =
  | 'vault'
  | 'proposal'
  | 'stream'
  | 'payment'
  | 'airdrop'
  | 'reward'
  | 'bounty'
  | 'grant'
  | 'budget_plan'
  | 'governance_vote';

export interface UTXORef {
  txid: string;
  vout: number;
}

export interface CashTokenData {
  category: string;
  nft?: {
    capability?: 'none' | 'mutable' | 'minting';
    commitment: Buffer;
  };
  amount?: bigint;
}

export interface CovenantUTXO<TState = unknown> {
  utxo: UTXORef;
  address: string;
  satoshis: bigint;
  token?: CashTokenData;
  state: TState;
  height: number;
  timestamp: bigint;
}

export type VaultUTXO = CovenantUTXO<VaultState>;
export type ProposalUTXO = CovenantUTXO<ProposalState>;
export type ScheduleUTXO = CovenantUTXO<ScheduleState>;
export type VoteUTXO = CovenantUTXO<VoteState>;
export type TallyUTXO = CovenantUTXO<TallyState>;
export type AirdropUTXO = CovenantUTXO<AirdropState>;
