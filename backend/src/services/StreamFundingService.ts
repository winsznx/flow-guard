/**
 * Stream Funding Service
 * Builds funding transactions for stream contracts
 */

import {
  ElectrumNetworkProvider,
  type WcTransactionObject,
} from 'cashscript';
import { buildFundingWcTransaction } from '../utils/wcFundingBuilder.js';
import { toNonNegativeBigInt } from '../utils/bigint.js';
import {
  getRequiredContractFundingSatoshis,
  getTokenOutputDustSatoshis,
} from '../utils/fundingConfig.js';
import {
  getAuthorityCommitmentHex,
  getTokenAmountFromUtxo,
  selectTokenFundingInputs,
} from '../utils/tokenMintAuthority.js';

export interface FundingTransactionParams {
  contractAddress: string;
  senderAddress: string;
  amount: number | string | bigint; // satoshis or token amount
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string; // hex-encoded 32-byte category ID
  nftCommitment: string; // hex-encoded NFT commitment
  nftCapability: 'minting' | 'mutable' | 'none';
  // Contract constructor params (from StreamDeploymentService)
  constructorParams?: {
    vaultId: string; // hex
    senderHash: string; // hex
    scheduleType: number;
    totalAmount: string; // bigint as string
    startTimestamp: string; // bigint as string
    endTimestamp: string; // bigint as string
    cliffTimestamp: string; // bigint as string
    stepInterval: string; // bigint as string
    stepAmount: string; // bigint as string
  };
}

export interface BatchFundingItem {
  contractAddress: string;
  amount: number | string | bigint;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  tokenCategory?: string;
  nftCommitment: string;
  nftCapability: 'minting' | 'mutable' | 'none';
}

export interface BatchFundingTransactionParams {
  senderAddress: string;
  items: BatchFundingItem[];
}

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

export interface UnsignedFundingTransaction {
  // Transaction parameters for frontend to build actual tx
  inputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
  }>;
  outputs: TransactionOutput[];
  fee: number;

  // Deprecated: will be removed once frontend uses inputs/outputs directly
  txHex: string; // Currently contains JSON-encoded transaction params
  sourceOutputs: Array<{
    txid: string;
    vout: number;
    satoshis: number;
    tokenCategory?: string;
    tokenAmount?: number | string;
    tokenNftCapability?: 'none' | 'mutable' | 'minting';
    tokenNftCommitment?: string;
  }>;
  requiredSignatures: string[]; // Addresses that need to sign
  wcTransaction: WcTransactionObject;
}

export class StreamFundingService {
  private provider: ElectrumNetworkProvider;
  private network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet';

  constructor(network: 'mainnet' | 'testnet3' | 'testnet4' | 'chipnet' = 'chipnet') {
    this.network = network;
    this.provider = new ElectrumNetworkProvider(network);
  }

  /**
   * Build a funding transaction for a stream contract
   *
   * This creates a transaction that:
   * 1. Takes UTXOs from sender's address
   * 2. Creates output to contract address with:
   *    - Required BCH amount (or dust if using tokens)
   *    - NFT with mutable capability and commitment
   *    - CashTokens if tokenType === 'FUNGIBLE_TOKEN'
   * 3. Returns change to sender
   *
   * The transaction is unsigned and must be signed by the sender's wallet
   */
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

    // For CashTokens, we need to find UTXOs with the right token category
    let selectedUtxos: typeof utxos = [];
    let totalInputValue = 0n;
    let totalTokenInputAmount = 0n;
    const dustAmount = getTokenOutputDustSatoshis(); // Minimum BCH for token outputs
    const amountOnChain = toNonNegativeBigInt(amount, 'amount');
    const contractOutput = getRequiredContractFundingSatoshis('stream', tokenType, amountOnChain);
    let stateTokenCategory: string | undefined = tokenCategory;
    let authorityChangeOutput: TransactionOutput | null = null;

