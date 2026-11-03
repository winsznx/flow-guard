/**
 * OPTN Wallet Connector
 *
 * OPTN is a covenant-native BCH mobile wallet (Capacitor) that acts as a
 * WalletConnect v2 *wallet*. It advertises the same namespace FlowGuard already
 * requests — `bch:bitcoincash` / `bch:bchtest` with
 * `bch_getAddresses` / `bch_signMessage` / `bch_signTransaction` — and its
 * `bch_signTransaction` handler resolves CashScript covenant inputs by splicing a
 * Schnorr signature into the same placeholder byte patterns FlowGuard's builders
 * emit (`41` + 65 zero bytes for the signature, `21` + 33 zero bytes for the
 * pubkey). No new transport is needed: this connector is the WalletConnect v2
 * connector with OPTN-specific identity and capability metadata.
 *
 * @see https://github.com/BitcoinBay/OPTNWallet
 * @see docs/integrations/optn-phase1-testplan.md
 *
 * Known OPTN constraints (Phase 1 — to be confirmed empirically, then upstreamed):
 *
 *  1. Message signing is unusable for our login. OPTN's Bitcoin-signed-message
 *     magic writes the message length as raw hex rather than a CompactSize varint,
 *     so messages of 253 bytes or more (FlowGuard's CAIP-122 login block is ~380)
 *     produce a digest the server cannot reproduce. `supportsMessageSigning` is
 *     therefore `false` and `authFetch` uses the proof-transaction login instead.
 *
 *  2. OPTN signs with its FIRST derived address only. Any covenant action bound to
 *     a specific key (recurring-payment pause/resume/cancel checks
 *     `hash160(senderPubkey) == senderHash`) must be initiated by that same
 *     address, or the spend fails at the network rather than in the wallet.
 */

import { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
import { WalletType } from '../types/wallet';
import { flowFailure } from '../copy/errors';
import { PAIRING } from '../copy/wallets';

export class OptnConnector extends Web3ModalWalletConnectConnector {
  type: WalletType = WalletType.OPTN;

  protected pairingCopy = PAIRING.optn;

  /** See constraint 1 in the file header. */
  supportsMessageSigning = false;

  /**
   * Refuse message signing loudly instead of returning a signature the backend
   * will reject with an opaque 401. Login goes through the proof-transaction path
   * (`signCashScriptTransaction` + `/api/auth/verify-tx`), which `authFetch`
   * selects automatically from `supportsMessageSigning === false`.
   */
  async signMessage(): Promise<string> {
    throw flowFailure('SIGN_IN_FAILED', {
      details: 'OPTN signs in with a proof transaction. Message signing was requested instead.',
    });
  }
}
