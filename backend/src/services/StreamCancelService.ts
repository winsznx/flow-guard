import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
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

export interface StreamCancelParams {
  streamType: 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID';
  contractAddress: string;
  sender: string;
  recipient: string;
  currentTime: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment?: string;
}

export interface StreamCancelTransaction {
  vestedAmount: number;
  unvestedAmount: number;
  cancelReturnAddress: string;
  wcTransaction: WcTransactionObject;
}

export class StreamCancelService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildCancelTransaction(params: StreamCancelParams): Promise<StreamCancelTransaction> {
    const artifact = ContractFactory.getArtifact(
      params.streamType === 'RECURRING'
        ? 'RecurringPaymentCovenant'
        : params.streamType === 'TRANCHE'
          ? 'TrancheVestingCovenant'
        : params.streamType === 'HYBRID'
          ? 'HybridVestingCovenant'
          : 'VestingCovenant',
    );

    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const contractUtxos = await this.provider.getUtxos(params.contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for stream contract ${params.contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u: any) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Stream contract UTXO is missing required state NFT');
    }

    const senderHash = this.readBytes20(params.constructorParams[1], 'senderHash');
    const cancelReturnAddress = this.p2pkhFromHash(senderHash);
    const commitment = this.resolveCommitment(contractUtxo.token.nft.commitment, params.currentCommitment);

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.cancel(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );

    const contractBalance = contractUtxo.satoshis;
    const fee = 1500n;

