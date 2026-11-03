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
import { toTokenAwareAddress } from '../utils/tokenAddress.js';

export interface ClaimTransactionParams {
  streamId: string;
  contractAddress: string;
  recipient: string;
  totalAmount: number;
  totalReleased: number;
  startTime: number;
  endTime: number;
  currentTime: number;
  streamType: 'LINEAR' | 'STEP' | 'TRANCHE' | 'HYBRID';
  stepInterval?: number;
  stepAmount?: number;
  hybridUnlockTime?: number;
  hybridUpfrontAmount?: number;
  trancheSchedule?: Array<{
    unlockTime: number;
    cumulativeAmount: number;
  }>;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  feePayerAddress?: string;
  constructorParams: any[];
  currentCommitment: string;
}

export interface ClaimTransaction {
  claimableAmount: number;
  wcTransaction: WcTransactionObject;
}

// Set the claim nLockTime below median-time-past so the tx is immediately
// mineable with the non-final sequence CLTV requires.
const CLAIM_LOCKTIME_BUFFER = 7200;
// The compiled covenant redeem script is ~3KB, so the claim tx is ~3.1KB and
// its min relay fee is ~3092-3500 (measured on chipnet: tx rejected at 3092,
// accepted at 3500). 1900 was below min relay and would be rejected on mainnet.
const CLAIM_FEE = 4000n; // in [min relay ~3500, 5000 covenant cap]
const TOKEN_CLAIM_OUTPUT_SATOSHIS = 1000n;
const STATE_DUST_SATOSHIS = 546n;

export class StreamClaimReserveError extends Error {
  constructor(readonly claimableFrom: number) {
    super("This stream only has enough BCH left for the network fee on one more claim. Claim the rest in one go once it has all been released.");
  }
}

/**
 * Every claim pays its fee from the BCH the contract holds above the principal still
 * owed. A partial claim is refused once that reserve can't cover this claim and the
 * final one, so the last claim always goes through.
 */
export function isStreamClaimReserveLimited(reserveSatoshis: bigint, tokenType?: 'BCH' | 'FUNGIBLE_TOKEN'): boolean {
  const spendCost = CLAIM_FEE + (tokenType === 'FUNGIBLE_TOKEN' ? TOKEN_CLAIM_OUTPUT_SATOSHIS : 0n);
  return reserveSatoshis - spendCost < spendCost + STATE_DUST_SATOSHIS;
}

/** When the whole amount is claimable, shifted by pauses, matching the claim locktime. */
export function getStreamFullyReleasedAt(cursor: number, startTime: number, endTime: number): number {
  return (cursor || startTime) + (endTime - startTime) + CLAIM_LOCKTIME_BUFFER;
}

export class StreamClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  calculateClaimableAmount(params: ClaimTransactionParams): number {
    const {
      totalAmount,
      totalReleased,
      startTime,
      endTime,
      currentTime,
      streamType,
      stepInterval,
      stepAmount,
      hybridUnlockTime,
      hybridUpfrontAmount,
      trancheSchedule,
      currentCommitment,
    } = params;

    const effectiveStart = this.readUint40LEFromHex(currentCommitment, 10) || startTime;
    const elapsed = currentTime - effectiveStart;
    const duration = endTime - startTime;

    let vestedTotal = 0;

    if (streamType === 'LINEAR') {
      if (elapsed >= duration) {
        vestedTotal = totalAmount;
      } else if (elapsed > 0 && duration > 0) {
        vestedTotal = Number((BigInt(totalAmount) * BigInt(elapsed)) / BigInt(duration));
      }
    } else if (streamType === 'STEP') {
      if (!stepInterval || !stepAmount) {
        throw new Error('Step interval and amount required for STEP vesting');
      }
      const completedSteps = Math.floor(elapsed / stepInterval);
      vestedTotal = Math.min(completedSteps * stepAmount, totalAmount);
    } else if (streamType === 'HYBRID') {
      if (hybridUnlockTime === undefined || hybridUpfrontAmount === undefined) {
        throw new Error('Hybrid unlock time and upfront amount are required for HYBRID vesting');
      }
      const timeShift = effectiveStart - startTime;
      const effectiveNow = currentTime - timeShift;
      if (effectiveNow >= endTime) {
        vestedTotal = totalAmount;
      } else if (effectiveNow >= hybridUnlockTime) {
        const remainingAmount = Math.max(0, totalAmount - hybridUpfrontAmount);
        const linearDuration = endTime - hybridUnlockTime;
        if (linearDuration <= 0) {
          vestedTotal = totalAmount;
        } else {
          vestedTotal = Math.min(
            totalAmount,
            hybridUpfrontAmount + Math.floor((remainingAmount * (effectiveNow - hybridUnlockTime)) / linearDuration),
          );
        }
      }
    } else if (streamType === 'TRANCHE') {
      if (!trancheSchedule || trancheSchedule.length === 0) {
        throw new Error('Tranche schedule required for TRANCHE vesting');
      }

      const timeShift = effectiveStart - startTime;
      const effectiveNow = currentTime - timeShift;
      for (const tranche of trancheSchedule) {
        if (effectiveNow >= tranche.unlockTime) {
          vestedTotal = tranche.cumulativeAmount;
        }
      }
    }

