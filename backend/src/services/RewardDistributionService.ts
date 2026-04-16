/**
 * Reward Distribution Service
 * Builds distribution transactions for RewardCovenant contracts.
 * Unlike AirdropClaimService (fixed amount per claim), this service
 * supports variable reward amounts per recipient up to maxRewardAmount.
 */

import {
  Contract,
  ElectrumNetworkProvider,
  SignatureTemplate,
  TransactionBuilder,
  type WcTransactionObject,
} from 'cashscript';
import { hexToBin, binToHex, hash160, secp256k1 } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { resolveFeePayer } from '../utils/feePayer.js';

export interface DistributionTransactionParams {
  rewardId: string;
  contractAddress: string;
  recipientAddress: string;
  signer?: string;
  rewardAmount: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  authorityPrivKey: string;
}

export interface DistributionTransaction {
  rewardAmount: number;
  wcTransaction: WcTransactionObject;
}

export class RewardDistributionService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildDistributionTransaction(params: DistributionTransactionParams): Promise<DistributionTransaction> {
    const {
      contractAddress,
      recipientAddress,
      signer,
      rewardAmount,
      tokenType,
      tokenCategory,
      constructorParams,
      currentCommitment,
      currentTime,
      authorityPrivKey,
    } = params;

    if (!authorityPrivKey) {
      throw new Error('authorityPrivKey is required for distribution transactions');
    }
    const authPrivKey = hexToBin(authorityPrivKey);
    const authPubKey = secp256k1.derivePublicKeyCompressed(authPrivKey);
    if (!authPubKey) {
      throw new Error('Invalid authority private key');
    }
    if (typeof authPubKey === 'string') {
      throw new Error(`Invalid authority private key: ${authPubKey}`);
    }
    const expectedAuthorityHash = this.readBytes20(constructorParams[1], 'authorityHash');
    const derivedAuthorityHash = hash160(authPubKey);
    if (typeof derivedAuthorityHash === 'string') {
      throw new Error(`Failed to derive authority hash: ${derivedAuthorityHash}`);
    }
    if (binToHex(derivedAuthorityHash) !== binToHex(expectedAuthorityHash)) {
      throw new Error(
        'Authority key mismatch: campaign constructor authorityHash does not match stored authority private key',
      );
    }

    if (rewardAmount <= 0) {
      throw new Error('Reward amount must be greater than 0');
    }

    const artifact = ContractFactory.getArtifact('RewardCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for reward contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token?.nft) {
      throw new Error('Reward contract UTXO is missing the required mutable state NFT');
    }

    const commitment = this.resolveCommitment(
      contractUtxo.token.nft.commitment as unknown,
      currentCommitment,
    );
    if (commitment.length !== 40) {
      throw new Error(`Invalid reward state commitment length: expected 40, got ${commitment.length}`);
    }
    const status = commitment[0] ?? 0;
    if (status !== 0) {
      throw new Error(`Campaign is not ACTIVE on-chain (status=${status})`);
    }
    const onChainUsesTokens = ((commitment[1] ?? 0) & 0x04) === 0x04;
    const requestedUsesTokens = tokenType === 'FUNGIBLE_TOKEN';
    if (onChainUsesTokens !== requestedUsesTokens) {
      throw new Error(
        `Token type mismatch: campaign on-chain uses ${onChainUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}, `
        + `but distribution request used ${requestedUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}`,
      );
    }
    if (currentCommitment) {
      const cached = hexToBin(currentCommitment);
      const onChainHex = binToHex(commitment);
      if (cached.length !== commitment.length || binToHex(cached) !== onChainHex) {
        console.warn('[RewardDistributionService] DB commitment differed from on-chain commitment; using on-chain value', {
          contractAddress,
          cachedLength: cached.length,
          onChainLength: commitment.length,
        });
      }
    }

    const rewardAmountBig = BigInt(rewardAmount);
    // Constructor param indices (RewardCovenant):
    // [0]=vaultId [1]=authorityHash [2]=maxRewardAmount [3]=totalPool [4]=startTimestamp [5]=endTimestamp
    const maxRewardAmount = this.toBigIntParam(constructorParams[2], 'maxRewardAmount');
    if (rewardAmountBig > maxRewardAmount) {
      throw new Error(
        `Reward amount exceeds max reward amount `
        + `(requested=${rewardAmountBig.toString()}, max=${maxRewardAmount.toString()})`,
      );
    }

    const locktime = this.resolveDistributionLocktime(constructorParams, BigInt(currentTime));

    const newCommitment = new Uint8Array(commitment);
    const totalDistributedOnChain = this.readUint64LE(commitment, 3);
    const newTotalDistributed = totalDistributedOnChain + rewardAmountBig;
    const totalPool = this.toBigIntParam(constructorParams[3], 'totalPool');
    if (newTotalDistributed > totalPool) {
      throw new Error('Distribution exceeds remaining campaign pool');
    }
    const nextStatus = totalPool > 0n && newTotalDistributed >= totalPool ? 3 : 0;
    newCommitment[0] = nextStatus;

