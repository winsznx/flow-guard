/**
 * Bounty Control Service
 * Handles pause and cancel operations for BountyCovenant contracts
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
import {
  binToHex,
  hexToBin,
  lockingBytecodeToCashAddress,
} from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';

export interface BountyControlBuildParams {
  contractAddress: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  feePayerAddress?: string;
}

export interface BountyControlBuildResult {
  wcTransaction: WcTransactionObject;
  nextStatus: 'PAUSED' | 'CANCELLED';
  cancelReturnAddress?: string;
  remainingPool?: bigint;
}

export class BountyControlService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildPauseTransaction(params: BountyControlBuildParams): Promise<BountyControlBuildResult> {
    const artifact = ContractFactory.getArtifact('BountyCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Bounty must be ACTIVE to pause');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Bounty is not configured as cancelable/pausable');
    }
    if (commitment.length < 19) {
      throw new Error('Invalid bounty state commitment');
    }

    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 1; // PAUSED
    newCommitment.set(commitment.slice(1, 19), 1);
    newCommitment.fill(0, 19);

    const feeReserve = 1200n;

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(0);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.pause(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    const feePayer = params.feePayerAddress
      ? await this.selectFeePayerInputs(params.feePayerAddress, feeReserve)
      : null;
    if (feePayer) {
      const unlocker = placeholderP2PKHUnlocker(params.feePayerAddress!);
      for (const utxo of feePayer.utxos) {
        txBuilder.addInput(utxo, unlocker);
      }
    }
    const stateOutputSatoshis = feePayer
      ? contractUtxo.satoshis
      : contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to pause bounty');
    }

    txBuilder.addOutput({
      to: contract.tokenAddress,
      amount: stateOutputSatoshis,
      token: {
        category: contractUtxo.token.category,
        amount: contractUtxo.token.amount ?? 0n,
        nft: {
          capability: contractUtxo.token.nft.capability as 'none' | 'mutable' | 'minting',
          commitment: binToHex(newCommitment),
        },
      },
    });
    if (feePayer) {
      const feeChange = feePayer.total - feeReserve;
      if (feeChange > 546n) {
        txBuilder.addOutput({
          to: params.feePayerAddress!,
          amount: feeChange,
        });
      }
    }

    const wcTransaction = this.forceFinalSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Pause bounty campaign',
      }));

    return {
      wcTransaction,
      nextStatus: 'PAUSED',
    };
  }

  async buildCancelTransaction(params: BountyControlBuildParams): Promise<BountyControlBuildResult> {
    const artifact = ContractFactory.getArtifact('BountyCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0 && status !== 1) {
      throw new Error('Bounty must be ACTIVE or PAUSED to cancel');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Bounty is not cancelable');
    }

    // BountyCovenant commitment layout:
    // [2-9]=total_paid, [10-13]=winners_count
    // Constructor: [2]=rewardPerWinner, [3]=maxWinners
    const winnersCount = this.readUint32LE(commitment, 10);
    const rewardPerWinner = this.toBigIntParam(params.constructorParams[2], 'rewardPerWinner');
    const maxWinners = this.toBigIntParam(params.constructorParams[3], 'maxWinners');
    const remainingPool = this.clampToZero((maxWinners - winnersCount) * rewardPerWinner);
    if (remainingPool <= 0n) {
      throw new Error('No remaining pool available to cancel');
    }

    const authorityHash = this.readBytes20(params.constructorParams[1], 'authorityHash');
    const cancelReturnAddress = this.p2pkhFromHash(authorityHash);

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(0);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.cancel(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
    const feeReserve = 1500n;
    const feePayer = params.feePayerAddress
      ? await this.selectFeePayerInputs(params.feePayerAddress, feeReserve)
      : null;
    if (feePayer) {
      const unlocker = placeholderP2PKHUnlocker(params.feePayerAddress!);
      for (const utxo of feePayer.utxos) {
        txBuilder.addInput(utxo, unlocker);
      }
    }

    let spentSatoshis = 0n;
    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      if (!contractUtxo.token?.category) {
        throw new Error('Cancel requires tokenized covenant UTXO with token category');
      }
      if (contractUtxo.satoshis < 1000n) {
        throw new Error('Insufficient contract satoshis to build token cancel output');
      }
      txBuilder.addOutput({
        to: cancelReturnAddress,
        amount: 1000n,
        token: {
          category: contractUtxo.token.category,
          amount: remainingPool,
        },
      });
      spentSatoshis += 1000n;
    } else {
      if (remainingPool < 546n) {
        throw new Error('Remaining BCH pool is below dust and cannot be cancelled');
      }
      if (contractUtxo.satoshis < remainingPool) {
        throw new Error('Contract balance is below remaining BCH pool; cannot build valid cancel transaction');
      }
      txBuilder.addOutput({
        to: cancelReturnAddress,
        amount: remainingPool,
      });
      spentSatoshis += remainingPool;
    }

    if (feePayer) {
      const contractChange = contractUtxo.satoshis - spentSatoshis;
      if (contractChange < 0n) {
        throw new Error('Contract balance is insufficient for required cancel outputs');
      }
      if (contractChange > 546n) {
        txBuilder.addOutput({
          to: cancelReturnAddress,
          amount: contractChange,
        });
      }

      const feeChange = feePayer.total - feeReserve;
      if (feeChange > 546n) {
        txBuilder.addOutput({
          to: params.feePayerAddress!,
          amount: feeChange,
        });
      }
    } else {
      const contractChange = contractUtxo.satoshis - spentSatoshis - feeReserve;
      if (contractChange < 0n) {
        throw new Error(
          'Cancel requires an additional fee-paying input. Provide signer address with spendable BCH.'
        );
      }
      if (contractChange > 546n) {
        txBuilder.addOutput({
          to: cancelReturnAddress,
          amount: contractChange,
        });
      }
    }

    const wcTransaction = this.forceFinalSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Cancel bounty campaign and recover remaining funds',
      }));

    return {
      wcTransaction,
      nextStatus: 'CANCELLED',
      cancelReturnAddress,
      remainingPool,
    };
  }

  private async getContractState(contractAddress: string, fallbackCommitment: string): Promise<{
    contractUtxo: any;
    commitment: Uint8Array;
  }> {
    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for bounty contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Bounty contract UTXO is missing required state NFT');
    }

    const onChainCommitment: unknown = contractUtxo.token.nft.commitment;
    const commitment =
      onChainCommitment instanceof Uint8Array
        ? onChainCommitment
        : typeof onChainCommitment === 'string'
        ? hexToBin(onChainCommitment)
        : hexToBin(fallbackCommitment || '');

    if (commitment.length < 19) {
      throw new Error('Invalid bounty state commitment');
    }

    return { contractUtxo, commitment };
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
  }

  private readUint32LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 4);
    return BigInt(view.getUint32(0, true));
  }

  private toBigIntParam(value: unknown, name: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    if (typeof value === 'string' && value.length > 0) return BigInt(value);
    if (value instanceof Uint8Array) {
      if (value.length > 8) throw new Error(`Unsupported byte length for ${name}`);
      let result = 0n;
      for (let i = value.length - 1; i >= 0; i--) {
        result = (result << 8n) + BigInt(value[i]);
      }
      return result;
    }
    throw new Error(`Invalid constructor parameter for ${name}`);
  }

  private readBytes20(value: unknown, name: string): Uint8Array {
    let bytes: Uint8Array;
    if (value instanceof Uint8Array) {
      bytes = value;
    } else if (typeof value === 'string') {
      bytes = hexToBin(value);
    } else {
      throw new Error(`Invalid constructor parameter for ${name}`);
    }
    if (bytes.length !== 20) {
      throw new Error(`${name} must be 20 bytes`);
    }
    return bytes;
  }

  private p2pkhFromHash(hash20: Uint8Array): string {
    const lockingBytecode = new Uint8Array(25);
    lockingBytecode[0] = 0x76;
    lockingBytecode[1] = 0xa9;
    lockingBytecode[2] = 0x14;
    lockingBytecode.set(hash20, 3);
    lockingBytecode[23] = 0x88;
    lockingBytecode[24] = 0xac;
    const encoded = lockingBytecodeToCashAddress({
      bytecode: lockingBytecode,
      prefix: this.networkPrefix(),
    });
    if (typeof encoded === 'string') {
      throw new Error(`Failed to encode authority P2PKH address: ${encoded}`);
    }
    return encoded.address;
  }

  private clampToZero(value: bigint): bigint {
    return value > 0n ? value : 0n;
  }

  private async selectFeePayerInputs(address: string, requiredFee: bigint): Promise<{
    utxos: any[];
    total: bigint;
  }> {
    const utxos = await this.provider.getUtxos(address);
    const spendable = utxos
      .filter((utxo: any) => !utxo.token)
      .sort((a: any, b: any) => {
        const aSats = BigInt(a.satoshis);
        const bSats = BigInt(b.satoshis);
        if (aSats < bSats) return 1;
        if (aSats > bSats) return -1;
        return 0;
      });

    const singleInput = spendable.find((utxo: any) => BigInt(utxo.satoshis) >= requiredFee);
    if (singleInput) {
      return { utxos: [singleInput], total: BigInt(singleInput.satoshis) };
    }

    const selected: any[] = [];
    let total = 0n;
    for (const utxo of spendable) {
      selected.push(utxo);
      total += BigInt(utxo.satoshis);
      if (total >= requiredFee) break;
    }

    if (total < requiredFee) {
      throw new Error(
        `Signer ${address} needs at least ${requiredFee} sats of BCH UTXOs to pay network fee for this action`
      );
    }

    return { utxos: selected, total };
  }

  private forceFinalSequences(wcTransaction: WcTransactionObject): WcTransactionObject {
    const finalSequence = 0xffffffff;
    for (const input of wcTransaction.transaction.inputs as Array<{ sequenceNumber?: number }>) {
      input.sequenceNumber = finalSequence;
    }
    for (const sourceOutput of wcTransaction.sourceOutputs as Array<{ sequenceNumber?: number }>) {
      sourceOutput.sequenceNumber = finalSequence;
    }
    return wcTransaction;
  }

  private networkPrefix(): 'bitcoincash' | 'bchtest' {
    return this.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
  }
}
