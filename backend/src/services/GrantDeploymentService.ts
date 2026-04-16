import { Contract, ElectrumNetworkProvider } from 'cashscript';
import { hash160, hexToBin, binToHex, cashAddressToLockingBytecode, secp256k1 } from '@bitauth/libauth';
import { ContractFactory, type ConstructorParam } from './ContractFactory.js';
import { displayAmountToOnChain } from '../utils/amounts.js';
import crypto from 'crypto';

export interface GrantDeploymentParams {
  vaultId: string;
  authorityAddress: string;
  recipientAddress: string;
  milestonesTotal: number;
  amountPerMilestone: number;
  totalAmount: number;
  cancelable?: boolean;
  transferable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface GrantDeploymentParamsWithHash {
  vaultId: string;
  authorityHash: string;
  recipientHash: string;
  milestonesTotal: number;
  amountPerMilestone: number;
  totalAmount: number;
  cancelable?: boolean;
  transferable?: boolean;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface GrantDeployment {
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

export class GrantDeploymentService {
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
      throw new Error(`Grant address must be P2PKH: ${address}`);
    }
    return b.slice(3, 23);
  }

  private generateCampaignId(params: GrantDeploymentParams): Uint8Array {
    const vaultIdBin = hexToBin(params.vaultId);
    const authorityHash = this.addressToHash160(params.authorityAddress);
    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(Date.now()), true);

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
   * Create initial NFT commitment for GrantCovenant (40 bytes):
   * [0]:     status (0=ACTIVE)
   * [1]:     flags (bit0=cancelable, bit1=transferable, bit2=usesTokens)
   * [2]:     milestones_completed (0)
   * [3-10]:  total_released (0, uint64 LE)
   * [11-15]: last_release_timestamp (0, 5 bytes LE)
   * [16-35]: recipient_hash (bytes20)
   * [36-39]: reserved (4 zeros)
   */
  private createGrantCommitment(
    recipientHash: Uint8Array,
    params: { cancelable?: boolean; transferable?: boolean; tokenType?: string },
  ): Uint8Array {
    const commitment = new Uint8Array(40);

    commitment[0] = 0; // ACTIVE status

    let flags = 0;
    if (params.cancelable !== false) flags |= 1;
    if (params.transferable === true) flags |= 2;
    if (params.tokenType === 'FUNGIBLE_TOKEN') flags |= 4;
    commitment[1] = flags;

    commitment[2] = 0; // milestones_completed

    commitment.set(recipientHash, 16);

    return commitment;
  }

  private buildContract(
    vaultId: Uint8Array,
    authorityHash: Uint8Array,
    milestonesTotal: bigint,
    amountPerMilestoneSat: bigint,
    totalAmountSat: bigint,
  ) {
    const artifact = ContractFactory.getArtifact('GrantCovenant');

    const constructorArgs = [
      vaultId,
      authorityHash,
      milestonesTotal,
      amountPerMilestoneSat,
      totalAmountSat,
    ];

    const contract = new Contract(artifact, constructorArgs, { provider: this.provider });

    const constructorParams: ConstructorParam[] = [
      { type: 'bytes', value: binToHex(vaultId) },
      { type: 'bytes', value: binToHex(authorityHash) },
      { type: 'bigint', value: milestonesTotal.toString() },
      { type: 'bigint', value: amountPerMilestoneSat.toString() },
      { type: 'bigint', value: totalAmountSat.toString() },
    ];

    return { contract, constructorParams };
  }

  async deployGrant(params: GrantDeploymentParams): Promise<GrantDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN grants');
    }
    if (params.milestonesTotal < 1 || params.milestonesTotal > 255) {
      throw new Error('milestonesTotal must be between 1 and 255');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = this.addressToHash160(params.authorityAddress);
    const recipientHash = this.addressToHash160(params.recipientAddress);
    const { privKey: authPrivKey } = this.generateAuthorityKeypair();
    const campaignId = this.generateCampaignId(params);

    const amountPerMilestoneSat = BigInt(this.toOnChainAmount(params.amountPerMilestone, params.tokenType));
    const totalAmountSat = BigInt(this.toOnChainAmount(params.totalAmount, params.tokenType));
    const milestonesTotal = BigInt(params.milestonesTotal);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash,
      milestonesTotal, amountPerMilestoneSat, totalAmountSat,
    );

    const initialCommitment = this.createGrantCommitment(recipientHash, params);
    const totalAmountOnChain = Number(totalAmountSat);

    const fundingTx: GrantDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN' ? 1000 : totalAmountOnChain,
      withNFT: { commitment: binToHex(initialCommitment), capability: 'mutable' },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
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

  async deployGrantWithHash(params: GrantDeploymentParamsWithHash): Promise<GrantDeployment> {
    if (params.tokenType === 'FUNGIBLE_TOKEN' && !params.tokenCategory) {
      throw new Error('tokenCategory is required for FUNGIBLE_TOKEN grants');
    }
    if (params.milestonesTotal < 1 || params.milestonesTotal > 255) {
      throw new Error('milestonesTotal must be between 1 and 255');
    }

    const vaultId = hexToBin(params.vaultId);
    const authorityHash = hexToBin(params.authorityHash);
    const recipientHash = hexToBin(params.recipientHash);
    const { privKey: authPrivKey } = this.generateAuthorityKeypair();

    const timestampBuf = new Uint8Array(8);
    new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(Date.now()), true);
    const combined = new Uint8Array(32 + 20 + 8);
    combined.set(vaultId, 0);
    combined.set(authorityHash, 32);
    combined.set(timestampBuf, 52);
    const h = hash160(combined);
    const campaignId = new Uint8Array(32);
    campaignId.set(h, 12);

    const amountPerMilestoneSat = BigInt(this.toOnChainAmount(params.amountPerMilestone, params.tokenType));
    const totalAmountSat = BigInt(this.toOnChainAmount(params.totalAmount, params.tokenType));
    const milestonesTotal = BigInt(params.milestonesTotal);

    const { contract, constructorParams } = this.buildContract(
      vaultId, authorityHash,
      milestonesTotal, amountPerMilestoneSat, totalAmountSat,
    );

    const initialCommitment = this.createGrantCommitment(recipientHash, params);
    const totalAmountOnChain = Number(totalAmountSat);

    const fundingTx: GrantDeployment['fundingTxRequired'] = {
      toAddress: contract.address,
      amount: params.tokenType === 'FUNGIBLE_TOKEN' ? 1000 : totalAmountOnChain,
      withNFT: { commitment: binToHex(initialCommitment), capability: 'mutable' },
    };

    if (params.tokenType === 'FUNGIBLE_TOKEN') {
      fundingTx.tokenType = 'FUNGIBLE_TOKEN';
      fundingTx.tokenCategory = params.tokenCategory;
      fundingTx.tokenAmount = totalAmountOnChain;
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
