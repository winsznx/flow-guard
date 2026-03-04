/**
 * Stream Deployment Service
 * Handles on-chain deployment of Vesting and RecurringPayment covenants with NFT state
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hash160, hexToBin, binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { ContractFactory, type ConstructorParam } from './ContractFactory.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

export interface StreamDeploymentParams {
  vaultId: string; // hex-encoded 32-byte vault ID
  sender: string; // BCH address
  recipient: string; // BCH address
  totalAmount: number; // Amount (BCH or tokens)
  startTime: number; // Unix timestamp
  endTime: number; // Unix timestamp
  streamType: 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID';
  cliffTime?: number; // For vesting
  intervalSeconds?: number; // For recurring payments
  amountPerInterval?: number; // For recurring payments
  stepInterval?: number; // For step vesting
  stepAmount?: number; // For step vesting
  hybridUnlockTime?: number; // For hybrid upfront unlock + linear remainder
  hybridUpfrontAmount?: number; // Display amount unlocked at hybrid unlock time
  trancheSchedule?: Array<{
    unlockTime: number;
    cumulativeAmount: number;
  }>;
  cancelable?: boolean;
  transferable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN'; // Token type
  tokenCategory?: string; // hex-encoded 32-byte category ID for CashTokens
}

export interface StreamDeployment {
  contractAddress: string;
  streamId: string;
  constructorParams: ConstructorParam[];
  initialCommitment: string; // hex-encoded NFT commitment
  fundingTxRequired: {
    toAddress: string;
    amount: number; // satoshis (BCH dust when using tokens)
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string; // hex-encoded category ID for CashTokens
    tokenAmount?: number; // fungible token amount
    withNFT: {
      commitment: string; // hex
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export class StreamDeploymentService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Convert BCH address to hash160
   */
  private addressToHash160(address: string): Uint8Array {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') throw new Error(decoded);
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Stream sender/recipient must be P2PKH addresses: ${address}`);
    }
    return b.slice(3, 23);
  }

  /**
   * Generate streamId from parameters
   */
  private generateStreamId(params: StreamDeploymentParams): Uint8Array {
    const vaultIdBin = hexToBin(params.vaultId);
    const recipientHash = this.addressToHash160(params.recipient);
    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(params.startTime), true);

    const combined = new Uint8Array(32 + 20 + 8);
    combined.set(vaultIdBin, 0);
    combined.set(recipientHash, 32);
    combined.set(timestampBuf, 52);

    // Hash and pad to 32 bytes
    const h = hash160(combined);
    const id = new Uint8Array(32);
    id.set(h, 12);
    return id;
  }

  private toOnChainAmount(amount: number, tokenType?: 'BCH' | 'FUNGIBLE_TOKEN'): number {
    return displayAmountToOnChain(
      amount,
      tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
    );
  }

  private setUint40LE(target: Uint8Array, offset: number, value: number): void {
    const safe = Math.max(0, Math.floor(value));
    target[offset] = safe & 0xff;
    target[offset + 1] = (safe >>> 8) & 0xff;
    target[offset + 2] = (safe >>> 16) & 0xff;
    target[offset + 3] = (safe >>> 24) & 0xff;
    target[offset + 4] = Math.floor(safe / 0x100000000) & 0xff;
  }

  /**
   * Create initial NFT commitment for VestingCovenant
   *
   * Commitment structure (40 bytes):
   * [0]: status (0=ACTIVE)
   * [1]: flags (bit0=cancelable, bit1=transferable, bit2=usesTokens)
   * [2-9]: total_released (0 initially)
   * [10-14]: cursor (start time)
   * [15-19]: pause_start (0)
   * [20-39]: recipient_hash (20 bytes)
   */
  private createVestingCommitment(params: StreamDeploymentParams): Uint8Array {
    const commitment = new Uint8Array(40);

    commitment[0] = 0; // ACTIVE status

    let flags = 0;
    if (params.cancelable !== false) flags |= 1; // bit 0
    if (params.transferable === true) flags |= 2; // bit 1
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4; // bit 2 (usesTokens)
    commitment[1] = flags;

    // total_released = 0 (bytes 2-9)
    // All zeros already

    // cursor = startTime (bytes 10-14, 5 bytes)
    const cursorView = new DataView(commitment.buffer, 10, 5);
    // Store as 40-bit value (JavaScript number safe up to 2^53)
    const startTimeLow = params.startTime & 0xFFFFFFFF;
    const startTimeHigh = (params.startTime / 0x100000000) & 0xFF;
    cursorView.setUint32(0, startTimeLow, true);
    cursorView.setUint8(4, startTimeHigh);

    // pause_start = 0 (bytes 15-19)
    // All zeros already

    // recipient_hash (bytes 20-39)
    const recipientHash = this.addressToHash160(params.recipient);
    commitment.set(recipientHash, 20);

    return commitment;
  }

  /**
   * Deploy a VestingCovenant
   */
  async deployVestingStream(params: StreamDeploymentParams): Promise<StreamDeployment> {
    const artifact = ContractFactory.getArtifact('VestingCovenant');
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN streams');
    }

    const vaultId = hexToBin(params.vaultId);
    const senderHash = this.addressToHash160(params.sender);
    const streamId = this.generateStreamId(params);

    // Map stream type to schedule type int
    const scheduleType = params.streamType === 'LINEAR' ? 1 : 2; // STEP

    const totalAmountOnChain = this.toOnChainAmount(params.totalAmount, params.tokenType);
    const totalAmountSat = BigInt(totalAmountOnChain);
    const startTimestamp = BigInt(params.startTime);
    const endTimestamp = BigInt(params.endTime);
    const cliffTimestamp = BigInt(params.cliffTime || 0);
    const stepInterval = BigInt(params.stepInterval || 0);
    const stepAmount = BigInt(
      params.stepAmount
        ? this.toOnChainAmount(params.stepAmount, params.tokenType)
        : 0,
    );

    // Constructor params for VestingCovenant
    const constructorArgs = [
      vaultId,
      senderHash,
      BigInt(scheduleType),
      totalAmountSat,
      startTimestamp,
      endTimestamp,
      cliffTimestamp,
      stepInterval,
      stepAmount,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    // Create initial NFT commitment
    const initialCommitment = this.createVestingCommitment(params);

    // Serialize constructor params for storage
    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(senderHash) },
      { type: 'bigint', value: scheduleType.toString() },
      { type: 'bigint', value: totalAmountSat.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: endTimestamp.toString() },
      { type: 'bigint', value: cliffTimestamp.toString() },
      { type: 'bigint', value: stepInterval.toString() },
      { type: 'bigint', value: stepAmount.toString() },
    ];

    const fundingTx: StreamDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN'
        ? 1000 // Dust amount for token contracts
        : totalAmountOnChain,
      withNFT: {
        commitment: binToHex(initialCommitment),
        capability: 'mutable',
      },
    };

    // Add token-specific fields if using CashTokens
    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
    }

    return {
      contractAddress: contract.address,
      streamId: binToHex(streamId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      fundingTxRequired: fundingTx,
    };
  }

  /**
   * Deploy a RecurringPaymentCovenant
   */
  async deployRecurringStream(params: StreamDeploymentParams): Promise<StreamDeployment> {
    if (!params.intervalSeconds || !params.amountPerInterval) {
      throw new Error('intervalSeconds and amountPerInterval required for recurring payments');
    }
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN streams');
    }

    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');

    const vaultId = hexToBin(params.vaultId);
    const senderHash = this.addressToHash160(params.sender);
    const recipientHash = this.addressToHash160(params.recipient);
    const streamId = this.generateStreamId(params);

    const amountPerIntervalOnChain = this.toOnChainAmount(params.amountPerInterval, params.tokenType);
    const amountPerIntervalSat = BigInt(amountPerIntervalOnChain);
    const intervalSeconds = BigInt(params.intervalSeconds);
    const totalAmountOnChain = this.toOnChainAmount(params.totalAmount, params.tokenType);
    const totalAmountSat = BigInt(totalAmountOnChain);
    const startTimestamp = BigInt(params.startTime);
    const endTimestamp = BigInt(params.endTime);

    const constructorArgs = [
      vaultId,
      senderHash,
      recipientHash, // Recurring payments have recipient in constructor
      amountPerIntervalSat,
      intervalSeconds,
      totalAmountSat,
      startTimestamp,
      endTimestamp,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    // RecurringPaymentCovenant state commitment (40 bytes)
    // [0]=status, [1]=flags, [2-9]=total_paid, [10-17]=payment_count,
    // [18-22]=next_payment_timestamp, [23-27]=pause_start, [28-39]=reserved.
    const commitment = new Uint8Array(40);
    commitment[0] = 0; // ACTIVE

    let flags = 0;
    if (params.cancelable !== false) flags |= 1;
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4; // bit 2 (usesTokens)
    commitment[1] = flags;
    this.setUint40LE(commitment, 18, params.startTime + params.intervalSeconds);
    this.setUint40LE(commitment, 23, 0);

    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(senderHash) },
      { type: 'bytes', value: binToHex(recipientHash) },
      { type: 'bigint', value: amountPerIntervalSat.toString() },
      { type: 'bigint', value: intervalSeconds.toString() },
      { type: 'bigint', value: totalAmountSat.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: endTimestamp.toString() },
    ];

    const fundingTx: StreamDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN'
        ? 1000 // Dust amount for token contracts
        : totalAmountOnChain,
      withNFT: {
        commitment: binToHex(commitment),
        capability: 'mutable',
      },
    };

    // Add token-specific fields if using CashTokens
    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
    }

    return {
      contractAddress: contract.address,
      streamId: binToHex(streamId),
      constructorParams,
      initialCommitment: binToHex(commitment),
      fundingTxRequired: fundingTx,
    };
  }

  async deployHybridStream(params: StreamDeploymentParams): Promise<StreamDeployment> {
    if (!params.hybridUnlockTime || params.hybridUpfrontAmount === undefined) {
      throw new Error('hybridUnlockTime and hybridUpfrontAmount are required for hybrid vesting');
    }
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN streams');
    }

    const artifact = ContractFactory.getArtifact('HybridVestingCovenant');
    const vaultId = hexToBin(params.vaultId);
    const senderHash = this.addressToHash160(params.sender);
    const streamId = this.generateStreamId(params);

    const totalAmountOnChain = this.toOnChainAmount(params.totalAmount, params.tokenType);
    const totalAmountSat = BigInt(totalAmountOnChain);
    const startTimestamp = BigInt(params.startTime);
    const unlockTimestamp = BigInt(params.hybridUnlockTime);
    const endTimestamp = BigInt(params.endTime);
    const upfrontAmountSat = BigInt(this.toOnChainAmount(params.hybridUpfrontAmount, params.tokenType));

    const constructorArgs = [
      vaultId,
      senderHash,
      totalAmountSat,
      startTimestamp,
      unlockTimestamp,
      endTimestamp,
      upfrontAmountSat,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });
    const initialCommitment = this.createVestingCommitment(params);
    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(senderHash) },
      { type: 'bigint', value: totalAmountSat.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: unlockTimestamp.toString() },
      { type: 'bigint', value: endTimestamp.toString() },
      { type: 'bigint', value: upfrontAmountSat.toString() },
    ];

    const fundingTx: StreamDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN'
        ? 1000
        : totalAmountOnChain,
      withNFT: {
        commitment: binToHex(initialCommitment),
        capability: 'mutable',
      },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
    }

    return {
      contractAddress: contract.address,
      streamId: binToHex(streamId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      fundingTxRequired: fundingTx,
    };
  }

  /**
   * Deploy a TrancheVestingCovenant
   */
  async deployTrancheStream(params: StreamDeploymentParams): Promise<StreamDeployment> {
    if (!params.trancheSchedule || params.trancheSchedule.length < 1) {
      throw new Error('trancheSchedule is required for tranche vesting');
    }
    if (params.trancheSchedule.length > 8) {
      throw new Error('Tranche vesting supports at most 8 unlock points');
    }
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN streams');
    }

    const artifact = ContractFactory.getArtifact('TrancheVestingCovenant');
    const vaultId = hexToBin(params.vaultId);
    const senderHash = this.addressToHash160(params.sender);
    const streamId = this.generateStreamId(params);

    const totalAmountOnChain = this.toOnChainAmount(params.totalAmount, params.tokenType);
    const totalAmountSat = BigInt(totalAmountOnChain);
    const startTimestamp = BigInt(params.startTime);
    const scheduleCount = BigInt(params.trancheSchedule.length);

    const paddedSchedule = [...params.trancheSchedule];
    while (paddedSchedule.length < 8) {
      paddedSchedule.push({
        unlockTime: params.trancheSchedule[params.trancheSchedule.length - 1].unlockTime,
        cumulativeAmount: params.trancheSchedule[params.trancheSchedule.length - 1].cumulativeAmount,
      });
    }

    const constructorArgs: Array<Uint8Array | bigint> = [
      vaultId,
      senderHash,
      totalAmountSat,
      startTimestamp,
      scheduleCount,
    ];
    for (const tranche of paddedSchedule) {
      constructorArgs.push(BigInt(tranche.unlockTime));
      constructorArgs.push(BigInt(this.toOnChainAmount(tranche.cumulativeAmount, params.tokenType)));
    }

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });
    const initialCommitment = this.createVestingCommitment(params);

    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(senderHash) },
      { type: 'bigint', value: totalAmountSat.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: scheduleCount.toString() },
    ];
    for (const tranche of paddedSchedule) {
      constructorParams.push({ type: 'bigint', value: BigInt(tranche.unlockTime).toString() });
      constructorParams.push({
        type: 'bigint',
        value: BigInt(this.toOnChainAmount(tranche.cumulativeAmount, params.tokenType)).toString(),
      });
    }

    const fundingTx: StreamDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN' ? 1000 : totalAmountOnChain,
      withNFT: {
        commitment: binToHex(initialCommitment),
        capability: 'mutable',
      },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
    }

    return {
      contractAddress: contract.address,
      streamId: binToHex(streamId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      fundingTxRequired: fundingTx,
    };
  }
}
