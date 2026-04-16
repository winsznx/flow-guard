/**
 * Bounty Funding Service
 * Builds funding transactions for bounty contracts
 */

import { ElectrumNetworkProvider, type WcTransactionObject } from 'cashscript';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { toNonNegativeBigInt } from '../utils/bigint.js';
import {
  getRequiredContractFundingSatoshis,
  getTokenOutputDustSatoshis,
} from '../utils/fundingConfig.js';
import {
  getAuthorityCommitmentHex,
  selectTokenFundingInputs,
} from '../utils/tokenMintAuthority.js';

export interface TransactionOutput {
  to: string;
  amount: number | string;
  token?: {
    category: string;
    amount: number | string;
    nft?: {
      commitment: string;
      capability: 'minting' | 'mutable' | 'none';
    };
  };
}

export interface BountyFundingTransactionParams {
  contractAddress: string;
  creatorAddress: string;
  totalPool: number | string | bigint;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  nftCommitment: string;
  nftCapability: 'minting' | 'mutable' | 'none';
}

export interface UnsignedFundingTransaction {
  inputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
  }>;
  outputs: TransactionOutput[];
  fee: number;
  txHex: string;
  sourceOutputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
    tokenNftCapability?: 'none' | 'mutable' | 'minting';
    tokenNftCommitment?: string;
  }>;
  requiredSignatures: string[];
  wcTransaction: WcTransactionObject;
}

export class BountyFundingService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildFundingTransaction(params: BountyFundingTransactionParams): Promise<UnsignedFundingTransaction> {
    const {
      contractAddress,
      creatorAddress,
      totalPool,
      tokenType,
      tokenCategory,
      nftCommitment,
      nftCapability,
    } = params;