    new DataView(newCommitment.buffer, newCommitment.byteOffset + 3, 8)
      .setBigUint64(0, newTotalDistributed, true);

    const currentCount = new DataView(newCommitment.buffer, newCommitment.byteOffset + 11, 8)
      .getBigUint64(0, true);
    new DataView(newCommitment.buffer, newCommitment.byteOffset + 11, 8)
      .setBigUint64(0, currentCount + 1n, true);
    this.setUint40LE(newCommitment, 19, Number(locktime));
    newCommitment.fill(0, 24, 40);

    const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
    const decoded = cashAddressToLockingBytecode(recipientAddress);
    if (typeof decoded === 'string') throw new Error(`Invalid recipient address: ${decoded}`);
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Reward distributions require P2PKH recipient addresses: ${recipientAddress}`);
    }
    const recipientHash = b.slice(3, 23);

    const fee = 1500n;
    const feePayerAddress = signer || recipientAddress;
    const feePayer = await resolveFeePayer(this.provider, this.network, feePayerAddress, fee);
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : rewardAmountBig;
    const remainingAmount = contractBalance - recipientOutputSatoshis;
    const minimumStateOutput = 546n;

    if (remainingAmount < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve campaign state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(Number(locktime));
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.distribute(
        recipientHash,
        rewardAmountBig,
        new SignatureTemplate(authPrivKey),
        authPubKey,
      ),
      { sequence: 0xffffffff },
    );
    for (const utxo of feePayer.utxos) {
      txBuilder.addInput(utxo, feePayer.unlocker, { sequence: 0xffffffff });
    }

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      txBuilder.addOutput({
        to: recipientAddress,
        amount: 1000n,
        token: { category: tokenCategory, amount: rewardAmountBig },
      });

      const remainingTokens = (contractUtxo.token.amount ?? 0n) - rewardAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in campaign UTXO for distribution');
      }
      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingAmount,
        token: {
          category: tokenCategory,
          amount: remainingTokens,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    } else {
      txBuilder.addOutput({ to: recipientAddress, amount: rewardAmountBig });

      txBuilder.addOutput({
        to: contract.tokenAddress,
        amount: remainingAmount,
        token: {
          category: contractUtxo.token.category,
          amount: 0n,
          nft: { capability: 'mutable', commitment: binToHex(newCommitment) },
        },
      });
    }
    const feeChange = feePayer.total - fee;
    if (feeChange > 546n) {
      txBuilder.addOutput({
        to: feePayer.address,
        amount: feeChange,
      });
    }

    const wcTransaction = txBuilder.generateWcTransactionObject({
      broadcast: true,
      userPrompt: 'Distribute reward',
    });

    console.log('[RewardDistributionService] Built distribution transaction', {
      contractAddress,
      rewardAmount,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      signer: feePayer.address,
      feeSponsored: feePayer.sponsored,
      inputSatoshis: contractUtxo.satoshis.toString(),
      locktime: locktime.toString(),
    });

    return { rewardAmount, wcTransaction };
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
    return new Uint8Array(40);
  }

  private resolveDistributionLocktime(constructorParams: any[], now: bigint): bigint {
    const startTimestamp = this.toBigIntParam(constructorParams?.[4] ?? 0, 'startTimestamp');
    const endTimestamp = this.toBigIntParam(constructorParams?.[5] ?? 0, 'endTimestamp');

    if (startTimestamp > 0n && endTimestamp > 0n && startTimestamp > endTimestamp) {
      throw new Error('Campaign has invalid distribution schedule');
    }
    if (startTimestamp > 0n && now < startTimestamp) {
      throw new Error('Campaign distribution window has not started yet');
    }
    if (endTimestamp > 0n && now > endTimestamp) {
      throw new Error('Campaign distribution window has ended');
    }

    let locktime = now > 30n ? now - 30n : now;
    if (startTimestamp > 0n && locktime < startTimestamp) {
      locktime = startTimestamp;
    }
    if (endTimestamp > 0n && locktime > endTimestamp) {
      locktime = endTimestamp;
    }
    return locktime;
  }

  private readUint64LE(source: Uint8Array, offset: number): bigint {
    const view = new DataView(source.buffer, source.byteOffset + offset, 8);
    return view.getBigUint64(0, true);
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
    if (value instanceof Uint8Array) {
      if (value.length !== 20) throw new Error(`${name} must be 20 bytes`);
      return value;
    }
    if (typeof value === 'string') {
      const parsed = hexToBin(value);
      if (parsed.length !== 20) throw new Error(`${name} must be 20 bytes`);
      return parsed;
    }
    throw new Error(`Invalid constructor parameter for ${name}`);
  }
}