    if (params.streamType === 'RECURRING') {
      const result = this.addRecurringCancelOutputs({
        txBuilder,
        commitment,
        contractBalance,
        fee,
        sender: params.sender,
        cancelReturnAddress,
        tokenType: params.tokenType,
        tokenCategory: params.tokenCategory,
        totalAmount: this.readBigInt(params.constructorParams[5], 'totalAmount'),
      });

      const wcTransaction = txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: `Cancel recurring stream to recover ${result.unvestedAmount} units`,
      });

      console.log('[StreamCancelService] Built recurring cancel transaction', {
        contractAddress: params.contractAddress,
        cancelReturnAddress,
        vestedAmount: result.vestedAmount.toString(),
        unvestedAmount: result.unvestedAmount.toString(),
        tokenType: params.tokenType || 'BCH',
        tokenCategory: params.tokenCategory || null,
      });

      return {
        vestedAmount: Number(result.vestedAmount),
        unvestedAmount: Number(result.unvestedAmount),
        cancelReturnAddress,
        wcTransaction,
      };
    }

    const result = params.streamType === 'HYBRID'
      ? this.addHybridCancelOutputs({
          txBuilder,
          commitment,
          contractBalance,
          fee,
          sender: params.sender,
          recipient: params.recipient,
          cancelReturnAddress,
          tokenType: params.tokenType,
          tokenCategory: params.tokenCategory,
          totalAmount: this.readBigInt(params.constructorParams[2], 'totalAmount'),
          startTimestamp: this.readBigInt(params.constructorParams[3], 'startTimestamp'),
          unlockTimestamp: this.readBigInt(params.constructorParams[4], 'unlockTimestamp'),
          endTimestamp: this.readBigInt(params.constructorParams[5], 'endTimestamp'),
          upfrontAmount: this.readBigInt(params.constructorParams[6], 'upfrontAmount'),
          locktime: params.currentTime,
        })
      : this.addVestingCancelOutputs({
          txBuilder,
          commitment,
          contractBalance,
          fee,
          sender: params.sender,
          recipient: params.recipient,
          cancelReturnAddress,
          tokenType: params.tokenType,
          tokenCategory: params.tokenCategory,
          scheduleType: Number(this.readBigInt(params.constructorParams[2], 'scheduleType')),
          totalAmount: this.readBigInt(params.constructorParams[3], 'totalAmount'),
          startTimestamp: this.readBigInt(params.constructorParams[4], 'startTimestamp'),
          endTimestamp: this.readBigInt(params.constructorParams[5], 'endTimestamp'),
          stepInterval: this.readBigInt(params.constructorParams[7], 'stepInterval'),
          stepAmount: this.readBigInt(params.constructorParams[8], 'stepAmount'),
          locktime: params.currentTime,
        });

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: `Cancel vesting stream. Return ${result.unvestedAmount} units`,
    });

    console.log('[StreamCancelService] Built vesting cancel transaction', {
      contractAddress: params.contractAddress,
      cancelReturnAddress,
      vestedAmount: result.vestedAmount.toString(),
      unvestedAmount: result.unvestedAmount.toString(),
      tokenType: params.tokenType || 'BCH',
      tokenCategory: params.tokenCategory || null,
    });

    return {
      vestedAmount: Number(result.vestedAmount),
      unvestedAmount: Number(result.unvestedAmount),
      cancelReturnAddress,
      wcTransaction,
    };
  }

  private addRecurringCancelOutputs(args: {
    txBuilder: TransactionBuilder;
    commitment: Uint8Array;
    contractBalance: bigint;
    fee: bigint;
    sender: string;
    cancelReturnAddress: string;
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    totalAmount: bigint;
  }): { vestedAmount: bigint; unvestedAmount: bigint } {
    const totalPaid = this.readUint64LE(args.commitment, 2);
    const remainingPool = args.totalAmount > 0n
      ? this.clampToZero(args.totalAmount - totalPaid)
      : 0n;
    const dust = 1000n;

    let spentSatoshis = 0n;
    if (remainingPool > 0n) {
      if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
        args.txBuilder.addOutput({
          to: args.cancelReturnAddress,
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: remainingPool,
          },
        });
        spentSatoshis += dust;
      } else {
        if (remainingPool < 546n) {
          throw new Error('Remaining BCH pool is below dust and cannot be cancelled');
        }
        args.txBuilder.addOutput({
          to: args.cancelReturnAddress,
          amount: remainingPool,
        });
        spentSatoshis += remainingPool;
      }
    }

    const senderChange = args.contractBalance - spentSatoshis - args.fee;
    if (senderChange < 0n) {
      throw new Error('Insufficient BCH in contract to pay cancellation fee');
    }
    if (senderChange > 546n) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: totalPaid, unvestedAmount: remainingPool };
  }

  private addVestingCancelOutputs(args: {
    txBuilder: TransactionBuilder;
    commitment: Uint8Array;
    contractBalance: bigint;
    fee: bigint;
    sender: string;
    recipient: string;
    cancelReturnAddress: string;
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    scheduleType: number;
    totalAmount: bigint;
    startTimestamp: bigint;
    endTimestamp: bigint;
    stepInterval: bigint;
    stepAmount: bigint;
    locktime: number;
  }): { vestedAmount: bigint; unvestedAmount: bigint } {
    const totalReleased = this.readUint64LE(args.commitment, 2);
    const cursor = this.readUint40LE(args.commitment, 10);
    const duration = Number(args.endTimestamp - args.startTimestamp);
    const elapsed = Math.max(0, args.locktime - Number(cursor));

    let vestedAtCancel = 0n;
    if (args.scheduleType === 1) {
      if (duration <= 0 || elapsed >= duration) {
        vestedAtCancel = args.totalAmount;
      } else {
        vestedAtCancel = (args.totalAmount * BigInt(elapsed)) / BigInt(duration);
      }
    } else if (args.scheduleType === 2) {
      const interval = Number(args.stepInterval);
      if (interval <= 0) {
        throw new Error('Invalid step interval in stream constructor parameters');
      }
      const completedSteps = BigInt(Math.floor(elapsed / interval));
      vestedAtCancel = completedSteps * args.stepAmount;
      if (vestedAtCancel > args.totalAmount) vestedAtCancel = args.totalAmount;
    } else {
      throw new Error(`Unsupported vesting schedule type: ${args.scheduleType}`);
    }

    const claimableNow = this.clampToZero(vestedAtCancel - totalReleased);
    const unvested = this.clampToZero(args.totalAmount - vestedAtCancel);
    const dust = 1000n;
    let spentSatoshis = 0n;

    if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
      if (claimableNow > 0n) {
        args.txBuilder.addOutput({
          to: args.recipient,
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: claimableNow,
          },
        });
        spentSatoshis += dust;
      } else if (unvested > 0n) {
        // VestingCovenant.cancel() checks unvested at output[1]; keep output[0] occupied.
        args.txBuilder.addOutput({ to: args.recipient, amount: dust });
        spentSatoshis += dust;
      }

      if (unvested > 0n) {
        args.txBuilder.addOutput({
          to: args.cancelReturnAddress,
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: unvested,
          },
        });
        spentSatoshis += dust;
      }
    } else {
      if (claimableNow > 0n) {
        if (claimableNow < 546n) {
          throw new Error('Claimable vested BCH is below dust; wait longer before cancelling');
        }
        args.txBuilder.addOutput({ to: args.recipient, amount: claimableNow });
        spentSatoshis += claimableNow;
      } else if (unvested > 0n) {
        // VestingCovenant.cancel() expects unvested at output index 1 when unvested > 0.
        args.txBuilder.addOutput({ to: args.recipient, amount: 546n });
        spentSatoshis += 546n;
      }

      if (unvested > 0n) {
        if (unvested < 546n) {
          throw new Error('Unvested BCH is below dust and cannot be cancelled');
        }
        args.txBuilder.addOutput({ to: args.cancelReturnAddress, amount: unvested });
        spentSatoshis += unvested;
      }
    }

    const senderChange = args.contractBalance - spentSatoshis - args.fee;
    if (senderChange < 0n) {
      throw new Error(
        'Insufficient BCH in contract to satisfy cancellation outputs and network fee. ' +
        'This stream likely needs explicit fee reserve funding.',
      );
    }
    if (senderChange > 546n) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: vestedAtCancel, unvestedAmount: unvested };
  }

  private addHybridCancelOutputs(args: {
    txBuilder: TransactionBuilder;
    commitment: Uint8Array;
    contractBalance: bigint;
    fee: bigint;
    sender: string;
    recipient: string;
    cancelReturnAddress: string;
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    totalAmount: bigint;
    startTimestamp: bigint;
    unlockTimestamp: bigint;
    endTimestamp: bigint;
    upfrontAmount: bigint;
    locktime: number;
  }): { vestedAmount: bigint; unvestedAmount: bigint } {
    const totalReleased = this.readUint64LE(args.commitment, 2);
    const cursor = this.readUint40LE(args.commitment, 10);
    const timeShift = cursor - args.startTimestamp;
    const effectiveNow = BigInt(args.locktime) - timeShift;

    let vestedAtCancel = 0n;
    if (effectiveNow >= args.endTimestamp) {
      vestedAtCancel = args.totalAmount;
    } else if (effectiveNow >= args.unlockTimestamp) {
      const remainingAmount = args.totalAmount - args.upfrontAmount;
      const linearDuration = args.endTimestamp - args.unlockTimestamp;
      vestedAtCancel = linearDuration <= 0n
        ? args.totalAmount
        : args.upfrontAmount + ((remainingAmount * (effectiveNow - args.unlockTimestamp)) / linearDuration);
      if (vestedAtCancel > args.totalAmount) vestedAtCancel = args.totalAmount;
    }

    const claimableNow = this.clampToZero(vestedAtCancel - totalReleased);
    const unvested = this.clampToZero(args.totalAmount - vestedAtCancel);
    const dust = 1000n;
    let spentSatoshis = 0n;

    if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
      if (claimableNow > 0n) {
        args.txBuilder.addOutput({
          to: args.recipient,
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: claimableNow,
          },
        });
        spentSatoshis += dust;
      } else if (unvested > 0n) {
        args.txBuilder.addOutput({ to: args.recipient, amount: dust });
        spentSatoshis += dust;
      }

      if (unvested > 0n) {
        args.txBuilder.addOutput({
          to: args.cancelReturnAddress,
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: unvested,
          },
        });
        spentSatoshis += dust;
      }
    } else {
      if (claimableNow > 0n) {
        if (claimableNow < 546n) {
          throw new Error('Claimable vested BCH is below dust; wait longer before cancelling');
        }
        args.txBuilder.addOutput({ to: args.recipient, amount: claimableNow });
        spentSatoshis += claimableNow;
      } else if (unvested > 0n) {
        args.txBuilder.addOutput({ to: args.recipient, amount: 546n });
        spentSatoshis += 546n;
      }

      if (unvested > 0n) {
        if (unvested < 546n) {
          throw new Error('Unvested BCH is below dust and cannot be cancelled');
        }
        args.txBuilder.addOutput({ to: args.cancelReturnAddress, amount: unvested });
        spentSatoshis += unvested;
      }
    }

    const senderChange = args.contractBalance - spentSatoshis - args.fee;
    if (senderChange < 0n) {
      throw new Error(
        'Insufficient BCH in contract to satisfy cancellation outputs and network fee. ' +
        'This stream likely needs explicit fee reserve funding.',
      );
    }
    if (senderChange > 546n) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: vestedAtCancel, unvestedAmount: unvested };
  }

  private resolveCommitment(onChainCommitment: unknown, fallback?: string): Uint8Array {
    if (onChainCommitment instanceof Uint8Array) return onChainCommitment;
    if (typeof onChainCommitment === 'string') return hexToBin(onChainCommitment);
    if (fallback) return hexToBin(fallback);
    throw new Error('Missing stream state commitment');
  }

  private p2pkhFromHash(hash: Uint8Array): string {
    const lockingBytecode = new Uint8Array(25);
    lockingBytecode[0] = 0x76; // OP_DUP
    lockingBytecode[1] = 0xa9; // OP_HASH160
    lockingBytecode[2] = 0x14; // Push 20
    lockingBytecode.set(hash, 3);
    lockingBytecode[23] = 0x88; // OP_EQUALVERIFY
    lockingBytecode[24] = 0xac; // OP_CHECKSIG

    const prefix = this.network === 'mainnet' ? 'bitcoincash' : 'bchtest';
    const encoded = lockingBytecodeToCashAddress({
      bytecode: lockingBytecode,
      prefix,
    });
    if (typeof encoded === 'string') {
      throw new Error(`Failed to derive sender P2PKH recovery address from hash ${binToHex(hash)}: ${encoded}`);
    }
    return encoded.address;
  }

  private readBigInt(value: unknown, label: string): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === 'string') return BigInt(value);
    throw new Error(`Invalid ${label} constructor param`);
  }

  private readBytes20(value: unknown, label: string): Uint8Array {
    const bytes = value instanceof Uint8Array ? value : undefined;
    if (!bytes || bytes.length !== 20) {
      throw new Error(`Invalid ${label} constructor param`);
    }
    return bytes;
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    if (source.length < offset + 8) return 0n;
    return new DataView(source.buffer, source.byteOffset + offset, 8).getBigUint64(0, true);
  }

  private readUint40LE(source: Uint8Array, offset: number): bigint {
    if (source.length < offset + 5) return 0n;
    const b0 = BigInt(source[offset]);
    const b1 = BigInt(source[offset + 1]) << 8n;
    const b2 = BigInt(source[offset + 2]) << 16n;
    const b3 = BigInt(source[offset + 3]) << 24n;
    const b4 = BigInt(source[offset + 4]) << 32n;
    return b0 | b1 | b2 | b3 | b4;
  }

  private clampToZero(value: bigint): bigint {
    return value < 0n ? 0n : value;
  }
}
