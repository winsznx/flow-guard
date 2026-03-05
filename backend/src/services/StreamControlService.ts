import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { binToHex, cashAddressToLockingBytecode, hexToBin } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { PaymentControlService } from './PaymentControlService.js';
import { finalizeWcTransactionSequences } from './txFinality.js';

export interface StreamControlBuildParams {
  streamType: 'LINEAR' | 'STEP' | 'RECURRING' | 'TRANCHE' | 'HYBRID';
  contractAddress: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
  tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
}

export interface StreamTransferBuildParams extends StreamControlBuildParams {
  streamType: 'LINEAR' | 'STEP' | 'TRANCHE' | 'HYBRID';
  currentRecipient: string;
  newRecipient: string;
}

export interface StreamRefillBuildParams extends StreamControlBuildParams {
  streamType: 'RECURRING';
  senderAddress: string;
  refillAmount: bigint;
}

export interface StreamControlBuildResult {
  wcTransaction: WcTransactionObject;
  nextStatus?: 'PAUSED' | 'ACTIVE' | 'CANCELLED';
  nextRecipient?: string;
}

export class StreamControlService {
  private provider: ElectrumNetworkProvider;
  private paymentControlService: PaymentControlService;

  constructor(
    private readonly network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet',
  ) {
    this.provider = new ElectrumNetworkProvider(network);
    this.paymentControlService = new PaymentControlService(network);
  }