    if (tokenType === 'FUNGIBLE_TOKEN') {
      if (!tokenCategory) {
        throw new Error('Token category required for FUNGIBLE_TOKEN type');
      }
      stateTokenCategory = tokenCategory;
      const selection = selectTokenFundingInputs(utxos, tokenCategory, amountOnChain, 'stream');
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

      const bchUtxos = utxos.filter((utxo: any) => !utxo.token);
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
        const requiredBch = (Number(requiredAmount()) / 1e8).toFixed(8);
        const availableBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${requiredBch} BCH, wallet has ${availableBch} BCH`,
        );
      }
    } else {
      const nonTokenUtxos = utxos.filter((utxo: any) => !utxo.token);
      const categoryAnchor = nonTokenUtxos.find((utxo: any) => utxo.vout === 0);
      if (!categoryAnchor) {
        throw new Error(
          'Cannot mint stream state NFT: sender wallet needs a spendable BCH UTXO with outpoint index 0',
        );
      }
      stateTokenCategory = categoryAnchor.txid;

      // BCH only - select UTXOs to cover amount + fees
      const requiredAmount = contractOutput + 2000n; // contract output + estimated fee

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

    // Prepare transaction parameters
    const sourceOutputs = selectedUtxos.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: Number(toNonNegativeBigInt(utxo.satoshis, 'source output satoshis')),
      tokenCategory: utxo.token?.category,
      tokenAmount: utxo.token?.amount !== undefined ? toNonNegativeBigInt(utxo.token.amount, 'source token amount').toString() : undefined,
      tokenNftCapability: utxo.token?.nft?.capability,
      tokenNftCommitment: utxo.token?.nft ? getAuthorityCommitmentHex(utxo) : undefined,
    }));

    // Calculate outputs
    const tokenChangeAmount =
      tokenType === 'FUNGIBLE_TOKEN' && totalTokenInputAmount > amountOnChain
        ? totalTokenInputAmount - amountOnChain
        : 0n;

    if (!stateTokenCategory) {
      throw new Error('Missing state token category for stream funding output');
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

    preliminaryOutputs.push({ to: senderAddress, amount: '0' });

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
        to: senderAddress,
        amount: bchBudgetAfterTokenChange.toString(),
      });
    }

    outputs.push(...contractAndTokenOutputs);

    // Return structured transaction parameters
    // Frontend must build and sign the actual raw transaction using these params
    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: senderAddress,
      inputs: sourceOutputs,
      outputs,
      userPrompt: `Fund stream contract ${contractAddress}`,
      broadcast: false,
    });

    return {
      inputs: sourceOutputs,
      outputs,
      fee: Number(estimatedFee),
      // Deprecated fields (for backwards compat):
      txHex: JSON.stringify({ inputs: sourceOutputs, outputs, fee: estimatedFee.toString() }),
      sourceOutputs,
      requiredSignatures: [senderAddress],
      wcTransaction,
    };
  }

  /**
   * Build one WalletConnect funding transaction for multiple BCH stream contracts.
   *
   * Current BCH/UTXO constraint:
   * - every contract state NFT is minted in the same transaction from a single
   *   zero-index BCH UTXO category anchor
   * - mixed-asset batch funding is rejected until token-authority handling is
   *   implemented for fungible CashToken streams
   */
  async buildBatchFundingTransaction(
    params: BatchFundingTransactionParams,
  ): Promise<UnsignedFundingTransaction> {
    const { senderAddress, items } = params;
    const dustAmount = getTokenOutputDustSatoshis();

    if (!items.length) {
      throw new Error('At least one batch funding item is required');
    }

    const firstTokenType = items[0].tokenType ?? 'BCH';
    const firstTokenCategory = items[0].tokenCategory ?? null;
    const hasMixedAssetType = items.some((item) => (item.tokenType ?? 'BCH') !== firstTokenType);
    const hasMixedTokenCategory = items.some(
      (item) => (item.tokenCategory ?? null) !== firstTokenCategory,
    );

    if (hasMixedAssetType || hasMixedTokenCategory) {
      throw new Error(
        'Batch stream funding currently requires one asset lane per batch. ' +
        'Create separate payroll runs for each asset or token category.',
      );
    }

    const utxos = await this.provider.getUtxos(senderAddress);
    if (!utxos || utxos.length === 0) {
      throw new Error(`No UTXOs found for address ${senderAddress}`);
    }

    const contractOutputs: TransactionOutput[] = [];
    let selectedUtxos: typeof utxos = [];
    let totalInputValue = 0n;
    let totalTokenInputAmount = 0n;
    let preliminaryOutputs: TransactionOutput[] = [];
    let estimatedFee = 0n;

    if (firstTokenType === 'BCH') {
      const nonTokenUtxos = utxos.filter((utxo: any) => !utxo.token);
      const categoryAnchor = nonTokenUtxos.find((utxo: any) => utxo.vout === 0);
      if (!categoryAnchor) {
        throw new Error(
          'Cannot mint batch stream state NFTs: sender wallet needs a spendable BCH UTXO with outpoint index 0',
        );
      }

      const stateTokenCategory = categoryAnchor.txid;
      for (const item of items) {
        const amountOnChain = toNonNegativeBigInt(item.amount, 'batch stream amount');
        const requiredSatoshis = getRequiredContractFundingSatoshis('stream', 'BCH', amountOnChain);
        contractOutputs.push({
          to: item.contractAddress,
          amount: requiredSatoshis.toString(),
          token: {
            category: stateTokenCategory,
            amount: 0,
            nft: {
              commitment: item.nftCommitment,
              capability: item.nftCapability,
            },
          },
        });
      }

      preliminaryOutputs = [...contractOutputs, { to: senderAddress, amount: '0' }];
      const orderedUtxos = [
        categoryAnchor,
        ...nonTokenUtxos.filter(
          (utxo: any) => utxo.txid !== categoryAnchor.txid || utxo.vout !== categoryAnchor.vout,
        ),
      ];

      const totalContractOutput = contractOutputs.reduce(
        (sum, output) => sum + toNonNegativeBigInt(output.amount, 'batch contract output'),
        0n,
      );

      const requiredAmount = () => totalContractOutput + estimatedFee;
      estimatedFee = this.estimateFee(1, preliminaryOutputs.length, preliminaryOutputs);

      for (const utxo of orderedUtxos) {
        selectedUtxos.push(utxo);
        totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'batch input satoshis');
        estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);

        if (totalInputValue >= requiredAmount()) {
          break;
        }
      }

      if (totalInputValue < requiredAmount()) {
        const requiredBch = (Number(requiredAmount()) / 1e8).toFixed(8);
        const availableBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${requiredBch} BCH, wallet has ${availableBch} BCH`,
        );
      }
    } else {
      const tokenCategory = firstTokenCategory;
      if (!tokenCategory) {
        throw new Error('CashToken batch lanes require a token category');
      }

      const totalRequiredTokenAmount = items.reduce(
        (sum, item) => sum + toNonNegativeBigInt(item.amount, 'batch token stream amount'),
        0n,
      );

      const selection = selectTokenFundingInputs(utxos, tokenCategory, totalRequiredTokenAmount, 'batch stream');
      selectedUtxos = [selection.authorityUtxo, ...selection.fungibleUtxos];
      totalInputValue = selection.totalInputSatoshis;
      totalTokenInputAmount = selection.totalTokenAmount;

      for (const item of items) {
        const amountOnChain = toNonNegativeBigInt(item.amount, 'batch token stream amount');
        const requiredSatoshis = getRequiredContractFundingSatoshis('stream', 'FUNGIBLE_TOKEN', amountOnChain);
        contractOutputs.push({
          to: item.contractAddress,
          amount: requiredSatoshis.toString(),
          token: {
            category: tokenCategory,
            amount: amountOnChain.toString(),
            nft: {
              commitment: item.nftCommitment,
              capability: item.nftCapability,
            },
          },
        });
      }

      const authorityOutput: TransactionOutput = {
        to: senderAddress,
        amount: dustAmount.toString(),
        token: {
          category: tokenCategory,
          amount: (totalTokenInputAmount - totalRequiredTokenAmount).toString(),
          nft: {
            capability: selection.authorityUtxo.token!.nft!.capability as 'none' | 'mutable' | 'minting',
            commitment: getAuthorityCommitmentHex(selection.authorityUtxo),
          },
        },
      };

      preliminaryOutputs = [...contractOutputs, authorityOutput, { to: senderAddress, amount: '0' }];
      estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
      const totalContractOutput = contractOutputs.reduce(
        (sum, output) => sum + toNonNegativeBigInt(output.amount, 'batch contract output'),
        0n,
      );
      const requiredAmount = () => totalContractOutput + dustAmount + estimatedFee;

      const bchUtxos = utxos.filter((utxo: any) => !utxo.token);
      if (totalInputValue < requiredAmount()) {
        for (const utxo of bchUtxos) {
          selectedUtxos.push(utxo);
          totalInputValue += toNonNegativeBigInt(utxo.satoshis, 'batch fee input satoshis');
          estimatedFee = this.estimateFee(selectedUtxos.length, preliminaryOutputs.length, preliminaryOutputs);
          if (totalInputValue >= requiredAmount()) {
            break;
          }
        }
      }

      if (totalInputValue < requiredAmount()) {
        const requiredBch = (Number(requiredAmount()) / 1e8).toFixed(8);
        const availableBch = (Number(totalInputValue) / 1e8).toFixed(8);
        throw new Error(
          `Insufficient BCH balance: need ${requiredBch} BCH, wallet has ${availableBch} BCH`,
        );
      }
    }

    const sourceOutputs = selectedUtxos.map((utxo: any) => ({
      txid: utxo.txid,
      vout: utxo.vout,
      satoshis: Number(toNonNegativeBigInt(utxo.satoshis, 'source output satoshis')),
      tokenCategory: utxo.token?.category,
      tokenAmount:
        utxo.token?.amount !== undefined
          ? toNonNegativeBigInt(utxo.token.amount, 'source token amount').toString()
          : undefined,
      tokenNftCapability: utxo.token?.nft?.capability,
      tokenNftCommitment: utxo.token?.nft ? getAuthorityCommitmentHex(utxo) : undefined,
    }));

    const totalContractOutput = contractOutputs.reduce(
      (sum, output) => sum + toNonNegativeBigInt(output.amount, 'batch contract output'),
      0n,
    );
    const nonBchReserved = firstTokenType === 'BCH' ? 0n : dustAmount;
    const changeAmount = totalInputValue - totalContractOutput - nonBchReserved - estimatedFee;
    const outputs: TransactionOutput[] = [];
    if (changeAmount > 546n) {
      outputs.push({
        to: senderAddress,
        amount: changeAmount.toString(),
      });
    }
    if (firstTokenType !== 'BCH') {
      outputs.push(preliminaryOutputs[contractOutputs.length]);
    }
    outputs.push(...contractOutputs);

    const wcTransaction = buildFundingWcTransaction({
      inputOwnerAddress: senderAddress,
      inputs: sourceOutputs,
      outputs,
      userPrompt: `Fund ${items.length} stream contracts`,
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

  /**
   * Estimate fee for funding transaction
   */
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
