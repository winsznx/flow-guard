import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { resolveFeePayer } from '../utils/feePayer.js';
import { finalizeWcTransactionSequences } from './txFinality.js';
import { toTokenAwareAddress } from '../utils/tokenAddress.js';

export interface ClaimTransactionParams {
  paymentId: string;
  contractAddress: string;
  recipient: string;
  amountPerInterval: number;
  intervalSeconds: number;
  totalPaid: number;
  nextPaymentTime: number;
  currentTime: number;
  endTime?: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  feePayerAddress?: string;
  constructorParams: any[];
  currentCommitment: string;
}

export interface ClaimTransaction {
  claimableAmount: number;
  intervalsClaimable: number;
  wcTransaction: WcTransactionObject;
}

// pay() needs nLockTime >= 500000000 and the tx must be mineable now, so nLockTime
// sits ~2h behind the clock (below median-time-past). Claimability uses the same time.
const CLAIM_LOCKTIME_BUFFER = 7200;

export function getRecurringClaimLocktime(currentTime: number, endTime?: number): number {
  const lagged = Math.max(0, currentTime - CLAIM_LOCKTIME_BUFFER);
  // pay() also needs locktime <= endTimestamp, and the last payment falls due exactly at the end.
  return endTime && endTime > 0 ? Math.min(lagged, endTime) : lagged;
}

export class PaymentClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  calculateClaimable(params: ClaimTransactionParams): { intervals: number; amount: number } {
    const { nextPaymentTime, currentTime, amountPerInterval, endTime } = params;
    const locktime = getRecurringClaimLocktime(currentTime, endTime);

    // RecurringPaymentCovenant.pay() executes exactly one interval per spend.
    if (locktime < nextPaymentTime) {
      return { intervals: 0, amount: 0 };
    }
    if (endTime && endTime > 0 && nextPaymentTime > endTime) {
      return { intervals: 0, amount: 0 };
    }

    return { intervals: 1, amount: amountPerInterval };
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const {
      contractAddress,
      recipient,
      intervalSeconds,
      tokenType,
      tokenCategory,
      feePayerAddress,
      constructorParams,
      currentCommitment,
      currentTime,
    } = params;

