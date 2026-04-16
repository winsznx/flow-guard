import { Contract, ElectrumNetworkProvider, type WcTransactionObject } from 'cashscript';
import { ContractFactory } from './ContractFactory.js';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { hexToBin, binToHex } from '@bitauth/libauth';

export interface BuildVaultFundingParams {
  constructorParamsJson: string;
  contractAddress: string;
  funderAddress: string;
  depositSatoshis: bigint;
}

export interface VaultFundingBuildResult {
  wcTransaction: WcTransactionObject;
  tokenCategory: string;
  initialCommitment: string;
  depositSatoshis: bigint;
}

export class VaultFundingService {
  private provider: ElectrumNetworkProvider;

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildInitialFundingTransaction(params: BuildVaultFundingParams): Promise<VaultFundingBuildResult> {
    if (params.depositSatoshis < 546n) {
      throw new Error('Vault funding amount must be at least 546 satoshis');
    }

    const constructorParams = this.parseConstructorParams(params.constructorParamsJson);
    const artifact = ContractFactory.getArtifact('VaultCovenant');
    const contract = new Contract(artifact, constructorParams, { provider: this.provider });

    if (contract.address.toLowerCase() !== params.contractAddress.toLowerCase()) {
      throw new Error('Vault contract address does not match stored constructor parameters');
    }

    const utxos = await this.provider.getUtxos(params.funderAddress);
    if (!utxos.length) {
      throw new Error('No UTXOs found for vault funder address');
    }

    const nonTokenUtxos = utxos.filter((utxo) => !utxo.token);
    if (!nonTokenUtxos.length) {
      throw new Error('No BCH-only UTXOs available for vault NFT bootstrap funding');
    }

    const categoryAnchor = nonTokenUtxos.find((utxo) => utxo.vout === 0);
    if (!categoryAnchor) {
      throw new Error(
        'Unable to create state NFT category: no spendable BCH UTXO with outpoint index 0 found for this wallet',
      );
    }

    const selected = [categoryAnchor, ...nonTokenUtxos.filter((u) => u.txid !== categoryAnchor.txid || u.vout !== categoryAnchor.vout)];
    const selectedInputs: typeof utxos = [];
    let totalInputSats = 0n;
    const estimatedFee = 3500n;

    for (const utxo of selected) {
      selectedInputs.push(utxo);
      totalInputSats += utxo.satoshis;
      if (totalInputSats >= params.depositSatoshis + estimatedFee) {
        break;
      }
    }

    if (totalInputSats < params.depositSatoshis + estimatedFee) {
      throw new Error(
        `Insufficient BCH to fund vault and fees. Needed at least ${(params.depositSatoshis + estimatedFee).toString()} satoshis`,
      );
    }

    const changeSats = totalInputSats - params.depositSatoshis - estimatedFee;
    const initialCommitment = this.buildInitialVaultCommitment();
    const tokenCategory = categoryAnchor.txid;

    const outputs = [
      ...(changeSats > 546n
        ? [{ to: params.funderAddress, amount: changeSats }]
        : []),
      {
        to: contract.tokenAddress,
        amount: params.depositSatoshis,
        token: {
          category: tokenCategory,
          amount: 0,
          nft: {
            capability: 'mutable' as const,
            commitment: initialCommitment,
          },
        },
      },
    ];

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: params.funderAddress,
      inputs: selectedInputs.map((utxo) => ({
        txid: utxo.txid,
        vout: utxo.vout,
        satoshis: utxo.satoshis,
      })),
      outputs,
      userPrompt: 'Fund vault and initialize state NFT',
      broadcast: true,
    });

    console.log('[VaultFundingService] Built initial vault funding transaction', {
      contractAddress: params.contractAddress,
      funderAddress: params.funderAddress,
      inputCount: selectedInputs.length,
      depositSatoshis: params.depositSatoshis.toString(),
      tokenCategory,
      changeSatoshis: changeSats.toString(),
    });

    return {
      wcTransaction,
      tokenCategory,
      initialCommitment,
      depositSatoshis: params.depositSatoshis,
    };
  }

  private parseConstructorParams(rawJson: string): any[] {
    const params = JSON.parse(rawJson || '[]');
    if (!Array.isArray(params)) throw new Error('Constructor params must be an array');
    return params.map((param: any, i: number) => {
      if (param && typeof param === 'object') {
        const val = typeof param.value === 'string' ? param.value : String(param.value ?? '');
        if (val.length > 1024) throw new Error(`Constructor param ${i} value exceeds max length`);
        if (param.type === 'bigint') {
          if (!/^-?\d+$/.test(val)) throw new Error(`Constructor param ${i}: invalid bigint value`);
          return BigInt(val);
        }
        if (param.type === 'bytes') {
          if (!/^[0-9a-fA-F]*$/.test(val)) throw new Error(`Constructor param ${i}: invalid hex value`);
          return hexToBin(val);
        }
        if (param.type === 'boolean') return val === 'true' || param.value === true;
        return param.value;
      }
      return param;
    });
  }

  private buildInitialVaultCommitment(): string {
    const commitment = new Uint8Array(32);
    // [0] version
    commitment[0] = 1;
    // [1] status (0 = ACTIVE)
    commitment[1] = 0;
    // [2..4] rolesMask (currently advisory; keep zeroed)
    commitment[2] = 0;
    commitment[3] = 0;
    commitment[4] = 0;
    // [5..8] current_period_id (big-endian uint32)
    commitment[5] = 0;
    commitment[6] = 0;
    commitment[7] = 0;
    commitment[8] = 0;
    // [9..16] spent_this_period (big-endian uint64)
    commitment.fill(0, 9, 17);

    const now = BigInt(Math.floor(Date.now() / 1000));
    const timestampBytes = new Uint8Array(8);
    let temp = now;
    for (let i = 7; i >= 0; i--) {
      timestampBytes[i] = Number(temp & 0xffn);
      temp >>= 8n;
    }
    commitment.set(timestampBytes, 17);
    // [25..31] reserved zeros
    commitment.fill(0, 25);
    return binToHex(commitment);
  }
}
