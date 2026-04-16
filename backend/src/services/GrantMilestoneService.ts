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

export interface MilestoneReleaseParams {
  grantId: string;
  contractAddress: string;
  recipientAddress: string;
  signer?: string;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  authorityPrivKey: string;
}

export interface MilestoneReleaseTransaction {
  releaseAmount: number;
  milestoneNumber: number;
  wcTransaction: WcTransactionObject;
}

export class GrantMilestoneService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildReleaseTransaction(params: MilestoneReleaseParams): Promise<MilestoneReleaseTransaction> {
    const {
      contractAddress,
      recipientAddress,
      signer,
      tokenType,
      tokenCategory,
      constructorParams,
      currentCommitment,
      currentTime,
      authorityPrivKey,
    } = params;

    if (!authorityPrivKey) {
      throw new Error('authorityPrivKey is required for milestone release transactions');
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
        'Authority key mismatch: grant constructor authorityHash does not match stored authority private key',
      );
    }

    const artifact = ContractFactory.getArtifact('GrantCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for grant contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token?.nft) {
      throw new Error('Grant contract UTXO is missing the required mutable state NFT');
    }

    const commitment = this.resolveCommitment(
      contractUtxo.token.nft.commitment as unknown,
      currentCommitment,
    );
    if (commitment.length !== 40) {
      throw new Error(`Invalid grant state commitment length: expected 40, got ${commitment.length}`);
    }
    const status = commitment[0] ?? 0;
    if (status !== 0) {
      throw new Error(`Grant is not ACTIVE on-chain (status=${status})`);
    }
    const onChainUsesTokens = ((commitment[1] ?? 0) & 0x04) === 0x04;
    const requestedUsesTokens = tokenType === 'FUNGIBLE_TOKEN';
    if (onChainUsesTokens !== requestedUsesTokens) {
      throw new Error(
        `Token type mismatch: grant on-chain uses ${onChainUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}, `
        + `but release request used ${requestedUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}`,
      );
    }

    // Constructor param indices (GrantCovenant):
    // [0]=vaultId [1]=authorityHash [2]=milestonesTotal [3]=amountPerMilestone [4]=totalAmount
    const milestonesTotal = this.toBigIntParam(constructorParams[2], 'milestonesTotal');
    const amountPerMilestone = this.toBigIntParam(constructorParams[3], 'amountPerMilestone');

    const milestonesCompleted = BigInt(commitment[2] ?? 0);
    if (milestonesCompleted >= milestonesTotal) {
      throw new Error(
        `All milestones already completed `
        + `(completed=${milestonesCompleted.toString()}, total=${milestonesTotal.toString()})`,
      );
    }

    const totalReleased = this.readUint64LE(commitment, 3);
    const recipientHash = commitment.slice(16, 36);

    const newMilestonesCompleted = milestonesCompleted + 1n;
    const newTotalReleased = totalReleased + amountPerMilestone;
    const newStatus = newMilestonesCompleted >= milestonesTotal ? 3 : 0;

    const newCommitment = new Uint8Array(40);
    newCommitment[0] = newStatus;
    newCommitment[1] = commitment[1]; // preserve flags
    newCommitment[2] = Number(newMilestonesCompleted);
    new DataView(newCommitment.buffer, newCommitment.byteOffset + 3, 8)
      .setBigUint64(0, newTotalReleased, true);
    this.setUint40LE(newCommitment, 11, currentTime);
    newCommitment.set(recipientHash, 16);
    newCommitment.fill(0, 36);

    const fee = 1500n;
    const feePayerAddress = signer || recipientAddress;
    const feePayer = await resolveFeePayer(this.provider, this.network, feePayerAddress, fee);
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : amountPerMilestone;
    const remainingAmount = contractBalance - recipientOutputSatoshis;
    const minimumStateOutput = 546n;

    if (remainingAmount < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve grant state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(0);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.releaseMilestone(
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
        token: { category: tokenCategory, amount: amountPerMilestone },
      });

      const remainingTokens = (contractUtxo.token.amount ?? 0n) - amountPerMilestone;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in grant UTXO for milestone release');
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
      txBuilder.addOutput({ to: recipientAddress, amount: amountPerMilestone });

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
      userPrompt: 'Release grant milestone payment',
    });

    console.log('[GrantMilestoneService] Built release transaction', {
      contractAddress,
      releaseAmount: Number(amountPerMilestone),
      milestoneNumber: Number(newMilestonesCompleted),
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      signer: feePayer.address,
      feeSponsored: feePayer.sponsored,
      inputSatoshis: contractUtxo.satoshis.toString(),
    });

    return {
      releaseAmount: Number(amountPerMilestone),
      milestoneNumber: Number(newMilestonesCompleted),
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
    return new Uint8Array(40);
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
