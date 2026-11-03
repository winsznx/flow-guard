import { decodeCashAddress, encodeCashAddress } from '@bitauth/libauth';

/**
 * Token-aware form of a cash address. It locks to the same script, but CashScript's
 * TransactionBuilder refuses a token output sent to the plain form, which is what
 * wallets connect with.
 */
export function toTokenAwareAddress(address: string): string {
  const decoded = decodeCashAddress(address);
  if (typeof decoded === 'string') throw new Error(decoded);
  if (decoded.type === 'p2pkhWithTokens' || decoded.type === 'p2shWithTokens') return address;
  const tokenType = decoded.type === 'p2sh' ? 'p2shWithTokens' : 'p2pkhWithTokens';
  return encodeCashAddress({ prefix: decoded.prefix, type: tokenType, payload: decoded.payload }).address;
}
