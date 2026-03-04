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

export interface ClaimTransactionParams {
  airdropId: string;
  contractAddress: string;
  claimer: string;
  signer?: string;
  claimAmount: number;
  totalClaimed?: number;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  claimAuthorityPrivKey: string; // hex-encoded 32-byte private key for server-side authority co-signing
}

export interface ClaimTransaction {
  claimAmount: number;
  wcTransaction: WcTransactionObject;
}

export class AirdropClaimService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildClaimTransaction(params: ClaimTransactionParams): Promise<ClaimTransaction> {
    const {
      contractAddress,
      claimer,
      signer,
      claimAmount,
      tokenType,
      tokenCategory,
      constructorParams,
      currentCommitment,
      currentTime,
      claimAuthorityPrivKey,
    } = params;

    if (!claimAuthorityPrivKey) {
      throw new Error('claimAuthorityPrivKey is required for claim transactions');
    }
    const authPrivKey = hexToBin(claimAuthorityPrivKey);
    const authPubKey = secp256k1.derivePublicKeyCompressed(authPrivKey);
    if (!authPubKey) {
      throw new Error('Invalid claim authority private key');
    }
    if (typeof authPubKey === 'string') {
      throw new Error(`Invalid claim authority private key: ${authPubKey}`);
    }
    const expectedClaimAuthorityHash = this.readBytes20(constructorParams[2], 'claimAuthorityHash');
    const derivedClaimAuthorityHash = hash160(authPubKey);
    if (typeof derivedClaimAuthorityHash === 'string') {
      throw new Error(`Failed to derive claim authority hash: ${derivedClaimAuthorityHash}`);
    }
    if (binToHex(derivedClaimAuthorityHash) !== binToHex(expectedClaimAuthorityHash)) {
      throw new Error(
        'Claim authority key mismatch: campaign constructor claimAuthorityHash does not match stored claim authority private key',
      );
    }

    if (claimAmount <= 0) {
      throw new Error('Claim amount must be greater than 0');
    }

    const artifact = ContractFactory.getArtifact('AirdropCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for airdrop contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find(u => u.token?.nft != null) ?? contractUtxos[0];
    const contractBalance = contractUtxo.satoshis;
    if (!contractUtxo.token?.nft) {
      throw new Error('Airdrop contract UTXO is missing the required mutable state NFT');
    }

    // Always derive next state from on-chain NFT commitment, not DB cache.
    const commitment = this.resolveCommitment(
      contractUtxo.token.nft.commitment as unknown,
      currentCommitment,
    );
    if (commitment.length !== 40) {
      throw new Error(`Invalid airdrop state commitment length: expected 40, got ${commitment.length}`);
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
        + `but claim request used ${requestedUsesTokens ? 'FUNGIBLE_TOKEN' : 'BCH'}`,
      );
    }
    if (currentCommitment) {
      const cached = hexToBin(currentCommitment);
      const onChainHex = binToHex(commitment);
      if (cached.length !== commitment.length || binToHex(cached) !== onChainHex) {
        console.warn('[AirdropClaimService] DB commitment differed from on-chain commitment; using on-chain value', {
          contractAddress,
          cachedLength: cached.length,
          onChainLength: commitment.length,
        });
      }
    }
    const claimAmountBig = BigInt(claimAmount);
    // Constructor param indices (AirdropCovenant v2):
    // [0]=vaultId [1]=authorityHash [2]=claimAuthorityHash [3]=amountPerClaim [4]=totalPool [5]=startTimestamp [6]=endTimestamp
    const expectedAmountPerClaim = this.toBigIntParam(constructorParams[3], 'amountPerClaim');
    if (claimAmountBig !== expectedAmountPerClaim) {
      throw new Error(
        `Claim amount mismatch with covenant constructor `
        + `(requested=${claimAmountBig.toString()}, expected=${expectedAmountPerClaim.toString()})`,
      );
    }
    // Resolve locktime before building commitment — the contract encodes tx.locktime into the
    // new NFT commitment (toPaddedBytes(tx.locktime, 5)), so bytes [18-22] must match exactly.
    const locktime = this.resolveClaimLocktime(constructorParams, BigInt(currentTime));

