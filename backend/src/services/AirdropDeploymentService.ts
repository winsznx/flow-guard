/**
 * Airdrop Deployment Service
 * Handles on-chain deployment of AirdropCovenant contracts with NFT state
 */

import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hash160, hexToBin, binToHex, cashAddressToLockingBytecode, secp256k1 } from '@bitauth/libauth';
import { ContractFactory, type ConstructorParam } from './ContractFactory.js';
import { displayAmountToOnChain } from '../utils/amounts.js';
import crypto from 'crypto';

export interface AirdropDeploymentParams {
  vaultId: string; // hex-encoded 32-byte vault ID
  authorityAddress: string; // BCH address of vault/authority (admin: pause/resume/cancel)
  amountPerClaim: number; // Amount per claim (BCH or tokens)
  totalAmount: number; // Total pool amount
  startTime: number; // Unix timestamp (0 = immediate)
  endTime: number; // Unix timestamp (0 = no expiry)
  cancelable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string; // hex-encoded 32-byte category ID for CashTokens
  tokenDecimals?: number; // BCMR decimals; display amounts are whole tokens
}

export interface AirdropDeploymentParamsWithHash {
  vaultId: string;
  authorityHash: string; // hex-encoded 20-byte hash160 of authority pubkey
  amountPerClaim: number;
  totalAmount: number;
  startTime: number;
  endTime: number;
  cancelable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  tokenDecimals?: number; // BCMR decimals; display amounts are whole tokens
}

export interface AirdropDeployment {
  contractAddress: string;
  campaignId: string;
  constructorParams: ConstructorParam[];
  initialCommitment: string; // hex-encoded NFT commitment
  claimAuthorityPrivKey: string; // hex-encoded 32-byte private key — store securely in DB
  fundingTxRequired: {
    toAddress: string;
    amount: number; // satoshis (BCH dust when using tokens)
    tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string; // hex-encoded category ID for CashTokens
    tokenAmount?: number; // fungible token amount
    withNFT: {
      commitment: string; // hex
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export class AirdropDeploymentService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Generate a fresh secp256k1 keypair for the claim authority.
   * The private key is stored per-airdrop in the DB and used by
   * AirdropClaimService to co-sign every claim transaction.
   */
  private generateClaimAuthorityKeypair(): { privKey: Uint8Array; hash: Uint8Array } {
    let privKey: Uint8Array;
    // Retry until we have a valid key (extremely rare to need >1 attempt)
    do {
      privKey = new Uint8Array(crypto.randomBytes(32));
    } while (secp256k1.derivePublicKeyCompressed(privKey) === null);

    const pubKey = secp256k1.derivePublicKeyCompressed(privKey) as Uint8Array;
    return { privKey, hash: hash160(pubKey) };
  }

  /**
   * Convert BCH address to hash160
   */
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
      throw new Error(`Airdrop authority address must be P2PKH: ${address}`);
    }
    return b.slice(3, 23);
  }

