/**
 * Wallet connectors for FlowGuard, based on the BCH reference implementations
 * https://github.com/mainnet-pat/dapp-starter and https://github.com/mainnet-pat/wc2-bch-bcr.
 *
 * 1. Paytaca extension (window.paytaca)
 * 2. Cashonize (WalletConnect v2, web or phone)
 * 3. WalletConnect v2 (Paytaca phone, Zapit, Selene and others)
 * 4. WizardConnect (NIP-17 transport, beta, Paytaca phone only)
 * 5. OPTN (WalletConnect v2, beta)
 */

export { PaytacaNativeConnector } from './PaytacaNativeConnector';
export { CashonizeConnector } from './CashonizeConnector';
export { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
export { WizardConnectConnector } from './WizardConnectConnector';
export { OptnConnector } from './OptnConnector';

import type { IWalletConnector, WalletInfo, WalletType } from '../types/wallet';
import { PaytacaNativeConnector } from './PaytacaNativeConnector';
import { CashonizeConnector } from './CashonizeConnector';
import { Web3ModalWalletConnectConnector } from './Web3ModalWalletConnectConnector';
import { WizardConnectConnector } from './WizardConnectConnector';
import { OptnConnector } from './OptnConnector';
import { flowFailure } from '../copy/errors';
import { UNKNOWN_WALLET_NAME, WALLETS } from '../copy/wallets';

/**
 * Feature flag for WizardConnect. Defaults to disabled because the protocol
 * is pre-1.0 with active churn and only one production wallet today.
 *
 * Enable with: VITE_ENABLE_WIZARDCONNECT=true (in frontend/.env.local)
 */
export function isWizardConnectEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_WIZARDCONNECT === 'true';
}

/**
 * Feature flag for OPTN Wallet. Defaults to disabled: the pairing is wire-compatible
 * on paper (same WalletConnect v2 namespace, same covenant placeholder handling) but
 * unproven end to end, and OPTN signs with its first derived address only. Keep it
 * off in production until the Phase 1 compatibility run produces mainnet txids.
 *
 * Enable with: VITE_ENABLE_OPTN=true (in frontend/.env.local)
 *
 * @see docs/integrations/optn-phase1-testplan.md
 */
export function isOptnEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_OPTN === 'true';
}

/** A connector that can also resume a stored session without prompting the user. */
export interface RestorableWalletConnector extends IWalletConnector {
  restore(): Promise<WalletInfo | null>;
}

/**
 * Factory function to create wallet connector by type
 *
 * @param type - Wallet type
 * @returns IWalletConnector implementation for the specified wallet type
 *
 * @example
 * ```typescript
 * const connector = createWalletConnector('cashonize');
 * await connector.connect();
 * const address = await connector.getAddress();
 * ```
 */
export function createWalletConnector(type: WalletType): RestorableWalletConnector {
  switch (type) {
    case 'paytaca':
      return new PaytacaNativeConnector();

    case 'cashonize':
      return new CashonizeConnector();

    case 'walletconnect':
      return new Web3ModalWalletConnectConnector();

    case 'wizardconnect':
      if (!isWizardConnectEnabled()) {
        throw flowFailure('WALLET_UNSUPPORTED', { details: 'WizardConnect is turned off in this build.' });
      }
      return new WizardConnectConnector();

    case 'optn':
      if (!isOptnEnabled()) {
        throw flowFailure('WALLET_UNSUPPORTED', { details: 'OPTN is turned off in this build.' });
      }
      return new OptnConnector();

    default:
      throw flowFailure('WALLET_UNSUPPORTED', { details: `Saved wallet type ${String(type)} isn't supported.` });
  }
}

/**
 * Resume a saved wallet without showing a QR code or extension prompt.
 * Resolves to null when the wallet has no session that can be resumed silently.
 */
export async function restoreWalletConnector(
  type: WalletType,
): Promise<{ connector: IWalletConnector; info: WalletInfo } | null> {
  const connector = createWalletConnector(type);
  const info = await connector.restore();
  return info ? { connector, info } : null;
}

function isWalletType(type: string): type is WalletType {
  return Object.prototype.hasOwnProperty.call(WALLETS, type);
}

/** The wallet's name, from the registry in copy/wallets.ts. */
export function getWalletDisplayName(type: WalletType | string | null | undefined): string {
  return type && isWalletType(type) ? WALLETS[type].name : UNKNOWN_WALLET_NAME;
}

/** The wallet's one-line picker description, from the registry in copy/wallets.ts. */
export function getWalletDescription(type: WalletType): string {
  return WALLETS[type].line;
}

/** Where to get the wallet, when it has a download page. */
export function getInstallationUrl(type: WalletType): string | null {
  return WALLETS[type].getUrl ?? null;
}