    const utxos = await this.provider.getUtxos(creatorAddress);

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for creator ${creatorAddress}`);
    }

    let selectedUtxos: typeof utxos = [];
    let totalInputValue = 0n;
    let totalTokenInputAmount = 0n;
    const dustAmount = getTokenOutputDustSatoshis();
    const totalPoolOnChain = toNonNegativeBigInt(totalPool, 'totalPool');
    const contractOutput = getRequiredContractFundingSatoshis('airdrop', tokenType, totalPoolOnChain);
    let stateTokenCategory: string | undefined = tokenCategory;
    let authorityChangeOutput: TransactionOutput | null = null;

    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory) {
        throw new Error('Token category required for FUNGIBLE_TOKEN type');
      }
      stateTokenCategory = tokenCategory;
      const selection = selectTokenFundingInputs(utxos, tokenCategory, totalPoolOnChain, 'airdrop');
      selectedUtxos = [selection.authorityUtxo, ...selection.fungibleUtxos];
      totalTokenInputAmount = selection.totalTokenAmount;
      totalInputValue = selection.totalInputSatoshis;
      authorityChangeOutput = {
        to: creatorAddress,
        amount: dustAmount.toString(),
        token: {
          category: tokenCategory,
          amount: (selection.totalTokenAmount - totalPoolOnChain).toString(),
          nft: {
            capability: selection.authorityUtxo.token!.nft!.capability as 'none' | 'mutable' | 'minting',
            commitment: getAuthorityCommitmentHex(selection.authorityUtxo),
          },
        },
      };

      const preliminaryOutputs: TransactionOutput[] = [
        {
          to: contractAddress,
          amount: contractOutput.toString(),
          token: {
            category: tokenCategory,
            amount: totalPoolOnChain.toString(),
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          },
        },
        authorityChangeOutput,
        { to: creatorAddress, amount: '0' },
      ];

      const bchUtxos = utxos.filter((utxo: any) => !utxo.token);
      let estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
      const requiredAmount = () => contractOutput + dustAmount + estimatedFee;
      if (totalInputValue < requiredAmount()) {
        for (const utxo of bchUtxos) {
          selectedUtxos.push(utxo);
          totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'fee input satoshis');
          estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
          if (totalInputValue >= requiredAmount()) {
            break;
          }
        }
      }

      if (totalInputValue < requiredAmount()) {
        const neededBch = (Number(requiredAmount()) / 1e8).toFixed(8);
        const haveBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${neededBch} BCH, wallet has ${haveBch} BCH`,
        );
      }
    } else {
      const nonTokenUtxos = utxos.filter((utxo: any) => !utxo.token);
      const categoryAnchor = nonTokenUtxos.find((utxo: any) => utxo.vout === 0);
      if (!categoryAnchor) {
        throw new Error(
          'Cannot mint bounty state NFT: creator wallet needs a spendable BCH UTXO with outpoint index 0',
        );
      }
      stateTokenCategory = categoryAnchor.txid;

      const requiredAmount = contractOutput + 2000n;

      const orderedUtxos = [
        categoryAnchor,
        ...nonTokenUtxos.filter(
          (utxo: any) => utxo.txid !== categoryAnchor.txid || utxo.vout !== categoryAnchor.vout,
        ),
      ];

      for (const utxo of orderedUtxos) {
        selectedUtxos.push(utxo);
        totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'input satoshis');

        if (totalInputValue >= requiredAmount) {
          break;
        }
      }

      if (totalInputValue < requiredAmount) {
        const requiredBch = (Number(requiredAmount) / 1e8).toFixed(8);
        const availableBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${requiredBch} BCH, wallet has ${availableBch} BCH`
        );
      }
    }

    const sourceOutputs = selectedUtxos.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: Number(toNonNegativeBigInt(utxo.satoshis, 'source output satoshis')),
      tokenCategory: utxo.token?.category,
      tokenAmount: utxo.token?.amount !== undefined ? toNonNegativeBigInt(utxo.token.amount, 'source token amount').toString() : undefined,
      tokenNftCapability: utxo.token?.nft?.capability,
      tokenNftCommitment: utxo.token?.nft ? getAuthorityCommitmentHex(utxo) : undefined,
    }));

    const tokenChangeAmount =
      tokenType === 'FUNGIBLE_TOKEN' && totalTokenInputAmount > totalPoolOnChain
        ? totalTokenInputAmount - totalPoolOnChain
        : 0n;

    if (!stateTokenCategory) {
      throw new Error('Missing state token category for bounty funding output');
    }

    const preliminaryOutputs: TransactionOutput[] = [
      {
        to: contractAddress,
        amount: contractOutput.toString(),
        token: tokenType === 'FUNGIBLE_TOKEN'
          ? {
            category: tokenCategory!,
            amount: totalPoolOnChain.toString(),
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          }
          : {
            category: stateTokenCategory,
            amount: 0,
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          },
      },
    ];

    if (tokenType === 'FUNGIBLE_TOKEN' && authorityChangeOutput) {
      authorityChangeOutput.token!.amount = tokenChangeAmount.toString();
      preliminaryOutputs.push(authorityChangeOutput);
    }

    preliminaryOutputs.push({ to: creatorAddress, amount: '0' });

    const estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
    const bchBudgetAfterContractAndFee = totalInputValue - contractOutput - estimatedFee;
    const bchBudgetAfterTokenChange =
      tokenType === 'FUNGIBLE_TOKEN' ? bchBudgetAfterContractAndFee - dustAmount : bchBudgetAfterContractAndFee;

    if (bchBudgetAfterTokenChange < 0n) {
      throw new Error(
        'Insufficient BCH balance to cover outputs and fees for token funding transaction'
      );
    }

    const contractAndTokenOutputs: TransactionOutput[] = preliminaryOutputs.slice(0, -1);
    const outputs: TransactionOutput[] = [];

    if (bchBudgetAfterTokenChange > 546n) {
      outputs.push({
        to: creatorAddress,
        amount: bchBudgetAfterTokenChange.toString(),
      });
    }

    outputs.push(...contractAndTokenOutputs);

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: creatorAddress,
      inputs: sourceOutputs,
      outputs,
      userPrompt: `Fund bounty contract ${contractAddress}`,
      broadcast: false,
    });

    return {
      inputs: sourceOutputs,
      outputs,
      fee: Number(estimatedFee),
      txHex: JSON.stringify({ inputs: sourceOutputs, outputs, fee: estimatedFee.toString() }),
      sourceOutputs,
      requiredSignatures: [creatorAddress],
      wcTransaction,
    };
  }

  estimateFee(numInputs: number, numOutputs: number, outputs?: TransactionOutput[]): bigint {
    let outputBytes = 0;
    if (outputs) {
      for (const output of outputs) {
        let outSize = 8;
        if (output.token) {
          outSize += 34;
          if (output.token.nft?.commitment) {
            outSize += 1 + output.token.nft.commitment.length / 2;
          }
          if (output.token.amount && BigInt(output.token.amount) > 0n) {
            outSize += 9;
          }
        }
        outSize += 36;
        outputBytes += outSize;
      }
    } else {
      outputBytes = numOutputs * 36;
    }
    const estimatedSize = numInputs * 148 + outputBytes + 10;
    const feeRate = 2n;
    return BigInt(estimatedSize) * feeRate;
  }
}
