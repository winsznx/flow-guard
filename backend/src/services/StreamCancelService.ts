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
import { resolveFeePayer } from '../utils/feePayer.js';
import { TOKEN_CANCEL_TOO_EARLY, finalizeWcTransactionSequences } from './txFinality.js';
import { toTokenAwareAddress } from '../utils/tokenAddress.js';

export interface StreamCancelParams {
  streamType: 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID';
  contractAddress: string;
  sender: string;
  recipient: string;
  currentTime: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  feePayerAddress?: string;
  constructorParams: any[];
  currentCommitment?: string;
}

export interface StreamCancelTransaction {
  vestedAmount: number;
  unvestedAmount: number;
  cancelReturnAddress: string;
  wcTransaction: WcTransactionObject;
}

const CANCEL_EXTERNAL_CUSHION = 10_000n;

export class StreamCancelService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildCancelTransaction(params: StreamCancelParams): Promise<StreamCancelTransaction> {
    const covenantType = ContractFactory.typeForAddress(
      params.streamType === 'RECURRING'
        ? 'RecurringPaymentCovenant'
        : params.streamType === 'TRANCHE'
          ? 'TrancheVestingCovenant'
        : params.streamType === 'HYBRID'
          ? 'HybridVestingCovenant'
          : 'VestingCovenant',
      params.constructorParams,
      params.contractAddress,
    );
    const artifact = ContractFactory.getArtifact(covenantType);
    // V2 vesting cancels allow a third output for the sender's leftover reserve.
    const maxOutputs = ContractFactory.isV2(covenantType) || params.streamType === 'TRANCHE' ? 3 : 2;

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
    // cancel() enforces tx.time/tx.locktime >= 500000000 (CHECKLOCKTIMEVERIFY).
    // nLockTime ~2h back so it is <= median-time-past (immediately mineable); the
    // input is non-final so the network enforces it. The vested/unvested split is
    // computed by the covenant from tx.locktime, so the output helpers below MUST
    // use this same buffered value (not params.currentTime) or the amounts mismatch.
    const cancelLocktime = Math.max(0, params.currentTime - 7200);
    txBuilder.setLocktime(cancelLocktime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.cancel(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
      { sequence: 0xfffffffe },
    );

    const contractBalance = contractUtxo.satoshis;
    const fee = 4000n; // ~3KB cancel tx; in [min relay ~3500, 5000]
    // Vesting/Hybrid/Recurring cancel cap outputs at <= 2 (vested + unvested). An
    // external fee payer's change output would add a 3rd output and exceed the cap,
    // so the fee is always self-funded from the contract's reserve.
    const feePayer = null as Awaited<ReturnType<typeof resolveFeePayer>> | null;
    const feeFromContract = feePayer ? 0n : fee;

    if (feePayer) {
      for (const utxo of feePayer.utxos) {
        txBuilder.addInput(utxo, feePayer.unlocker);
      }
    }

    if (params.streamType === 'RECURRING') {
      const result = this.addRecurringCancelOutputs({
        txBuilder,
        commitment,
        contractBalance,
        fee: feeFromContract,
        sender: params.sender,
        cancelReturnAddress,
        tokenType: params.tokenType,
        tokenCategory: params.tokenCategory,
        totalAmount: this.readBigInt(params.constructorParams[5], 'totalAmount'),
      });

      if (feePayer) {
        const externalRequired = fee + result.contractShortfall;
        if (feePayer.total < externalRequired) {
          throw new Error(
            `Insufficient sponsor balance for cancel transaction (need ${externalRequired} sats, ` +
            `available ${feePayer.total} sats)`,
          );
        }
        const feeChange = feePayer.total - externalRequired;
        if (feeChange > 546n) {
          txBuilder.addOutput({ to: feePayer.address, amount: feeChange });
        }
      } else if (result.contractShortfall > 0n) {
        throw new Error(
          'Insufficient BCH in contract to satisfy cancellation outputs and network fee. ' +
          'This stream likely needs explicit fee reserve funding.',
        );
      }

      const wcTransaction = finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: "Cancel this stream. What's not released yet comes back to you.",
      }));

      console.log('[StreamCancelService] Built recurring cancel transaction', {
        contractAddress: params.contractAddress,
        cancelReturnAddress,
        vestedAmount: result.vestedAmount.toString(),
        unvestedAmount: result.unvestedAmount.toString(),
        contractShortfallSatoshis: result.contractShortfall.toString(),
        tokenType: params.tokenType || 'BCH',
        tokenCategory: params.tokenCategory || null,
        feeSponsored: Boolean(feePayer?.sponsored),
        feePayerAddress: feePayer?.address || null,
      });

      return {
        vestedAmount: Number(result.vestedAmount),
        unvestedAmount: Number(result.unvestedAmount),
        cancelReturnAddress,
        wcTransaction,
      };
    }

    const result = params.streamType === 'TRANCHE'
      ? this.addTrancheCancelOutputs({
          txBuilder,
          commitment,
          contractBalance,
          fee: feeFromContract,
          sender: params.sender,
          recipient: params.recipient,
          cancelReturnAddress,
          tokenType: params.tokenType,
          tokenCategory: params.tokenCategory,
          totalAmount: this.readBigInt(params.constructorParams[2], 'totalAmount'),
          startTimestamp: this.readBigInt(params.constructorParams[3], 'startTimestamp'),
          scheduleCount: Number(this.readBigInt(params.constructorParams[4], 'scheduleCount')),
          tranches: Array.from({ length: 8 }, (_, index) => ({
            unlockTime: this.readBigInt(params.constructorParams[5 + index * 2], `tranche${index + 1}Timestamp`),
            cumulative: this.readBigInt(params.constructorParams[6 + index * 2], `tranche${index + 1}Cumulative`),
          })),
          locktime: cancelLocktime,
        })
      : params.streamType === 'HYBRID'
      ? this.addHybridCancelOutputs({
          txBuilder,
          commitment,
          contractBalance,
          fee: feeFromContract,
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
          locktime: cancelLocktime,
          maxOutputs,
        })
      : this.addVestingCancelOutputs({
          txBuilder,
          commitment,
          contractBalance,
          fee: feeFromContract,
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
          locktime: cancelLocktime,
          maxOutputs,
        });

    if (feePayer) {
      const externalRequired = fee + result.contractShortfall;
      if (feePayer.total < externalRequired) {
        throw new Error(
          `Insufficient sponsor balance for cancel transaction (need ${externalRequired} sats, ` +
          `available ${feePayer.total} sats)`,
        );
      }
      const feeChange = feePayer.total - externalRequired;
      if (feeChange > 546n) {
        txBuilder.addOutput({ to: feePayer.address, amount: feeChange });
      }
    } else if (result.contractShortfall > 0n) {
      throw new Error(
        'Insufficient BCH in contract to satisfy cancellation outputs and network fee. ' +
        'This stream likely needs explicit fee reserve funding.',
      );
    }

    const wcTransaction = finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: "Cancel this stream. What's not released yet comes back to you.",
    }));

    console.log('[StreamCancelService] Built vesting cancel transaction', {
      contractAddress: params.contractAddress,
      cancelReturnAddress,
      vestedAmount: result.vestedAmount.toString(),
      unvestedAmount: result.unvestedAmount.toString(),
      contractShortfallSatoshis: result.contractShortfall.toString(),
      tokenType: params.tokenType || 'BCH',
      tokenCategory: params.tokenCategory || null,
      feeSponsored: Boolean(feePayer?.sponsored),
      feePayerAddress: feePayer?.address || null,
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
  }): { vestedAmount: bigint; unvestedAmount: bigint; contractShortfall: bigint } {
    const totalPaid = this.readUint64LE(args.commitment, 2);
    const remainingPool = args.totalAmount > 0n
      ? this.clampToZero(args.totalAmount - totalPaid)
      : 0n;
    const dust = 1000n;

    let spentSatoshis = 0n;
    if (remainingPool > 0n) {
      if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
        args.txBuilder.addOutput({
          to: toTokenAwareAddress(args.cancelReturnAddress),
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

    const requiredFromContract = spentSatoshis + args.fee;
    const contractShortfall = requiredFromContract > args.contractBalance
      ? requiredFromContract - args.contractBalance
      : 0n;
    const senderChange = args.contractBalance > requiredFromContract
      ? args.contractBalance - requiredFromContract
      : 0n;
    if (senderChange > 546n) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: totalPaid, unvestedAmount: remainingPool, contractShortfall };
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
    maxOutputs: number;
  }): { vestedAmount: bigint; unvestedAmount: bigint; contractShortfall: bigint } {
    const totalReleased = this.readUint64LE(args.commitment, 2);
    const cursor = this.readUint40LE(args.commitment, 10);
    const duration = Number(args.endTimestamp - args.startTimestamp);
    // Not clamped at 0: VestingCovenant.cancel() uses the signed difference, so before the
    // start it counts a negative vested amount and expects more than the total back.
    const vestedAt = (locktime: number): bigint => {
      const elapsed = locktime - Number(cursor);
      if (args.scheduleType === 1) {
        if (duration <= 0 || elapsed >= duration) return args.totalAmount;
        return (args.totalAmount * BigInt(elapsed)) / BigInt(duration);
      }
      if (args.scheduleType === 2) {
        const interval = Number(args.stepInterval);
        if (interval <= 0) {
          throw new Error('Invalid step interval in stream constructor parameters');
        }
        const vested = BigInt(Math.trunc(elapsed / interval)) * args.stepAmount;
        return vested > args.totalAmount ? args.totalAmount : vested;
      }
      throw new Error(`Unsupported vesting schedule type: ${args.scheduleType}`);
    };

    const locktime = this.settleSubDustClaim(args, vestedAt, totalReleased, Number(cursor));
    const vestedAtCancel = vestedAt(locktime);

    return this.writeCancelOutputs(args, vestedAtCancel, totalReleased, args.maxOutputs);
  }

  /**
   * Right after a claim, the recipient's share at the cancel locktime can be a few sats
   * the network won't relay, and the covenant wants exactly that amount on their output.
   * For BCH, move the locktime back to the last second where nothing new had been
   * released, so the cancel pays the recipient nothing instead of an unsendable amount.
   * Returns the locktime the outputs must be computed at.
   */
  private settleSubDustClaim(
    args: { txBuilder: TransactionBuilder; tokenType?: 'BCH' | 'FUNGIBLE_TOKEN'; locktime: number },
    vestedAt: (locktime: number) => bigint,
    totalReleased: bigint,
    earliest: number,
  ): number {
    const claimable = vestedAt(args.locktime) - totalReleased;
    if (args.tokenType === 'FUNGIBLE_TOKEN' || claimable <= 0n || claimable >= 546n) return args.locktime;

    let low = Math.max(500000000, earliest);
    if (vestedAt(low) > totalReleased) return args.locktime;
    let high = args.locktime;
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (vestedAt(mid) > totalReleased) high = mid;
      else low = mid;
    }
    if (vestedAt(low) !== totalReleased) return args.locktime;
    args.txBuilder.setLocktime(low);
    return low;
  }

  /**
   * TrancheVestingCovenant.cancel(): the vested amount is the cumulative amount of the
   * last tranche reached at the cancel locktime, shifted by pauses.
   */
  private addTrancheCancelOutputs(args: {
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
    scheduleCount: number;
    tranches: Array<{ unlockTime: bigint; cumulative: bigint }>;
    locktime: number;
  }): { vestedAmount: bigint; unvestedAmount: bigint; contractShortfall: bigint } {
    const totalReleased = this.readUint64LE(args.commitment, 2);
    const cursor = this.readUint40LE(args.commitment, 10);
    const effectiveNow = BigInt(args.locktime) - (cursor - args.startTimestamp);
    let vestedAtCancel = 0n;
    args.tranches.slice(0, args.scheduleCount).forEach((tranche) => {
      if (effectiveNow >= tranche.unlockTime) vestedAtCancel = tranche.cumulative;
    });
    return this.writeCancelOutputs(args, vestedAtCancel, totalReleased, 3);
  }

  /**
   * Writes the recipient and sender outputs the vesting covenants check on cancel, and
   * returns leftover fee reserve to the sender when the covenant's output cap allows it.
   */
  private writeCancelOutputs(
    args: {
      txBuilder: TransactionBuilder;
      contractBalance: bigint;
      fee: bigint;
      sender: string;
      recipient: string;
      cancelReturnAddress: string;
      tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
      tokenCategory?: string;
      totalAmount: bigint;
    },
    vestedAtCancel: bigint,
    totalReleased: bigint,
    maxOutputs: number,
  ): { vestedAmount: bigint; unvestedAmount: bigint; contractShortfall: bigint } {
    const claimableNow = this.clampToZero(vestedAtCancel - totalReleased);
    const unvested = this.clampToZero(args.totalAmount - vestedAtCancel);
    const dust = 1000n;
    let spentSatoshis = 0n;
    // VestingCovenant.cancel() checks output[0] as the recipient's claimable part when
    // there is one, else as the sender's unvested part; output[1] is checked as the
    // sender's unvested part only when both are non-zero. So the leftover fee reserve can
    // go back to the sender unless both checked outputs are used and the output cap of 2
    // is reached.
    const checkedOutputs = (claimableNow > 0n ? 1 : 0) + (unvested > 0n ? 1 : 0);
    const roomForChange = checkedOutputs < maxOutputs;
    if (unvested > args.totalAmount && args.tokenType === 'FUNGIBLE_TOKEN') {
      throw new Error(TOKEN_CANCEL_TOO_EARLY);
    }

    if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
      if (claimableNow > 0n) {
        args.txBuilder.addOutput({
          to: toTokenAwareAddress(args.recipient),
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: claimableNow,
          },
        });
        spentSatoshis += dust;
      }

      if (unvested > 0n) {
        // The covenant pins only the token amount on the sender's output, so the
        // leftover fee reserve rides on it instead of needing a change output.
        const leftoverReserve = args.contractBalance - spentSatoshis - dust - args.fee;
        const senderAmount = leftoverReserve > 0n ? dust + leftoverReserve : dust;
        args.txBuilder.addOutput({
          to: toTokenAwareAddress(args.cancelReturnAddress),
          amount: senderAmount,
          token: {
            category: args.tokenCategory,
            amount: unvested,
          },
        });
        spentSatoshis += senderAmount;
      }
    } else {
      if (claimableNow > 0n) {
        if (claimableNow < 546n) {
          throw new Error('Claimable vested BCH is below dust; wait longer before cancelling');
        }
        args.txBuilder.addOutput({ to: args.recipient, amount: claimableNow });
        spentSatoshis += claimableNow;
      }

      if (unvested > 0n) {
        if (unvested < 546n) {
          throw new Error('Unvested BCH is below dust and cannot be cancelled');
        }
        args.txBuilder.addOutput({ to: args.cancelReturnAddress, amount: unvested });
        spentSatoshis += unvested;
      }
    }

    const requiredFromContract = spentSatoshis + args.fee;
    const contractShortfall = requiredFromContract > args.contractBalance
      ? requiredFromContract - args.contractBalance
      : 0n;
    const senderChange = args.contractBalance > requiredFromContract
      ? args.contractBalance - requiredFromContract
      : 0n;
    if (unvested > args.totalAmount && contractShortfall > 0n) {
      // Before the start the covenant asks for more than the total back, and that extra
      // must come out of the contract's own reserve, never from a fee sponsor.
      throw new Error('This stream can be cancelled once its start date has passed.');
    }
    const changeRidesOnTokens = args.tokenType === 'FUNGIBLE_TOKEN' && Boolean(args.tokenCategory) && unvested > 0n;
    if (senderChange > 546n && roomForChange && !changeRidesOnTokens) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: this.clampToZero(vestedAtCancel), unvestedAmount: unvested, contractShortfall };
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
    maxOutputs: number;
  }): { vestedAmount: bigint; unvestedAmount: bigint; contractShortfall: bigint } {
    const totalReleased = this.readUint64LE(args.commitment, 2);
    const cursor = this.readUint40LE(args.commitment, 10);
    const timeShift = cursor - args.startTimestamp;
    const vestedAt = (locktime: number): bigint => {
      const effectiveNow = BigInt(locktime) - timeShift;
      if (effectiveNow >= args.endTimestamp) return args.totalAmount;
      if (effectiveNow < args.unlockTimestamp) return 0n;
      const remainingAmount = args.totalAmount - args.upfrontAmount;
      const linearDuration = args.endTimestamp - args.unlockTimestamp;
      if (linearDuration <= 0n) return args.totalAmount;
      const vested = args.upfrontAmount + ((remainingAmount * (effectiveNow - args.unlockTimestamp)) / linearDuration);
      return vested > args.totalAmount ? args.totalAmount : vested;
    };

    const vestedAtCancel = vestedAt(this.settleSubDustClaim(args, vestedAt, totalReleased, Number(cursor)));

    const claimableNow = this.clampToZero(vestedAtCancel - totalReleased);
    const unvested = this.clampToZero(args.totalAmount - vestedAtCancel);
    const dust = 1000n;
    let spentSatoshis = 0n;

    if (args.tokenType === 'FUNGIBLE_TOKEN' && args.tokenCategory) {
      if (claimableNow > 0n) {
        args.txBuilder.addOutput({
          to: toTokenAwareAddress(args.recipient),
          amount: dust,
          token: {
            category: args.tokenCategory,
            amount: claimableNow,
          },
        });
        spentSatoshis += dust;
      } else if (unvested > 0n) {
        // Output[0] is unchecked when nothing is claimable; keep the placeholder with the sender.
        args.txBuilder.addOutput({ to: args.sender, amount: dust });
        spentSatoshis += dust;
      }

      if (unvested > 0n) {
        // Both outputs are taken, so leftover fee reserve rides on the sender's
        // token output (the covenant pins only its token amount) instead of a 3rd output.
        const leftoverReserve = args.contractBalance - spentSatoshis - dust - args.fee;
        const senderAmount = leftoverReserve > 0n ? dust + leftoverReserve : dust;
        args.txBuilder.addOutput({
          to: toTokenAwareAddress(args.cancelReturnAddress),
          amount: senderAmount,
          token: {
            category: args.tokenCategory,
            amount: unvested,
          },
        });
        spentSatoshis += senderAmount;
      }
    } else {
      if (claimableNow > 0n) {
        if (claimableNow < 546n) {
          throw new Error('Claimable vested BCH is below dust; wait longer before cancelling');
        }
        args.txBuilder.addOutput({ to: args.recipient, amount: claimableNow });
        spentSatoshis += claimableNow;
      } else if (unvested > 0n) {
        // HybridVestingCovenant.cancel() checks the unvested part at output[1] and leaves
        // output[0] unchecked when nothing is claimable, so output[0] returns the leftover
        // fee reserve to the sender instead of sending dust to the recipient.
        const leftoverReserve = args.contractBalance - unvested - args.fee;
        const placeholder = leftoverReserve > 546n ? leftoverReserve : 546n;
        args.txBuilder.addOutput({ to: args.sender, amount: placeholder });
        spentSatoshis += placeholder;
      }

      if (unvested > 0n) {
        if (unvested < 546n) {
          throw new Error('Unvested BCH is below dust and cannot be cancelled');
        }
        args.txBuilder.addOutput({ to: args.cancelReturnAddress, amount: unvested });
        spentSatoshis += unvested;
      }
    }

    const requiredFromContract = spentSatoshis + args.fee;
    const contractShortfall = requiredFromContract > args.contractBalance
      ? requiredFromContract - args.contractBalance
      : 0n;
    const senderChange = args.contractBalance > requiredFromContract
      ? args.contractBalance - requiredFromContract
      : 0n;
    // With unvested > 0 both checked outputs are used (output[1] is checked, output[0] is
    // either checked or already carries the change), so change needs a third output,
    // which only a V2 cancel allows.
    if (senderChange > 546n && (unvested === 0n || (args.maxOutputs > 2 && claimableNow > 0n))) {
      args.txBuilder.addOutput({ to: args.sender, amount: senderChange });
    }

    return { vestedAmount: vestedAtCancel, unvestedAmount: unvested, contractShortfall };
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
