/**
 * Payment Deployment Service
 * Handles on-chain deployment of RecurringPayment covenants with NFT state
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hash160, hexToBin, binToHex, cashAddressToLockingBytecode } from '@bitauth/libauth';
import { ContractFactory, type ConstructorParam } from './ContractFactory.js';
import { displayAmountToOnChain } from '../utils/amounts.js';

export interface PaymentDeploymentParams {
  vaultId: string; // hex-encoded 32-byte vault ID
  sender: string; // BCH address
  recipient: string; // BCH address
  amountPerInterval: number; // Amount per payment
  interval: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'YEARLY';
  intervalSeconds: number; // Interval in seconds
  startTime: number; // Unix timestamp
  endTime?: number; // Optional end time (0 = no expiry)
  cancelable?: boolean;
  pausable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string; // hex-encoded 32-byte category ID for CashTokens
  tokenDecimals?: number; // BCMR decimals; display amounts are whole tokens
}

export interface PaymentDeployment {
  contractAddress: string;
  paymentId: string;
  constructorParams: ConstructorParam[];
  initialCommitment: string; // hex-encoded NFT commitment
  fundingTxRequired: {
    toAddress: string;
    amount: number; // satoshis
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    tokenAmount?: number;
    withNFT: {
      commitment: string; // hex
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export class PaymentDeploymentService {
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
      throw new Error(`Payment sender/recipient must be P2PKH addresses: ${address}`);
    }
    return b.slice(3, 23);
  }

  /**
   * Generate paymentId from parameters
   */
  private generatePaymentId(params: PaymentDeploymentParams): Uint8Array {
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

  /**
   * Create initial NFT commitment for RecurringPaymentCovenant
   *
   * Commitment structure (40 bytes):
   * [0]: status (0=ACTIVE)
   * [1]: flags (bit0=cancelable, bit2=usesTokens)
   * [2-9]: total_paid (0 initially)
   * [10-17]: payment_count (0 initially)
   * [18-22]: next_payment_timestamp (start time + interval)
   * [23-27]: pause_start (0 initially)
   * [28-39]: reserved (zeros)
   */
  private createPaymentCommitment(params: PaymentDeploymentParams): Uint8Array {
    const commitment = new Uint8Array(40);

    commitment[0] = 0; // ACTIVE status

    let flags = 0;
    if (params.cancelable !== false) flags |= 1; // bit 0
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4; // bit 2
    commitment[1] = flags;

    // total_paid = 0 (bytes 2-9)
    // payment_count = 0 (bytes 10-17)
    // pause_start = 0 (bytes 23-27)
    // reserved = zeros (bytes 28-39)
    // All zero-initialized by default.

    // next_payment_timestamp (bytes 18-22, uint40 LE)
    const nextPayment = params.startTime + params.intervalSeconds;
    this.setUint40LE(commitment, 18, nextPayment);

    return commitment;
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
   * Deploy a RecurringPaymentCovenant
   */
  async deployRecurringPayment(params: PaymentDeploymentParams): Promise<PaymentDeployment> {
    const artifact = ContractFactory.getArtifact(ContractFactory.latest('RecurringPaymentCovenant'));

    const vaultId = hexToBin(params.vaultId);
    const senderHash = this.addressToHash160(params.sender);
    const recipientHash = this.addressToHash160(params.recipient);
    const paymentId = this.generatePaymentId(params);

    // RecurringPaymentCovenant requires a fixed totalAmount in constructor.
    // If endTime is not set, default to funding a 12-interval schedule.
    const estimatedPayments = params.endTime
      ? Math.ceil((params.endTime - params.startTime) / params.intervalSeconds)
      : 12;
    const isTokenPayment = params.tokenType === 'FUNGIBLE_TOKEN';
    if (isTokenPayment && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN payments');
    }
    const amountPerIntervalOnChain = isTokenPayment
      ? displayAmountToOnChain(params.amountPerInterval, 'FUNGIBLE_TOKEN', params.tokenDecimals)
      : displayAmountToOnChain(params.amountPerInterval, 'BCH');
    const totalAmountOnChain = amountPerIntervalOnChain * Math.max(0, estimatedPayments);

    const amountPerIntervalSat = BigInt(amountPerIntervalOnChain);
    const totalAmountSat = BigInt(totalAmountOnChain);
    const intervalSeconds = BigInt(params.intervalSeconds);
    const startTimestamp = BigInt(params.startTime);
    const endTimestamp = BigInt(params.endTime || 0); // 0 = no expiry

    // Constructor params for RecurringPaymentCovenant
    const constructorArgs = [
      vaultId,
      senderHash,
      recipientHash,
      amountPerIntervalSat,
      intervalSeconds,
      totalAmountSat,
      startTimestamp,
      endTimestamp,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    // Create initial NFT commitment
    const initialCommitment = this.createPaymentCommitment(params);

    // Serialize constructor params for storage
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

    const fundingTx: PaymentDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: isTokenPayment
        ? 1000 // Dust amount for token contracts
        : totalAmountOnChain,
      withNFT: {
        commitment: binToHex(initialCommitment),
        capability: 'mutable',
      },
    };

    // Add token-specific fields if using CashTokens
    if (isTokenPayment) {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
    }

    return {
      contractAddress: contract.address,
      paymentId: binToHex(paymentId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      fundingTxRequired: fundingTx,
    };
  }
}
