/**
 * Token ID checks for the create forms. A token ID is the ID of the transaction that
 * created the token, so the check looks that transaction up on the configured network.
 */

import { ElectrumNetworkProvider } from 'cashscript';
import { TRANSACTION_NOT_FOUND_PATTERN } from './walletErrorPatterns';
import { rawErrorText } from '../copy/errors';

const TOKEN_ID_PATTERN = /^[0-9a-fA-F]{64}$/;

/** Why a token ID didn't pass, so a form can say "check the ID" or "try again in a minute". */
export type TokenCheck = { ok: true } | { ok: false; reason: 'format' | 'not_found' | 'unavailable' };

export async function checkTokenCategory(
  tokenCategory: string,
  network: 'chipnet' | 'mainnet' = 'chipnet',
): Promise<TokenCheck> {
  if (!TOKEN_ID_PATTERN.test(tokenCategory ?? '')) return { ok: false, reason: 'format' };

  try {
    const provider = new ElectrumNetworkProvider(network);
    const txData = await provider.getRawTransaction(tokenCategory);
    return txData ? { ok: true } : { ok: false, reason: 'not_found' };
  } catch (error) {
    console.error(`Token ID ${tokenCategory} check on ${network} failed:`, error);
    const notFound = TRANSACTION_NOT_FOUND_PATTERN.test(rawErrorText(error) ?? '');
    return { ok: false, reason: notFound ? 'not_found' : 'unavailable' };
  }
}

/** True when the token ID has the right format and its transaction exists on `network`. */
export async function validateTokenCategory(
  tokenCategory: string,
  network: 'chipnet' | 'mainnet' = 'chipnet',
): Promise<boolean> {
  return (await checkTokenCategory(tokenCategory, network)).ok;
}
