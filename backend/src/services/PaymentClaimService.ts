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

export class PaymentClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  calculateClaimable(params: ClaimTransactionParams): { intervals: number; amount: number } {
    const { nextPaymentTime, currentTime, amountPerInterval, endTime } = params;

    // RecurringPaymentCovenant.pay() executes exactly one interval per spend.
    if (currentTime < nextPaymentTime) {
      return { intervals: 0, amount: 0 };
    }
    if (endTime && endTime > 0 && nextPaymentTime > endTime) {
      return { intervals: 0, amount: 0 };
    }

    return { intervals: 1, amount: amountPerInterval };
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const { intervals, amount: claimableAmount } = this.calculateClaimable(params);

    if (claimableAmount <= 0) {
      throw new Error('No payments available to claim at this time');
    }

    const {
      contractAddress,
      recipient,
      totalPaid,
      nextPaymentTime,
      intervalSeconds,
      tokenType,
      tokenCategory,
      feePayerAddress,
      constructorParams,
      currentCommitment,
      currentTime,
    } = params;

    const artifact = ContractFactory.getArtifact('RecurringPaymentCovenant');
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

    // Update NFT commitment for RecurringPaymentCovenant:
    // [0]=status, [1]=flags, [2-9]=total_paid, [10-17]=payment_count, [18-22]=next_payment, [23-27]=pause_start
    const newTotalPaid = totalPaid + claimableAmount;
    const newNextPaymentTime = nextPaymentTime + intervalSeconds;

    const existingCommitment = currentCommitment ? hexToBin(currentCommitment) : new Uint8Array(40);
    if (existingCommitment.length < 40) {
      throw new Error(`Invalid payment state commitment length: expected >=40, got ${existingCommitment.length}`);
    }

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
    newCommitment[1] = existingCommitment[1]; // flags

    const currentPaymentCount = new DataView(
      existingCommitment.buffer,
      existingCommitment.byteOffset + 10,
      8,
    ).getBigUint64(0, true);
    const newPaymentCount = currentPaymentCount + 1n;

    new DataView(newCommitment.buffer, 2, 8).setBigUint64(0, BigInt(newTotalPaid), true);
    new DataView(newCommitment.buffer, 10, 8).setBigUint64(0, newPaymentCount, true);
    this.setUint40LE(newCommitment, 18, newNextPaymentTime);
    this.setUint40LE(newCommitment, 23, 0); // pause_start reset

    const claimAmountBig = BigInt(claimableAmount);
    const fee = 1500n;
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : claimAmountBig;
    if (contractBalance < recipientOutputSatoshis) {
      throw new Error('Insufficient contract balance to satisfy payment output');
    }
    const minimumStateOutput = 546n;
    const contractStateAmount = contractBalance - recipientOutputSatoshis;
    const stateTopUpNeeded = contractStateAmount >= minimumStateOutput
      ? 0n
      : minimumStateOutput - contractStateAmount;
    const requiredExternalSatoshis = fee + stateTopUpNeeded;
    const resolvedFeePayerAddress = feePayerAddress || recipient;
    const feePayer = await resolveFeePayer(
      this.provider,
      this.network,
      resolvedFeePayerAddress,
      requiredExternalSatoshis,
    );
    const stateOutputSatoshis = contractStateAmount + stateTopUpNeeded;

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(currentTime);
    txBuilder.addInput(contractUtxo, contract.unlock.pay());
    for (const utxo of feePayer.utxos) {
      txBuilder.addInput(utxo, feePayer.unlocker);
    }

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      const tokenAmount = contractUtxo.token.amount ?? 0n;
      const remainingTokens = tokenAmount - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in contract UTXO for payment interval');
      }

      txBuilder.addOutput({
        to: recipient,
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
      txBuilder.addOutput({ to: recipient, amount: claimAmountBig });

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

    const feeChange = feePayer.total - requiredExternalSatoshis;
    if (feeChange > 546n) {
      txBuilder.addOutput({
        to: feePayer.address,
        amount: feeChange,
      });
    }

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Claim recurring payment',
    });

    console.log('[PaymentClaimService] Built claim transaction', {
      contractAddress,
      claimableAmount,
      intervalsClaimable: intervals,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      feePayerAddress: feePayer.address,
      feeSponsored: feePayer.sponsored,
      stateTopUpSatoshis: stateTopUpNeeded.toString(),
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
}
