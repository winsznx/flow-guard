import { binToHex } from '@bitauth/libauth';
import { toNonNegativeBigInt } from './bigint.js';

type TokenNftCapability = 'none' | 'mutable' | 'minting';

interface TokenUtxoLike {
  satoshis: bigint | number | string;
  token?: {
    category?: string;
    amount?: bigint | number | string;
    nft?: {
      capability?: TokenNftCapability;
      commitment?: string | Uint8Array;
    };
  };
}

export interface TokenFundingSelection<TUtxo extends TokenUtxoLike> {
  authorityUtxo: TUtxo;
  fungibleUtxos: TUtxo[];
  totalTokenAmount: bigint;
  totalInputSatoshis: bigint;
}

export function getTokenAmountFromUtxo(utxo: TokenUtxoLike): bigint {
  return toNonNegativeBigInt(utxo.token?.amount ?? 0n, 'token amount');
}

export function getAuthorityCommitmentHex(utxo: TokenUtxoLike): string {
  const commitment = utxo.token?.nft?.commitment;
  if (commitment instanceof Uint8Array) {
    return binToHex(commitment);
  }
  if (typeof commitment === 'string') {
    return commitment;
  }
  return '';
}

export function selectTokenFundingInputs<TUtxo extends TokenUtxoLike>(
  utxos: TUtxo[],
  tokenCategory: string,
  requiredTokenAmount: bigint,
  contextLabel: string,
): TokenFundingSelection<TUtxo> {
  const matchingCategoryUtxos = utxos.filter(
    (utxo) => utxo.token?.category === tokenCategory,
  );

  if (matchingCategoryUtxos.length === 0) {
    throw new Error(`No CashToken UTXOs found for category ${tokenCategory}`);
  }

  const authorityUtxo = matchingCategoryUtxos.find(
    (utxo) => utxo.token?.nft?.capability === 'minting',
  );

  if (!authorityUtxo) {
    // The contract keeps its state in an NFT of the token's own category, which only the
    // wallet holding the token's minting NFT can create.
    throw new Error(
      `To fund a ${contextLabel} in this token, use the wallet with permission to create the token, ` +
        'usually the wallet that created it. Or pay it in BCH.',
    );
  }

  const fungibleCandidates = matchingCategoryUtxos.filter(
    (utxo) => !utxo.token?.nft && getTokenAmountFromUtxo(utxo) > 0n,
  );

  const fungibleUtxos: TUtxo[] = [];
  let totalTokenAmount = getTokenAmountFromUtxo(authorityUtxo);
  let totalInputSatoshis = toNonNegativeBigInt(authorityUtxo.satoshis, 'authority input satoshis');

  for (const utxo of fungibleCandidates) {
    if (totalTokenAmount >= requiredTokenAmount) break;
    fungibleUtxos.push(utxo);
    totalTokenAmount += getTokenAmountFromUtxo(utxo);
    totalInputSatoshis += toNonNegativeBigInt(utxo.satoshis, 'fungible input satoshis');
  }

  if (totalTokenAmount < requiredTokenAmount) {
    throw new Error(
      `Insufficient token balance. Required: ${requiredTokenAmount.toString()}, Available: ${totalTokenAmount.toString()}`,
    );
  }

  return {
    authorityUtxo,
    fungibleUtxos,
    totalTokenAmount,
    totalInputSatoshis,
  };
}