    const newCommitment = new Uint8Array(commitment);
    const totalClaimedOnChain = this.readUint64LE(commitment, 2);
    const newTotalClaimed = totalClaimedOnChain + claimAmountBig;
    const totalPool = this.toBigIntParam(constructorParams[4], 'totalPool');
    if (newTotalClaimed > totalPool) {
      throw new Error('Claim exceeds remaining campaign pool');
    }
    const nextStatus = totalPool > 0n && newTotalClaimed >= totalPool ? 3 : 0;
    newCommitment[0] = nextStatus;

    new DataView(newCommitment.buffer, newCommitment.byteOffset + 2, 8)
      .setBigUint64(0, newTotalClaimed, true);

    const currentCount = new DataView(newCommitment.buffer, newCommitment.byteOffset + 10, 8)
      .getBigUint64(0, true);
    new DataView(newCommitment.buffer, newCommitment.byteOffset + 10, 8)
      .setBigUint64(0, currentCount + 1n, true);
    this.setUint40LE(newCommitment, 18, Number(locktime));
    newCommitment.fill(0, 23, 40);

    // Compute claimerHash from claimer P2PKH address
    const { cashAddressToLockingBytecode } = await import('@bitauth/libauth');
    const decoded = cashAddressToLockingBytecode(claimer);
    if (typeof decoded === 'string') throw new Error(`Invalid claimer address: ${decoded}`);
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Airdrop claims require P2PKH claimer addresses: ${claimer}`);
    }
    const claimerHash = b.slice(3, 23);

    const fee = 1500n;
    const feePayerAddress = signer || claimer;
    const feePayer = await resolveFeePayer(this.provider, this.network, feePayerAddress, fee);
    const recipientOutputSatoshis = tokenType === 'FUNGIBLE_TOKEN' ? 1000n : claimAmountBig;
    const remainingAmount = contractBalance - recipientOutputSatoshis;
    const minimumStateOutput = 546n;

    if (remainingAmount < minimumStateOutput) {
      throw new Error('Insufficient contract balance to preserve campaign state UTXO');
    }

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(Number(locktime));
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.claim(
        claimerHash,                      // bytes20
        new SignatureTemplate(authPrivKey), // authority co-sig — server signs now
        authPubKey,                       // authority pubkey
      ),
      { sequence: 0xffffffff },
    );
    for (const utxo of feePayer.utxos) {
      txBuilder.addInput(utxo, feePayer.unlocker, { sequence: 0xffffffff });
    }

    if (tokenType === 'FUNGIBLE_TOKEN' && tokenCategory && contractUtxo.token) {
      txBuilder.addOutput({
        to: claimer,
        amount: 1000n,
        token: { category: tokenCategory, amount: claimAmountBig },
      });

      const remainingTokens = (contractUtxo.token.amount ?? 0n) - claimAmountBig;
      if (remainingTokens < 0n) {
        throw new Error('Insufficient token balance in campaign UTXO for claim');
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
      txBuilder.addOutput({ to: claimer, amount: claimAmountBig });

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
      userPrompt: 'Claim airdrop allocation',
    });

    console.log('[AirdropClaimService] Built claim transaction', {
      contractAddress,
      claimAmount,
      tokenType: tokenType || 'BCH',
      tokenCategory: tokenCategory || null,
      signer: feePayer.address,
      feeSponsored: feePayer.sponsored,
      inputSatoshis: contractUtxo.satoshis.toString(),
      locktime: locktime.toString(),
    });

    return { claimAmount, wcTransaction };
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

  private resolveClaimLocktime(constructorParams: any[], now: bigint): bigint {
    const startTimestamp = this.toBigIntParam(constructorParams?.[5] ?? 0, 'startTimestamp');
    const endTimestamp = this.toBigIntParam(constructorParams?.[6] ?? 0, 'endTimestamp');

    if (startTimestamp > 0n && endTimestamp > 0n && startTimestamp > endTimestamp) {
      throw new Error('Campaign has invalid claim schedule');
    }
    if (startTimestamp > 0n && now < startTimestamp) {
      throw new Error('Campaign claim window has not started yet');
    }
    if (endTimestamp > 0n && now > endTimestamp) {
      throw new Error('Campaign claim window has ended');
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
