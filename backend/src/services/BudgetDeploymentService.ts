/**
 * Budget Plan Deployment Service
 * Deploys VestingCovenant with STEP schedule for milestone-based budget releases
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface Milestone {
  amount: number; // Amount to release in satoshis
  durationSeconds: number; // Time from previous milestone (or start) in seconds
  description?: string;
}

export interface BudgetDeploymentParams {
  vaultId: string; // Hex-encoded 32-byte vault ID
  sender: string; // BCH address of the sender (vault/DAO)
  recipient: string; // BCH address of the recipient (project team)
  milestones: Milestone[]; // Array of milestones
  startTime?: number; // Unix timestamp (defaults to now)
  cancelable?: boolean;
  transferable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface BudgetDeployment {
  contractAddress: string;
  budgetId: string; // Human-readable ID
  constructorParams: Array<{ type: string; value: any }>;
  initialCommitment: string; // Hex-encoded 40-byte NFT commitment
  totalAmount: number;
  totalDuration: number;
  stepCount: number;
  fundingTxRequired: boolean;
}

export class BudgetDeploymentService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Deploy VestingCovenant with STEP schedule for budget milestones
   */
  async deployBudget(params: BudgetDeploymentParams): Promise<BudgetDeployment> {
    const {
      vaultId,
      sender,
      recipient,
      milestones,
      startTime,
      cancelable = true,
      transferable = false,
      tokenType = 'BCH',
      tokenCategory,
    } = params;

    if (!milestones || milestones.length === 0) {
      throw new Error('At least one milestone is required');
    }

    // Calculate totals
    const totalAmount = milestones.reduce((sum, m) => sum + m.amount, 0);
    const totalDuration = milestones.reduce((sum, m) => sum + m.durationSeconds, 0);
    const stepCount = milestones.length;

    // For STEP vesting, use average step amount and interval
    const stepAmount = Math.floor(totalAmount / stepCount);
    const stepInterval = Math.floor(totalDuration / stepCount);

    const now = Math.floor(Date.now() / 1000);
    const start = startTime || now;
    const end = start + totalDuration;

    // Parse vaultId and addresses
    const vaultIdBytes = Buffer.from(vaultId.replace(/^0x/, ''), 'hex');
    if (vaultIdBytes.length !== 32) {
      throw new Error('vaultId must be 32 bytes (64 hex chars)');
    }

    // Convert sender address to hash160
    const senderHash = this.addressToHash160(sender);
    const recipientHash = this.addressToHash160(recipient);

    // Constructor parameters for VestingCovenant
    const constructorArgs = [
      vaultIdBytes, // bytes32 vaultId
      senderHash, // bytes20 senderHash
      2n, // int scheduleType (2 = STEP_VESTING)
      BigInt(totalAmount), // int totalAmount (satoshis)
      BigInt(start), // int startTimestamp
      BigInt(end), // int endTimestamp
      0n, // int cliffTimestamp (no cliff for budget plans)
      BigInt(stepInterval), // int stepInterval (seconds per milestone)
      BigInt(stepAmount), // int stepAmount (tokens per milestone)
    ];

    // Build initial NFT commitment (40 bytes)
    const commitment = this.createBudgetCommitment({
      status: 0, // ACTIVE
      flags: this.buildFlags(cancelable, transferable, tokenType === 'FUNGIBLE_TOKEN'),
      totalReleased: 0,
      cursor: start,
      pauseStart: 0,
      recipientHash,
    });

    // Get contract artifact and deploy
    const artifact = ContractFactory.getArtifact(ContractFactory.latest('VestingCovenant'));
    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    // Generate human-readable budget ID
    const budgetId = `#FG-BUDGET-${Date.now().toString(36).toUpperCase()}`;

    const constructorParams = [
      { type: 'bytes', value: binToHex(vaultIdBytes) },
      { type: 'bytes', value: binToHex(senderHash) },
      { type: 'bigint', value: '2' },
      { type: 'bigint', value: totalAmount.toString() },
      { type: 'bigint', value: start.toString() },
      { type: 'bigint', value: end.toString() },
      { type: 'bigint', value: '0' },
      { type: 'bigint', value: stepInterval.toString() },
      { type: 'bigint', value: stepAmount.toString() },
    ];

    return {
      contractAddress: contract.address,
      budgetId,
      constructorParams,
      initialCommitment: commitment,
      totalAmount,
      totalDuration,
      stepCount,
      fundingTxRequired: true,
    };
  }

  /**
   * Create 40-byte NFT commitment for budget state
   */
  private createBudgetCommitment(state: {
    status: number;
    flags: number;
    totalReleased: number;
    cursor: number;
    pauseStart: number;
    recipientHash: Buffer;
  }): string {
    const commitment = Buffer.alloc(40);
    let offset = 0;

    // [0]: status (uint8)
    commitment.writeUInt8(state.status, offset);
    offset += 1;

    // [1]: flags (uint8)
    commitment.writeUInt8(state.flags, offset);
    offset += 1;

    // [2-9]: total_released (uint64 LE)
    const releasedBuf = Buffer.alloc(8);
    releasedBuf.writeBigUInt64LE(BigInt(state.totalReleased), 0);
    releasedBuf.copy(commitment, offset);
    offset += 8;

    // [10-14]: cursor (5 bytes LE)
    const cursorBuf = Buffer.alloc(5);
    cursorBuf.writeUInt32LE(state.cursor, 0);
    cursorBuf.copy(commitment, offset);
    offset += 5;

    // [15-19]: pause_start (5 bytes LE)
    const pauseBuf = Buffer.alloc(5);
    pauseBuf.writeUInt32LE(state.pauseStart, 0);
    pauseBuf.copy(commitment, offset);
    offset += 5;

    // [20-39]: recipient_hash (bytes20)
    state.recipientHash.copy(commitment, offset);

    return commitment.toString('hex');
  }

  /**
   * Build flags byte
   */
  private buildFlags(cancelable: boolean, transferable: boolean, usesTokens: boolean): number {
    let flags = 0;
    if (cancelable) flags |= 0x01; // bit 0
    if (transferable) flags |= 0x02; // bit 1
    if (usesTokens) flags |= 0x04; // bit 2
    return flags;
  }

  /**
   * Convert BCH address to hash160
   */
  private addressToHash160(address: string): Buffer {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') {
      throw new Error(`Invalid BCH address: ${decoded}`);
    }
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Budget sender/recipient must be P2PKH addresses: ${address}`);
    }
    return Buffer.from(b.slice(3, 23));
  }
}
