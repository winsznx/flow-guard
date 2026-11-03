import type { TransactionBuilder, Utxo } from 'cashscript';
import { toTokenAwareAddress } from './tokenAddress.js';

const CANCEL_FEE_SATOSHIS = 4000n;
const TOKEN_REFUND_DUST_SATOSHIS = 1000n;

/**
 * Outputs for a V2 campaign cancel: output 0 returns the remaining pool to the
 * authority, output 1 returns the unused fee reserve to the same address, and the
 * contract pays the fee. The covenant counts only what's left after both as fee.
 */
export function addV2CampaignCancelOutputs(args: {
  txBuilder: TransactionBuilder;
  contractUtxo: Utxo;
  tokenType?: 'BCH' | 'FUNGIBLE_TOKEN';
  remainingPool: bigint;
  returnAddress: string;
}): void {
  const { txBuilder, contractUtxo, remainingPool, returnAddress } = args;
  const tokenCategory = contractUtxo.token?.category;
  const refundSatoshis = args.tokenType === 'FUNGIBLE_TOKEN' ? TOKEN_REFUND_DUST_SATOSHIS : remainingPool;

  if (args.tokenType === 'FUNGIBLE_TOKEN') {
    if (!tokenCategory) throw new Error('Cancel requires tokenized covenant UTXO with token category');
    txBuilder.addOutput({
      to: toTokenAwareAddress(returnAddress),
      amount: refundSatoshis,
      token: { category: tokenCategory, amount: remainingPool },
    });
  } else {
    if (remainingPool < 546n) throw new Error('Remaining BCH pool is below dust and cannot be cancelled');
    txBuilder.addOutput({ to: returnAddress, amount: refundSatoshis });
  }

  const leftover = contractUtxo.satoshis - refundSatoshis - CANCEL_FEE_SATOSHIS;
  if (leftover < 0n) {
    throw new Error('Contract balance is below remaining BCH pool; cannot build valid cancel transaction');
  }
  if (leftover > 546n) {
    txBuilder.addOutput({ to: returnAddress, amount: leftover });
  }
}
