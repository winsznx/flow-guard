/**
 * Budget Release Service
 * Builds transactions for claiming milestone-based budget releases
 */

import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, binToHex } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { resolveFeePayer } from '../utils/feePayer.js';
import { finalizeWcTransactionSequences } from './txFinality.js';

export interface TransactionOutput {
  to: string;
  amount: number;
  token?: {
    category: string;
    amount: number;
    nft?: {
      commitment: string;
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export interface TransactionInput {
  txid: string;
  vout: number;
  satoshis: number;
  tokenCategory?: string;
  tokenAmount?: number;
  contractAddress?: string;
  unlockingBytecode?: string;
}

export interface ReleaseTransactionParams {
  budgetId: string;
  contractAddress: string;
  recipient: string;
  stepInterval: number; // Seconds per milestone
  stepAmount: number; // Amount per milestone
  totalAmount: number;
  totalReleased: number; // Already released
  lastReleaseTime: number; // Cursor or last release timestamp
  currentTime: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  feePayerAddress?: string;
  constructorParams: any[];
  currentCommitment: string;
}

export interface ReleaseTransaction {
  releasableAmount: number;
  milestonesReleasable: number;

  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  fee: number;

  contractFunction: 'claim';
  contractParams: {
    recipientSignature: string;
    currentTime: number;
  };

  newCommitment: string;
  requiredSignature: string;
  txHex: string;
  wcTransaction: WcTransactionObject;
}

export class BudgetReleaseService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Build transaction to release milestone funds
   * Uses VestingCovenant's claim() function with STEP schedule
   */
  async buildReleaseTransaction(params: ReleaseTransactionParams): Promise<ReleaseTransaction> {
    const {
      contractAddress,
      recipient,
      stepInterval,
      stepAmount,
      totalAmount,
      totalReleased,
      lastReleaseTime,
      currentTime,
      tokenType,
      tokenCategory,
      feePayerAddress,
      constructorParams,
      currentCommitment,
    } = params;

    // Calculate completed milestones since last release
    const elapsedTime = currentTime - lastReleaseTime;
    const completedMilestones = Math.floor(elapsedTime / stepInterval);

    if (completedMilestones === 0) {
      throw new Error('No milestones available to release yet');
    }

    // Calculate releasable amount (capped at total)
    let vestedTotal = completedMilestones * stepAmount;
    if (vestedTotal > totalAmount) {
      vestedTotal = totalAmount;
    }

    const releasableAmount = vestedTotal - totalReleased;

    if (releasableAmount <= 0) {
      throw new Error('No funds available to release');
    }

    // Get contract artifact
    const artifact = ContractFactory.getArtifact('VestingCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    // Get contract UTXOs
    const contractUtxos = await this.provider.getUtxos(contractAddress);

    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for budget contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;

    if (!contractUtxo.token) {
      throw new Error('Budget contract UTXO missing required state NFT token');
    }

    // Build inputs
    const inputs: TransactionInput[] = [
      {
        txid: contractUtxo.txid,
        vout: contractUtxo.vout,
        satoshis: Number(contractBalance),
        tokenCategory: contractUtxo.token?.category,
        tokenAmount: contractUtxo.token?.amount ? Number(contractUtxo.token.amount) : undefined,
        contractAddress,
        unlockingBytecode: 'COVENANT_UNLOCK',
      },
    ];

    // Calculate new state
    const newTotalReleased = totalReleased + releasableAmount;
    const newStatus = newTotalReleased >= totalAmount ? 3 : 0; // COMPLETED : ACTIVE

    // Build new NFT commitment
    const commitment = hexToBin(currentCommitment);
    const newCommitment = new Uint8Array(40);
    newCommitment.set(commitment.slice(0, 40));

    // Update status
    newCommitment[0] = newStatus;

    // Update total_released (bytes 2-9, uint64 little-endian)
    const releasedView = new DataView(newCommitment.buffer, 2, 8);
    releasedView.setBigUint64(0, BigInt(newTotalReleased), true);

    // Calculate outputs
    const releasableAmountBig = BigInt(releasableAmount);
    const estimatedFee = 1000n;
    const resolvedFeePayerAddress = feePayerAddress || recipient;
    const feePayer = await resolveFeePayer(this.provider, this.network, resolvedFeePayerAddress, estimatedFee);
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : releasableAmountBig;
    const remainingBalance = contractBalance - recipientOutputSatoshis;
    const minimumStateOutput = 546n;

    if (remainingBalance < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve budget state UTXO');
    }

    const outputs: TransactionOutput[] = [];
    for (const utxo of feePayer.utxos) {
      inputs.push({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: Number(utxo.satoshis),
      });
    }

    let remainingTokens = 0n;
    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory) {
        throw new Error('Token category required for token budget releases');
      }
      const contractTokenAmount = contractUtxo.token.amount ?? 0n;
      remainingTokens = contractTokenAmount - releasableAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in budget contract UTXO');
      }
    }

    // Output 1: Release amount to recipient
    if (tokenType === 'FUNGIBLE_TOKEN') {
      outputs.push({
        to: recipient,
        amount: 1000, // Dust amount for token output
        token: {
          category: tokenCategory!,
          amount: Number(releasableAmountBig),
        },
      });
    } else {
      outputs.push({
        to: recipient,
        amount: releasableAmount,
      });
    }

    // Output 2: Updated state UTXO back to covenant (required even when completed)
    if (tokenType === 'FUNGIBLE_TOKEN') {
      outputs.push({
        to: contractAddress,
        amount: Number(remainingBalance),
        token: {
          category: tokenCategory!,
          amount: Number(remainingTokens),
          nft: {
            commitment: binToHex(newCommitment),
            capability: 'mutable',
          },
        },
      });
    } else {
      outputs.push({
        to: contractAddress,
        amount: Number(remainingBalance),
        token: {
          category: contractUtxo.token.category,
          amount: 0,
          nft: {
            commitment: binToHex(newCommitment),
            capability: 'mutable',
          },
        },
      });
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(currentTime);

    txBuilder.addInput(
      contractUtxo,
      contract.unlock.claim(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    for (const utxo of feePayer.utxos) {
      txBuilder.addInput(utxo, feePayer.unlocker);
    }

    if (tokenType === 'FUNGIBLE_TOKEN') {
      txBuilder.addOutput({
        to: recipient,
        amount: 1000n,
        token: {
          category: tokenCategory!,
          amount: releasableAmountBig,
        },
      });
    } else {
      txBuilder.addOutput({
        to: recipient,
        amount: releasableAmountBig,
      });
    }

    if (tokenType === 'FUNGIBLE_TOKEN') {
      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingBalance,
        token: {
          category: tokenCategory!,
          amount: remainingTokens,
          nft: {
            commitment: binToHex(newCommitment),
            capability: 'mutable',
          },
        },
      });
    } else {
      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingBalance,
        token: {
          category: contractUtxo.token.category,
          amount: 0n,
          nft: {
            commitment: binToHex(newCommitment),
            capability: 'mutable',
          },
        },
      });
    }

    const feeChange = feePayer.total - estimatedFee;
    if (feeChange > 546n) {
      outputs.push({
        to: feePayer.address,
        amount: Number(feeChange),
      });
      txBuilder.addOutput({
        to: feePayer.address,
        amount: feeChange,
      });
    }

    const wcTransaction = finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Release budget milestone funds',
    }));

    return {
      releasableAmount,
      milestonesReleasable: completedMilestones,

      inputs,
      outputs,
      fee: Number(estimatedFee),

      contractFunction: 'claim' as const,
      contractParams: {
        recipientSignature: 'RECIPIENT_SIGNATURE',
        currentTime,
      },

      newCommitment: binToHex(newCommitment),
      requiredSignature: recipient,

      txHex: JSON.stringify({ inputs, outputs, fee: Number(estimatedFee) }),
      wcTransaction,
    };
  }
}
