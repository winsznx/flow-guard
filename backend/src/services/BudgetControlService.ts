import {
  Contract,
  ElectrumNetworkProvider,
  TransactionBuilder,
  placeholderPublicKey,
  placeholderSignature,
  type WcTransactionObject,
} from 'cashscript';
import { binToHex, hexToBin } from '@bitauth/libauth';
import { ContractFactory } from './ContractFactory.js';
import { finalizeWcTransactionSequences } from './txFinality.js';

export interface BudgetControlBuildParams {
  contractAddress: string;
  constructorParams: any[];
  currentCommitment: string;
  currentTime: number;
}

export interface BudgetControlBuildResult {
  wcTransaction: WcTransactionObject;
  nextStatus: 'PAUSED';
}

export class BudgetControlService {
  private provider: ElectrumNetworkProvider;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildPauseTransaction(params: BudgetControlBuildParams): Promise<BudgetControlBuildResult> {
    const artifact = ContractFactory.getArtifact('VestingCovenant');
    const contract = new Contract(artifact, params.constructorParams, { provider: this.provider });
    const { contractUtxo, commitment } = await this.getContractState(params.contractAddress, params.currentCommitment);

    const status = commitment[0] ?? 0;
    const flags = commitment[1] ?? 0;
    if (status !== 0) {
      throw new Error('Budget plan must be ACTIVE to pause');
    }
    if ((flags & 0x01) !== 0x01) {
      throw new Error('Budget plan is not configured as cancelable/pausable');
    }
    if (commitment.length < 40) {
      throw new Error('Invalid budget plan state commitment');
    }

    // Matches VestingCovenant.pause() serialization exactly.
    const newCommitment = new Uint8Array(40);
    newCommitment[0] = 1; // PAUSED
    newCommitment[1] = flags;
    newCommitment.set(commitment.slice(2, 10), 2);  // total_released
    newCommitment.set(commitment.slice(10, 15), 10); // cursor
    this.setUint40LE(newCommitment, 15, params.currentTime); // pause_start
    newCommitment.set(commitment.slice(20, 40), 20); // recipient hash

    const feeReserve = 900n;
    const stateOutputSatoshis = contractUtxo.satoshis - feeReserve;
    if (stateOutputSatoshis < 546n) {
      throw new Error('Insufficient contract balance to pause budget plan');
    }

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
        userPrompt: 'Pause budget vesting plan',
      })),
      nextStatus: 'PAUSED',
    };
  }

  private async getContractState(contractAddress: string, fallbackCommitment: string): Promise<{
    contractUtxo: any;
    commitment: Uint8Array;
  }> {
    const contractUtxos = await this.provider.getUtxos(contractAddress);
    if (!contractUtxos || contractUtxos.length === 0) {
      throw new Error(`No UTXOs found for budget contract ${contractAddress}`);
    }

    const contractUtxo = contractUtxos.find((u) => u.token?.nft != null) ?? contractUtxos[0];
    if (!contractUtxo.token?.nft) {
      throw new Error('Budget contract UTXO is missing required state NFT');
    }

    const onChainCommitment: unknown = contractUtxo.token.nft.commitment;
    const commitment =
      onChainCommitment instanceof Uint8Array
        ? onChainCommitment
        : typeof onChainCommitment === 'string'
        ? hexToBin(onChainCommitment)
        : hexToBin(fallbackCommitment || '');

    if (commitment.length < 40) {
      throw new Error('Invalid budget state commitment');
    }

    return { contractUtxo, commitment };
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
