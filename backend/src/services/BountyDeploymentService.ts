/**
 * Bounty Deployment Service
 * Handles on-chain deployment of BountyCovenant contracts with NFT state
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hash160, hexToBin, binToHex, cashAddressToLockingBytecode, secp256k1 } from '@bitauth/libauth';
import { ContractFactory, type ConstructorParam } from './ContractFactory.js';
import { displayAmountToOnChain } from '../utils/amounts.js';
import crypto from 'crypto';

export interface BountyDeploymentParams {
  vaultId: string;
  authorityAddress: string;
  rewardPerWinner: number;
  maxWinners: number;
  startTime: number;
  endTime: number;
  cancelable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface BountyDeploymentParamsWithHash {
  vaultId: string;
  authorityHash: string;
  rewardPerWinner: number;
  maxWinners: number;
  startTime: number;
  endTime: number;
  cancelable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface BountyDeployment {
  contractAddress: string;
  campaignId: string;
  constructorParams: ConstructorParam[];
  initialCommitment: string;
  authorityPrivKey: string;
  fundingTxRequired: {
    toAddress: string;
    amount: number;
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    tokenAmount?: number;
    withNFT: {
      commitment: string;
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export class BountyDeploymentService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  private generateAuthorityKeypair(): { privKey: Uint8Array; hash: Uint8Array } {
    let privKey: Uint8Array;
    do {
      privKey = new Uint8Array(crypto.randomBytes(32));
    } while (secp256k1.derivePublicKeyCompressed(privKey) === null);

    const pubKey = secp256k1.derivePublicKeyCompressed(privKey) as Uint8Array;
    return { privKey, hash: hash160(pubKey) };
  }

  private addressToHash160(address: string): Uint8Array {
    const decoded = cashAddressToLockingBytecode(address);
    if (typeof decoded === 'string') throw new Error(decoded);
    const b = decoded.bytecode;
    const isP2pkh = b.length === 25
      && b[0] === 0x76
      && b[1] === 0xa9
      && b[2] === 0x14
      && b[23] === 0x88
      && b[24] === 0xac;
    if (!isP2pkh) {
      throw new Error(`Bounty authority address must be P2PKH: ${address}`);
    }
    return b.slice(3, 23);
  }

  private generateCampaignId(params: BountyDeploymentParams): Uint8Array {
    const vaultIdBin = hexToBin(params.vaultId);
    const authorityHash = this.addressToHash160(params.authorityAddress);
    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(params.startTime || Date.now()), true);

    const combined = new Uint8Array(32 + 20 + 8);
    combined.set(vaultIdBin, 0);
    combined.set(authorityHash, 32);
    combined.set(timestampBuf, 52);

    const h = hash160(combined);
    const id = new Uint8Array(32);
    id.set(h, 12);
    return id;
  }

  private toOnChainAmount(amount: number, tokenType?: 'BCH' | 'FUNGIBLE_TOKEN'): number {
    return displayAmountToOnChain(
      amount,
      tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
    );
  }

  /**
   * Create initial NFT commitment for BountyCovenant (40 bytes):
   * [0]: status (0=ACTIVE)
   * [1]: flags (bit0=cancelable, bit2=usesTokens)
   * [2-9]: total_paid (0 initially, uint64 LE)
   * [10-13]: winners_count (0 initially, uint32 LE)
   * [14-18]: last_claim_timestamp (0 initially, 5 bytes LE)
   * [19-39]: reserved (21 zero bytes)
   */
  private createBountyCommitment(
    params: BountyDeploymentParams | BountyDeploymentParamsWithHash,
  ): Uint8Array {
    const commitment = new Uint8Array(40);

    commitment[0] = 0; // ACTIVE status

    let flags = 0;
    if (params.cancelable !== false) flags |= 1;
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4;
    commitment[1] = flags;

    return commitment;
  }

  private buildContract(
    vaultId: Uint8Array,
    authorityHash: Uint8Array,
    rewardPerWinnerSat: bigint,
    maxWinners: bigint,
    startTimestamp: bigint,
    endTimestamp: bigint,
  ) {
    const artifact = ContractFactory.getArtifact('BountyCovenant');

    const constructorArgs = [
      vaultId,
      authorityHash,
      rewardPerWinnerSat,
      maxWinners,
      startTimestamp,
      endTimestamp,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(authorityHash) },
      { type: 'bigint', value: rewardPerWinnerSat.toString() },
      { type: 'bigint', value: maxWinners.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: endTimestamp.toString() },
    ];

    return { contract, constructorParams };
  }

  async deployBounty(params: BountyDeploymentParams): Promise<BountyDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN bounties');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = this.addressToHash160(params.authorityAddress);
    const { privKey: authPrivKey, hash: _authHash } = this.generateAuthorityKeypair();
    const campaignId = this.generateCampaignId(params);

    const rewardPerWinnerSat = BigInt(this.toOnChainAmount(params.rewardPerWinner, params.tokenType));
    const maxWinners = BigInt(params.maxWinners);
    const startTimestamp = BigInt(params.startTime || 0);
    const endTimestamp = BigInt(params.endTime || 0);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash,
      rewardPerWinnerSat, maxWinners, startTimestamp, endTimestamp,
    );

    const initialCommitment = this.createBountyCommitment(params);
    const totalPoolOnChain = Number(rewardPerWinnerSat * maxWinners);

    const fundingTx: BountyDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN' ? 1000 : totalPoolOnChain,
      withNFT: { commitment: binToHex(initialCommitment), capability: 'mutable' },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalPoolOnChain;
    }

    return {
      contractAddress: contract.address,
      campaignId: binToHex(campaignId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      authorityPrivKey: binToHex(authPrivKey),
      fundingTxRequired: fundingTx,
    };
  }

  async deployBountyWithHash(params: BountyDeploymentParamsWithHash): Promise<BountyDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN bounties');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = hexToBin(params.authorityHash);
    const { privKey: authPrivKey, hash: _authHash } = this.generateAuthorityKeypair();

    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(params.startTime || Date.now()), true);
    const combined = new Uint8Array(32 + 20 + 8);
    combined.set(vaultId, 0);
    combined.set(authorityHash, 32);
    combined.set(timestampBuf, 52);
    const h = hash160(combined);
    const campaignId = new Uint8Array(32);
    campaignId.set(h, 12);

    const rewardPerWinnerSat = BigInt(this.toOnChainAmount(params.rewardPerWinner, params.tokenType));
    const maxWinners = BigInt(params.maxWinners);
    const startTimestamp = BigInt(params.startTime || 0);
    const endTimestamp = BigInt(params.endTime || 0);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash,
      rewardPerWinnerSat, maxWinners, startTimestamp, endTimestamp,
    );

    const initialCommitment = this.createBountyCommitment(params);
    const totalPoolOnChain = Number(rewardPerWinnerSat * maxWinners);

    const fundingTx: BountyDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN' ? 1000 : totalPoolOnChain,
      withNFT: { commitment: binToHex(initialCommitment), capability: 'mutable' },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalPoolOnChain;
    }

    return {
      contractAddress: contract.address,
      campaignId: binToHex(campaignId),
      constructorParams,
      initialCommitment: binToHex(initialCommitment),
      authorityPrivKey: binToHex(authPrivKey),
      fundingTxRequired: fundingTx,
    };
  }
}