  async buildPauseTransaction(params: StreamControlBuildParams): Promise<StreamControlBuildResult> {
    if (params.streamType === 'RECURRING') {
      const recurringResult = await this.paymentControlService.buildPauseTransaction({
        contractAddress: params.contractAddress,
        constructorParams: params.constructorParams,
        currentCommitment: params.currentCommitment,
        currentTime: params.currentTime,
        tokenType: params.tokenType,
        tokenCategory: params.tokenCategory,
      });
      return {
        wcTransaction: recurringResult.wcTransaction,
        nextStatus: 'PAUSED',
      };
    }

    const artifact = ContractFactory.getArtifact(this.getVestingArtifact(params.streamType));
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Stream must be ACTIVE to pause');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Stream is not configured as pausable');
    }

    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 1; // PAUSED
    newCommitment[1] = flags;
    newCommitment.set(commitment.slice(2, 10), 2);
    newCommitment.set(commitment.slice(10, 15), 10);
    this.setUint40LE(newCommitment, 15, params.currentTime);
    newCommitment.set(commitment.slice(20, 40), 20);

    const stateOutputSatoshis = this.buildStateOutputAmount(contractUtxo.satoshis, 'pause');

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.pause(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
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

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Pause stream',
      })),
      nextStatus: 'PAUSED',
    };
  }

  async buildResumeTransaction(params: StreamControlBuildParams): Promise<StreamControlBuildResult> {
    if (params.streamType === 'RECURRING') {
      const recurringResult = await this.paymentControlService.buildResumeTransaction({
        contractAddress: params.contractAddress,
        constructorParams: params.constructorParams,
        currentCommitment: params.currentCommitment,
        currentTime: params.currentTime,
        tokenType: params.tokenType,
        tokenCategory: params.tokenCategory,
      });
      return {
        wcTransaction: recurringResult.wcTransaction,
        nextStatus: 'ACTIVE',
      };
    }

    const artifact = ContractFactory.getArtifact(this.getVestingArtifact(params.streamType));
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    if (status !== 1) {
      throw new Error('Stream must be PAUSED to resume');
    }

    const flags = commitment[1] ?? 0;
    const cursor = this.readUint40LE(commitment, 10);
    const pauseStart = this.readUint40LE(commitment, 15);
    if (pauseStart <= 0) {
      throw new Error('Invalid stream pause state');
    }

    const pauseDuration = Math.max(0, params.currentTime - pauseStart);
    const newCursor = cursor + pauseDuration;

    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 0; // ACTIVE
    newCommitment[1] = flags;
    newCommitment.set(commitment.slice(2, 10), 2);
    this.setUint40LE(newCommitment, 10, newCursor);
    this.setUint40LE(newCommitment, 15, 0);
    newCommitment.set(commitment.slice(20, 40), 20);

    const stateOutputSatoshis = this.buildStateOutputAmount(contractUtxo.satoshis, 'resume');

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.resume(
        placeholderSignature(),
        placeholderPublicKey(),
      ),
    );
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

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Resume stream',
      })),
      nextStatus: 'ACTIVE',
    };
  }

  async buildTransferTransaction(params: StreamTransferBuildParams): Promise<StreamControlBuildResult> {
    const artifact = ContractFactory.getArtifact(this.getVestingArtifact(params.streamType));
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Only ACTIVE vesting streams can transfer recipients');
    }
    if ((flags & 0x02) !== 0x02) {
      throw new Error('This vesting stream is not transferable');
    }

    const currentRecipientHash = commitment.slice(20, 40);
    const expectedCurrentRecipientHash = this.addressToHash160(params.currentRecipient);
    if (!this.bytesEqual(currentRecipientHash, expectedCurrentRecipientHash)) {
      throw new Error('Current recipient does not match on-chain stream owner');
    }

    const newRecipientHash = this.addressToHash160(params.newRecipient);
    if (this.bytesEqual(currentRecipientHash, newRecipientHash)) {
      throw new Error('New recipient must differ from current recipient');
    }

    const newCommitment = new Uint8Array(commitment);
    newCommitment.set(newRecipientHash, 20);

    const stateOutputSatoshis = this.buildStateOutputAmount(contractUtxo.satoshis, 'transfer');

    const txBuilder = new TransactionBuilder({ provider: this.provider });
    txBuilder.setLocktime(params.currentTime);
    txBuilder.addInput(
      contractUtxo,
      contract.unlock.transfer(
        placeholderSignature(),
        placeholderPublicKey(),
        newRecipientHash,
      ),
    );
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

    return {
      wcTransaction: finalizeWcTransactionSequences(txBuilder.generateWcTransactionObject({
        broadcast: true,
        userPrompt: 'Transfer vesting stream recipient',
      })),
      nextRecipient: params.newRecipient,
    };
  }

  async buildRefillTransaction(params: StreamRefillBuildParams): Promise<StreamControlBuildResult> {
    if (params.streamType !== 'RECURRING') {
      throw new Error('Only recurring streams support refill transactions');
    }

    const recurringResult = await this.paymentControlService.buildRefillTransaction({
      contractAddress: params.contractAddress,
      constructorParams: params.constructorParams,
      currentCommitment: params.currentCommitment,
      currentTime: params.currentTime,
      tokenType: params.tokenType,
      tokenCategory: params.tokenCategory,
      senderAddress: params.senderAddress,
      refillAmount: params.refillAmount,
    });

    return {
      wcTransaction: recurringResult.wcTransaction,
      nextStatus: recurringResult.nextStatus,
    };
  }

  private buildStateOutputAmount(contractSatoshis: bigint, action: string): bigint {
    const feeReserve = 900n;
    const stateOutputSatoshis = contractSatoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error(`Insufficient contract balance to ${action} stream`);
    }
    return stateOutputSatoshis;
  }

  private async getContractState(contractAddress: string, fallbackCommitment: string): Promise<{
    contractUtxo: any;
    commitment: Uint8Array;
  }> {
    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for stream contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Stream contract UTXO is missing required state NFT');
    }

    const onChainCommitment: unknown = contractUtxo.token.nft.commitment;
    const commitment =
      onChainCommitment instanceof Uint8Array
        ? onChainCommitment
        : typeof onChainCommitment === 'string'
          ? hexToBin(onChainCommitment)
          : hexToBin(fallbackCommitment || '');

    if (commitment.length < 40) {
      throw new Error('Invalid stream state commitment');
    }

    return { contractUtxo, commitment };
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
      throw new Error(`Stream recipients must be P2PKH addresses: ${address}`);
    }
    return b.slice(3, 23);
  }

  private bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  private getVestingArtifact(streamType: StreamControlBuildParams['streamType']) {
    if (streamType === 'TRANCHE') return 'TrancheVestingCovenant';
    if (streamType === 'HYBRID') return 'HybridVestingCovenant';
    return 'VestingCovenant';
  }

  private readUint40LE(source: Uint8Array, offset: number): number {
    return (
      source[offset]
      + (source[offset + 1] << 8)
      + (source[offset + 2] << 16)
      + (source[offset + 3] << 24)
      + (source[offset + 4] * 0x100000000)
    );
  }

  private setUint40LE(target: Uint8Array, offset: number, value: number): void {
    const safe = Math.max(0, Math.floor(value));
    target[offset] = safe & 0xff;
    target[offset + 1] = (safe >>> 8) & 0xff;
    target[offset + 2] = (safe >>> 16) & 0xff;
    target[offset + 3] = (safe >>> 24) & 0xff;
    target[offset + 4] = Math.floor(safe / 0x100000000) & 0xff;
  }
}
