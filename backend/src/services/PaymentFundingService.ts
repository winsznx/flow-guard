/**
 * Payment Funding Service
 * Builds funding transactions for recurring payment contracts
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

export interface FundingTransactionParams {
  contractAddress: string;
  senderAddress: string;
  amount: number | string | bigint; // satoshis or token amount
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
  txHex: string; // JSON-encoded params
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

export class PaymentFundingService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  async buildFundingTransaction(params: FundingTransactionParams): Promise<UnsignedFundingTransaction> {
    const {
      contractAddress,
      senderAddress,
      amount,
      tokenType,
      tokenCategory,
      nftCommitment,
      nftCapability,
    } = params;

    // Get UTXOs for sender
    const utxos = await this.provider.getUtxos(senderAddress);

    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${senderAddress}`);
    }

    let selectedUtxos: typeof utxos = [];
    let totalInputValue = 0n;
    let totalTokenInputAmount = 0n;
    const dustAmount = getTokenOutputDustSatoshis();
    const amountOnChain = toNonNegativeBigInt(amount, 'amount');
    const contractOutput = getRequiredContractFundingSatoshis('payment', tokenType, amountOnChain);
    let stateTokenCategory: string | undefined = tokenCategory;
    let authorityChangeOutput: TransactionOutput | null = null;

    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory) {
        throw new Error('Token category required for FUNGIBLE_TOKEN type');
      }
      stateTokenCategory = tokenCategory;
      const selection = selectTokenFundingInputs(utxos, tokenCategory, amountOnChain, 'payment');
      selectedUtxos = [selection.authorityUtxo, ...selection.fungibleUtxos];
      totalTokenInputAmount = selection.totalTokenAmount;
      totalInputValue = selection.totalInputSatoshis;
      authorityChangeOutput = {
        to: senderAddress,
        amount: dustAmount.toString(),
        token: {
          category: tokenCategory,
          amount: (selection.totalTokenAmount - amountOnChain).toString(),
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
            amount: amountOnChain.toString(),
            nft: {
              commitment: nftCommitment,
              capability: nftCapability,
            },
          },
        },
        authorityChangeOutput,
        { to: senderAddress, amount: '0' },
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
          'Cannot mint payment state NFT: sender wallet needs a spendable BCH UTXO with outpoint index 0',
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
      tokenType === 'FUNGIBLE_TOKEN' && totalTokenInputAmount > amountOnChain
        ? totalTokenInputAmount - amountOnChain
        : 0n;

    if (!stateTokenCategory) {
      throw new Error('Missing state token category for payment funding output');
    }

    const preliminaryOutputs: TransactionOutput[] = [
      {
        to: contractAddress,
        amount: contractOutput.toString(),
        token: tokenType === 'FUNGIBLE_TOKEN'
          ? {
            category: tokenCategory!,
            amount: amountOnChain.toString(),
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

    // Add a placeholder change output for fee estimation
    preliminaryOutputs.push({ to: senderAddress, amount: '0' });

    const estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
    const bchBudgetAfterContractAndFee = totalInputValue - contractOutput - estimatedFee;
    const bchBudgetAfterTokenChange =
      tokenType === 'FUNGIBLE_TOKEN' ? bchBudgetAfterContractAndFee - dustAmount : bchBudgetAfterContractAndFee;

    if (bchBudgetAfterTokenChange < 0n) {
      const neededBch = (Number(contractOutput + estimatedFee + (tokenChangeAmount > 0n ? dustAmount : 0n)) / 1e8).toFixed(8);
      const haveBch = (Number(totalInputValue) / 1e8).toFixed(8);
      throw new Error(
        `Insufficient BCH balance: need ${neededBch} BCH, wallet has ${haveBch} BCH`
      );
    }

    // Build final outputs: put BCH change FIRST at index 0 so the user retains
    // a vout=0 UTXO for future CashTokens genesis transactions.
    const contractAndTokenOutputs: TransactionOutput[] = preliminaryOutputs.slice(0, -1);
    const outputs: TransactionOutput[] = [];

    if (bchBudgetAfterTokenChange > 546n) {
      outputs.push({
        to: senderAddress,
        amount: bchBudgetAfterTokenChange.toString(),
      });
    }

    outputs.push(...contractAndTokenOutputs);

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: senderAddress,
      inputs: sourceOutputs,
      outputs,
      userPrompt: `Fund recurring payment contract ${contractAddress}`,
      broadcast: false,
    });

    return {
      inputs: sourceOutputs,
      outputs,
      fee: Number(estimatedFee),
      txHex: JSON.stringify({ inputs: sourceOutputs, outputs, fee: estimatedFee.toString() }),
      sourceOutputs,
      requiredSignatures: [senderAddress],
      wcTransaction,
    };
  }

  estimateFee(numInputs: number, numOutputs: number, outputs?: TransactionOutput[]): bigint {
    let outputBytes = 0;
    if (outputs) {
      for (const output of outputs) {
        let outSize = 8; // valueSatoshis
        if (output.token) {
          // Token prefix: 1 (prefix byte) + 32 (category) + 1 (bitfield)
          outSize += 34;
          if (output.token.nft?.commitment) {
            // commitment length varint + commitment bytes
            const commitmentLen = output.token.nft.commitment.length / 2;
            outSize += 1 + commitmentLen;
          }
          if (output.token.amount && BigInt(output.token.amount) > 0n) {
            outSize += 9; // compact uint for fungible amount
          }
        }
        // P2PKH = 26 bytes, P2SH-20 = 24 bytes, P2SH-32 = 36 bytes
        // Use 36 as safe upper bound for locking bytecode + its length prefix
        outSize += 36;
        outputBytes += outSize;
      }
    } else {
      outputBytes = numOutputs * 36;
    }
    const estimatedSize = numInputs * 148 + outputBytes + 10;
    const feeRate = 2n; // 2 sat/byte for safety margin
    return BigInt(estimatedSize) * feeRate;
  }
}