    const artifact = ContractFactory.artifactForAddress('RecurringPaymentCovenant', constructorParams, contractAddress);
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for payment contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token) {
      throw new Error('Payment contract UTXO is missing the required mutable state NFT');
    }

    const commitment = this.resolveCommitment(contractUtxo.token.nft?.commitment as unknown, currentCommitment);
    if (commitment.length < 28) {
      throw new Error(`Invalid payment state commitment length: expected >=28, got ${commitment.length}`);
    }
    const status = commitment[0] ?? 0;
    if (status !== 0) {
      throw new Error(`Payment is not ACTIVE on-chain (status=${status})`);
    }
    const onChainUsesTokens = ((commitment[1] ?? 0) & 0x04) === 0x04;
    const requestedUsesTokens = tokenType === 'FUNGIBLE_TOKEN';
    if (onChainUsesTokens !== requestedUsesTokens) {
      throw new Error(
        `Token type mismatch: payment on-chain uses ${onChainUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}, `
        + `but claim request used ${requestedUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}`,
      );
    }

    const totalPaidBigint = this.readUint64LE(commitment, 2);
    const totalPaidFromCommitment = Number(totalPaidBigint);
    const nextPaymentFromCommitment = this.readUint40LE(commitment, 18);
    const { intervals, amount: claimableAmount } = this.calculateClaimable({
      ...params,
      totalPaid: totalPaidFromCommitment,
      nextPaymentTime: nextPaymentFromCommitment,
    });

    if (claimableAmount <= 0) {
      throw new Error('No payments available to claim at this time');
    }

    const newTotalPaidBigint = totalPaidBigint + BigInt(claimableAmount);
    const newTotalPaid = Number(newTotalPaidBigint);
    const newNextPaymentTime = nextPaymentFromCommitment + intervalSeconds;

    const newCommitment = new Uint8Array(40);
    const configuredTotalAmount = BigInt(
      typeof constructorParams[5] === 'bigint'
        ? constructorParams[5]
        : Number(constructorParams[5] ?? 0),
    );
    const nextStatus = configuredTotalAmount > 0n && BigInt(newTotalPaid) >= configuredTotalAmount
      ? 3
      : 0;
    newCommitment[0] = nextStatus;
    newCommitment[1] = commitment[1] ?? 0; // flags

    const currentPaymentCount = new DataView(
      commitment.buffer,
      commitment.byteOffset + 10,
      8,
    ).getBigUint64(0, true);
    const newPaymentCount = currentPaymentCount + 1n;

    new DataView(newCommitment.buffer, 2, 8).setBigUint64(0, newTotalPaidBigint, true);
    new DataView(newCommitment.buffer, 10, 8).setBigUint64(0, newPaymentCount, true);
    this.setUint40LE(newCommitment, 18, newNextPaymentTime);
    this.setUint40LE(newCommitment, 23, 0); // pause_start reset

    const claimAmountBig = BigInt(claimableAmount);
    // RecurringPayment.pay caps outputs at <= 2 (recipient + state) and
    // payFeeDelta = input - amountPerInterval - out1, so the fee is self-funded
    // from the contract reserve (an external fee payer's change output would
    // exceed the cap). Fee 4000 is in [min relay ~3500, 5000 covenant cap].
    const fee = 4000n;
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : claimAmountBig;
    const stateOutputSatoshis = contractBalance - recipientOutputSatoshis - fee;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to preserve recurring payment state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    // Keep the input non-final so the network enforces nLockTime (CHECKLOCKTIMEVERIFY).
    txBuilder.setLocktime(getRecurringClaimLocktime(currentTime, params.endTime));
    txBuilder.addInput(contractUtxo, contract.unlock.pay(), { sequence: 0xfffffffe });

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      const tokenAmount = contractUtxo.token.amount ?? 0n;
      const remainingTokens = tokenAmount - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in contract UTXO for payment interval');
      }

      txBuilder.addOutput({
        to: toTokenAwareAddress(recipient),
        amount: 1000n,
        token: { category: tokenCategory, amount: claimAmountBig },
      });

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: stateOutputSatoshis,
        token: {
          category: tokenCategory,
          amount: remainingTokens,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    } else {
      txBuilder.addOutput({ to: toTokenAwareAddress(recipient), amount: claimAmountBig });

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: stateOutputSatoshis,
        token: {
          category: contractUtxo.token.category,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    }

    const wcTransaction = finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Claim your payment',
    }));

    console.log('[PaymentClaimService] Built claim transaction', {
      contractAddress,
      claimableAmount,
      intervalsClaimable: intervals,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      fee: fee.toString(),
      stateOutputSatoshis: stateOutputSatoshis.toString(),
      inputSatoshis: contractUtxo.satoshis.toString(),
    });

    return {
      claimableAmount,
      intervalsClaimable: intervals,
      wcTransaction,
    };
  }

  private setUint40LE(target: Uint8Array, offset: number, value: number): void {
    const safe = Math.max(0, Math.floor(value));
    target[offset] = safe & 0xff;
    target[offset + 1] = (safe >>> 8) & 0xff;
    target[offset + 2] = (safe >>> 16) & 0xff;
    target[offset + 3] = (safe >>> 24) & 0xff;
    target[offset + 4] = Math.floor(safe / 0x100000000) & 0xff;
  }

  private resolveCommitment(onChain: unknown, fallbackHex?: string): Uint8Array {
    if (onChain instanceof Uint8Array) {
      return onChain;
    }
    if (typeof onChain === 'string' && onChain.length > 0) {
      return hexToBin(onChain);
    }
    if (fallbackHex && fallbackHex.length > 0) {
      return hexToBin(fallbackHex);
    }
    return new Uint8Array();
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
  }

  private readUint40LE(source: Uint8Array, offset: number): number {
    if (source.length < offset + 5) return 0;
    return source[offset]
      + (source[offset + 1] << 8)
      + (source[offset + 2] << 16)
      + (source[offset + 3] << 24)
      + (source[offset + 4] * 0x100000000);
  }
}
