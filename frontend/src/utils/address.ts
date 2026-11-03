import { binToHex, decodeCashAddress } from '@bitauth/libauth';
import type { Network } from '../hooks/useNetwork';
import { formatAddress } from '../copy/format';
import { ADDRESS_KIND_ERRORS, addressErrors } from '../copy/network';

/** `address` takes any Bitcoin Cash address, `p2pkh` a regular wallet address, `token-aware` a token-ready one. */
export type AddressAccept = 'address' | 'p2pkh' | 'token-aware';

export type AddressCheck = { ok: true; display: string } | { ok: false; message: string };

const PREFIX: Record<Network, string> = { mainnet: 'bitcoincash', chipnet: 'bchtest' };
const OTHER_PREFIX: Record<Network, string> = { mainnet: 'bchtest', chipnet: 'bitcoincash' };
const BITCOIN_ADDRESS = /^(?:bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
const P2PKH_TYPES: ReadonlySet<string> = new Set(['p2pkh', 'p2pkhWithTokens']);
const TOKEN_TYPES: ReadonlySet<string> = new Set(['p2pkhWithTokens', 'p2shWithTokens']);

function withNetworkPrefix(lower: string, network: Network): string {
  return lower.includes(':') ? lower : `${PREFIX[network]}:${lower}`;
}

/** Checks an address against a network and the kind a form accepts, with the line to show when it fails. */
export function checkAddress(raw: string, network: Network, accept: AddressAccept = 'address'): AddressCheck {
  const value = raw.trim();
  if (BITCOIN_ADDRESS.test(value)) return { ok: false, message: ADDRESS_KIND_ERRORS.bitcoin };

  const lower = value.toLowerCase();
  if (lower.startsWith(`${OTHER_PREFIX[network]}:`)) return { ok: false, message: addressErrors(network).otherNetwork };

  const withPrefix = withNetworkPrefix(lower, network);
  const decoded = decodeCashAddress(withPrefix);
  if (typeof decoded === 'string' || decoded.prefix !== PREFIX[network]) {
    return { ok: false, message: addressErrors(network).notAnAddress };
  }
  if (accept === 'p2pkh' && !P2PKH_TYPES.has(decoded.type)) return { ok: false, message: ADDRESS_KIND_ERRORS.p2pkhOnly };
  if (accept === 'token-aware' && !TOKEN_TYPES.has(decoded.type)) return { ok: false, message: ADDRESS_KIND_ERRORS.tokenAware };
  return { ok: true, display: formatAddress(withPrefix, 'short') };
}

export function isValidAddress(raw: string, network: Network, accept: AddressAccept = 'address'): boolean {
  return raw.trim() !== '' && checkAddress(raw, network, accept).ok;
}

function walletPayload(address: string | null | undefined, network: Network): string {
  const value = (address ?? '').trim().toLowerCase();
  if (!value) return '';
  const decoded = decodeCashAddress(withNetworkPrefix(value, network));
  return typeof decoded === 'string' ? value : binToHex(decoded.payload);
}

/**
 * Two addresses belong to the same wallet when their decoded payloads match, so the prefix, its absence
 * and the token-ready form don't matter. Bare addresses are read with the given network's prefix.
 */
export function sameWallet(a: string | null | undefined, b: string | null | undefined, network: Network): boolean {
  const left = walletPayload(a, network);
  return left !== '' && left === walletPayload(b, network);
}