    return Math.max(0, vestedTotal - totalReleased);
  }

  /**
   * When a reserve-limited stream can be claimed in one go, or null when a claim
   * can go through now (or the live state can't be read).
   */
  async getClaimDeferredUntil(params: {
    contractAddress: string;
    totalAmount: number;
    startTime: number;
    endTime: number;
    currentTime: number;
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  }): Promise<number | null> {
    const contractUtxos = await this.provider.getUtxos(params.contractAddress);
    const contractUtxo = contractUtxos.find(u => u.token?.nft != null);
    const commitmentHex = contractUtxo?.token?.nft?.commitment;
    if (!contractUtxo || typeof commitmentHex !== 'string' || commitmentHex.length < 80 || !commitmentHex.startsWith('00')) {
      return null;
    }
    const fullyReleasedAt = getStreamFullyReleasedAt(
      this.readUint40LEFromHex(commitmentHex, 10),
      params.startTime,
      params.endTime,
    );
    if (params.currentTime >= fullyReleasedAt) return null;
    const reserve = params.tokenType === 'FUNGIBLE_TOKEN'
      ? contractUtxo.satoshis
      : contractUtxo.satoshis - (BigInt(params.totalAmount) - this.readUint64LEFromHex(commitmentHex, 2));
    return isStreamClaimReserveLimited(reserve, params.tokenType) ? fullyReleasedAt : null;
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const {
      contractAddress,
      recipient,
      tokenType,
      tokenCategory,
      feePayerAddress,
      constructorParams,
      currentCommitment,
      currentTime,
    } = params;

    const artifact = ContractFactory.artifactForAddress(
      params.streamType === 'TRANCHE'
        ? 'TrancheVestingCovenant'
        : params.streamType === 'HYBRID'
          ? 'HybridVestingCovenant'
          : 'VestingCovenant',
      constructorParams,
      contractAddress,
    );
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for stream contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token) {
      throw new Error('Stream contract UTXO is missing the required mutable state NFT');
    }

    const commitment = this.resolveCommitment(contractUtxo.token.nft?.commitment as unknown, currentCommitment);
    if (commitment.length < 40) {
      throw new Error(`Invalid stream state commitment length: expected >=40, got ${commitment.length}`);
    }
    const status = commitment[0] ?? 0;
    if (status !== 0) {
      throw new Error(`Stream is not ACTIVE on-chain (status=${status})`);
    }
    const onChainUsesTokens = ((commitment[1] ?? 0) & 0x04) === 0x04;
    const requestedUsesTokens = tokenType === 'FUNGIBLE_TOKEN';
    if (onChainUsesTokens !== requestedUsesTokens) {
      throw new Error(
        `Token type mismatch: stream on-chain uses ${onChainUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}, `
        + `but claim request used ${requestedUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}`,
      );
    }
    const commitmentHex = binToHex(commitment);
    const totalReleasedFromCommitment = Number(this.readUint64LEFromHex(commitmentHex, 2));
    // Compute claimable with the SAME effective time as the claim nLockTime so the
    // covenant's locktime-based vested math equals the recipient output exactly.
    const effectiveClaimTime = currentTime - CLAIM_LOCKTIME_BUFFER;
    const claimableAmount = this.calculateClaimableAmount({
      ...params,
      currentTime: effectiveClaimTime,
      totalReleased: totalReleasedFromCommitment,
      currentCommitment: commitmentHex,
    });
    // A BCH payout below dust can't be an output, so it waits until more is released.
    if (claimableAmount <= 0 || (tokenType !== 'FUNGIBLE_TOKEN' && claimableAmount < 546)) {
      throw new Error('No funds available to claim at this time');
    }

    const newTotalReleased = BigInt(totalReleasedFromCommitment) + BigInt(claimableAmount);
    const newStatus = newTotalReleased >= BigInt(params.totalAmount) ? 3 : 0;
    const newCommitment = new Uint8Array(commitment);
    newCommitment[0] = newStatus;
    const dv = new DataView(newCommitment.buffer, newCommitment.byteOffset + 2, 8);
    dv.setBigUint64(0, newTotalReleased, true);

    const claimAmountBig = BigInt(claimableAmount);
    // The covenant funds the claim entirely from the contract: outputs.length <= 2
    // (recipient + state) and claimFee = contractInput - out0 - out1 in [0, 5000].
    // No external fee payer — its change would be a 3rd output, and topping up the
    // state output would drive claimFee negative. The stateful-contract reserve
    // funded into the covenant covers this fee plus the state dust.
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? TOKEN_CLAIM_OUTPUT_SATOSHIS : claimAmountBig;
    const stateOutputSatoshis = contractBalance - recipientOutputSatoshis - CLAIM_FEE;
    if (stateOutputSatoshis < 546n) {
      throw new Error(
        `Contract reserve too low to fund claim (balance ${contractBalance}, recipient ${recipientOutputSatoshis}, fee ${CLAIM_FEE})`,
      );
    }
    // The reserve covers a fixed claim budget, not one claim per step or tranche.
    // Refuse a partial claim that would strand the rest, so it stays claimable in
    // one go at the end.
    if (newStatus !== 3) {
      const reserve = tokenType === 'FUNGIBLE_TOKEN'
        ? contractBalance
        : contractBalance - (BigInt(params.totalAmount) - BigInt(totalReleasedFromCommitment));
      if (isStreamClaimReserveLimited(reserve, tokenType)) {
        throw new StreamClaimReserveError(
          getStreamFullyReleasedAt(this.readUint40LEFromHex(commitmentHex, 10), params.startTime, params.endTime),
        );
      }
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(effectiveClaimTime);

    // Non-final sequence on the covenant input so nLockTime is enforced; the
    // covenant's require(tx.time >= 500000000) compiles to CHECKLOCKTIMEVERIFY,
    // which rejects a final (0xffffffff) input.
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.claim(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
      { sequence: 0xfffffffe },
    );

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      const tokenAmount = contractUtxo.token.amount ?? 0n;
      const remainingTokens = tokenAmount - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in stream contract UTXO');
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
      userPrompt: tokenType === 'FUNGIBLE_TOKEN' ? 'Claim tokens from this stream' : 'Claim money from this stream',
    }));

    console.log('[StreamClaimService] Built claim transaction', {
      contractAddress,
      claimableAmount,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      claimFee: CLAIM_FEE.toString(),
      stateOutputSatoshis: stateOutputSatoshis.toString(),
      inputSatoshis: contractUtxo.satoshis.toString(),
    });

    return { claimableAmount, wcTransaction };
  }

  validateClaim(params: ClaimTransactionParams): { valid: boolean; error?: string } {
    const { currentTime, startTime, endTime, currentCommitment } = params;
    const totalReleasedFromCommitment = Number(this.readUint64LEFromHex(currentCommitment, 2));
    const effectiveStart = this.readUint40LEFromHex(currentCommitment, 10) || startTime;

    if (currentTime < effectiveStart) {
      return { valid: false, error: 'Vesting has not started yet' };
    }

    if (currentTime > endTime && totalReleasedFromCommitment >= params.totalAmount) {
      return { valid: false, error: 'All funds have been claimed' };
    }

    const claimable = this.calculateClaimableAmount({
      ...params,
      totalReleased: totalReleasedFromCommitment,
    });
    if (claimable <= 0) {
      return { valid: false, error: 'No funds available to claim at this time' };
    }

    return { valid: true };
  }

  private readUint40LEFromHex(commitmentHex: string, offset: number): number {
    try {
      const commitment = hexToBin(commitmentHex);
      if (commitment.length < offset + 5) return 0;
      return commitment[offset]
        + (commitment[offset + 1] << 8)
        + (commitment[offset + 2] << 16)
        + (commitment[offset + 3] << 24)
        + commitment[offset + 4] * 0x100000000;
    } catch {
      return 0;
    }
  }

  private readUint64LEFromHex(commitmentHex: string, offset: number): bigint {
    try {
      const commitment = hexToBin(commitmentHex);
      if (commitment.length < offset + 8) return 0n;
      return new DataView(
        commitment.buffer,
        commitment.byteOffset + offset,
        8,
      ).getBigUint64(0, true);
    } catch {
      return 0n;
    }
  }

  private resolveCommitment(onChainCommitment: unknown, fallbackCommitment: string): Uint8Array {
    if (onChainCommitment instanceof Uint8Array) {
      return onChainCommitment;
    }
    if (typeof onChainCommitment === 'string' && onChainCommitment.length > 0) {
      return hexToBin(onChainCommitment);
    }
    if (fallbackCommitment) {
      return hexToBin(fallbackCommitment);
    }
    return new Uint8Array();
  }
}