  /**
   * Generate campaignId from parameters
   */
  private generateCampaignId(params: AirdropDeploymentParams): Uint8Array {
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

  private toOnChainAmount(amount: number, tokenType?: 'BCH' | 'FUNGIBLE_TOKEN', tokenDecimals = 0): number {
    return displayAmountToOnChain(
      amount,
      tokenType === 'FUNGIBLE_TOKEN' ? 'FUNGIBLE_TOKEN' : 'BCH',
      tokenDecimals,
    );
  }

  /**
   * Create initial NFT commitment for AirdropCovenant
   *
   * Commitment structure (40 bytes):
   * [0]: status (0=ACTIVE)
   * [1]: flags (bit0=cancelable, bit2=usesTokens)
   * [2-9]: total_claimed (0 initially)
   * [10-17]: claims_count (0 initially)
   * [18-22]: last_claim_timestamp (0 initially)
   * [23-39]: reserved (17 bytes, zeros)
   */
  private createAirdropCommitment(params: AirdropDeploymentParams | AirdropDeploymentParamsWithHash): Uint8Array {
    const commitment = new Uint8Array(40);

    commitment[0] = 0; // ACTIVE status

    let flags = 0;
    if (params.cancelable !== false) flags |= 1; // bit 0
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4; // bit 2 (usesTokens)
    commitment[1] = flags;

    return commitment;
  }

  /**
   * Build constructor args + params for the updated AirdropCovenant.
   * Constructor order: vaultId, authorityHash, claimAuthorityHash,
   *                    amountPerClaim, totalPool, startTimestamp, endTimestamp
   */
  private buildContract(
    vaultId: Uint8Array,
    authorityHash: Uint8Array,
    claimAuthorityHash: Uint8Array,
    amountPerClaimSat: bigint,
    totalPoolSat: bigint,
    startTimestamp: bigint,
    endTimestamp: bigint,
  ) {
    const artifact = ContractFactory.getArtifact(ContractFactory.latest('AirdropCovenant'));

    const constructorArgs = [
      vaultId,
      authorityHash,
      claimAuthorityHash,
      amountPerClaimSat,
      totalPoolSat,
      startTimestamp,
      endTimestamp,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(authorityHash) },
      { type: 'bytes', value: binToHex(claimAuthorityHash) },
      { type: 'bigint', value: amountPerClaimSat.toString() },
      { type: 'bigint', value: totalPoolSat.toString() },
      { type: 'bigint', value: startTimestamp.toString() },
      { type: 'bigint', value: endTimestamp.toString() },
    ];

    return { contract, constructorParams };
  }

  /**
   * Deploy an AirdropCovenant
   */
  async deployAirdrop(params: AirdropDeploymentParams): Promise<AirdropDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN airdrops');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = this.addressToHash160(params.authorityAddress);
    const { privKey: claimAuthPrivKey, hash: claimAuthorityHash } = this.generateClaimAuthorityKeypair();
    const campaignId = this.generateCampaignId(params);

    const amountPerClaimSat = BigInt(this.toOnChainAmount(params.amountPerClaim, params.tokenType, params.tokenDecimals));
    const totalPoolSat = BigInt(this.toOnChainAmount(params.totalAmount, params.tokenType, params.tokenDecimals));
    const startTimestamp = BigInt(params.startTime || 0);
    const endTimestamp = BigInt(params.endTime || 0);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash, claimAuthorityHash,
      amountPerClaimSat, totalPoolSat, startTimestamp, endTimestamp,
    );

    const initialCommitment = this.createAirdropCommitment(params);
    const totalPoolOnChain = Number(totalPoolSat);

    const fundingTx: AirdropDeployment['fundingTxRequired'] = {
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
      claimAuthorityPrivKey: binToHex(claimAuthPrivKey),
      fundingTxRequired: fundingTx,
    };
  }

  async deployAirdropWithHash(params: AirdropDeploymentParamsWithHash): Promise<AirdropDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN airdrops');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = hexToBin(params.authorityHash);
    const { privKey: claimAuthPrivKey, hash: claimAuthorityHash } = this.generateClaimAuthorityKeypair();

    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(params.startTime || Date.now()), true);
    const combined = new Uint8Array(32 + 20 + 8);
    combined.set(vaultId, 0);
    combined.set(authorityHash, 32);
    combined.set(timestampBuf, 52);
    const h = hash160(combined);
    const campaignId = new Uint8Array(32);
    campaignId.set(h, 12);

    const amountPerClaimSat = BigInt(this.toOnChainAmount(params.amountPerClaim, params.tokenType, params.tokenDecimals));
    const totalPoolSat = BigInt(this.toOnChainAmount(params.totalAmount, params.tokenType, params.tokenDecimals));
    const startTimestamp = BigInt(params.startTime || 0);
    const endTimestamp = BigInt(params.endTime || 0);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash, claimAuthorityHash,
      amountPerClaimSat, totalPoolSat, startTimestamp, endTimestamp,
    );

    const initialCommitment = this.createAirdropCommitment(params);
    const totalPoolOnChain = Number(totalPoolSat);

    const fundingTx: AirdropDeployment['fundingTxRequired'] = {
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
      claimAuthorityPrivKey: binToHex(claimAuthPrivKey),
      fundingTxRequired: fundingTx,
    };
  }
}
