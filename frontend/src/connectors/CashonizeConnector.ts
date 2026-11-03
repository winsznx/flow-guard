/**
 * Cashonize connector. Cashonize is a web and phone BCH wallet that signs
 * contract transactions (sourceOutputs) over WalletConnect v2.
 * https://cashonize.com
 */

import type SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import type {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';
import { normalizeSignatureResponse } from '../utils/signature';
import { flowFailure, walletRequestFailure } from '../copy/errors';
import { PAIRING, WALLETS, WALLET_PROMPTS } from '../copy/wallets';
import { abandonPairing, getSignClient, isAbandonedPairing } from './signClient';
import { showPairingDialog } from './pairingDialog';

const PAIRING_TIMEOUT_MS = 120_000;
const CASHONIZE_WEB_URL = 'https://cashonize.com';

// WalletConnect Project ID - sourced exclusively from env. No hardcoded fallback.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

export class CashonizeConnector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType; // Uses WC protocol
  private client: SignClient | null = null;
  private session: SessionTypes.Struct | null = null;
  private currentAddress: string | null = null;
  private hidePairing: (() => void) | null = null;
  private cancelPairing: (() => void) | null = null;

  /**
   * Check if Cashonize is available (via WalletConnect)
   */
  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined';
  }

  /**
   * Check if currently connected
   */
  async isConnected(): Promise<boolean> {
    return this.session !== null && this.currentAddress !== null;
  }

  /**
   * Connect to Cashonize wallet via WalletConnect v2
   */
  async connect(): Promise<WalletInfo> {
    try {
      this.client = await this.initClient();

      const existing = await this.reuseExistingSession();
      if (existing) {
        return existing;
      }

      // Create new connection
      const network = import.meta.env.VITE_BCH_NETWORK || 'chipnet';
      const primaryChain = network === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';

      console.log(`[Cashonize] Requesting ${network} network`);

      const { uri, approval } = await this.client.connect({
        requiredNamespaces: {
          bch: {
            methods: ['bch_signTransaction', 'bch_signMessage', 'bch_getAddresses'],
            chains: [primaryChain],
            events: ['addressesChanged', 'disconnect'],
          },
        },
      });

      if (!uri) {
        throw flowFailure('RELAY_UNREACHABLE', { details: 'WalletConnect returned no pairing link.' });
      }

      this.session = await this.waitForApproval(uri, approval());
      console.log('[Cashonize] Session established');

      return await this.getSessionInfo();
    } catch (error) {
      console.error('[Cashonize] Connection error:', error);
      throw walletRequestFailure(error, 'transaction');
    } finally {
      this.closePairing();
    }
  }

  /**
   * Shows the pairing dialog and waits for Cashonize to approve. Closing the dialog
   * rejects with PAIRING_CANCELLED, so the picker is free again at once.
   */
  private async waitForApproval(
    uri: string,
    approval: Promise<SessionTypes.Struct>,
  ): Promise<SessionTypes.Struct> {
    approval.catch((error: unknown) => console.debug('[Cashonize] Pairing proposal ended:', error));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_, reject) => {
      this.cancelPairing = () => reject(flowFailure('PAIRING_CANCELLED'));
      timer = setTimeout(() => reject(flowFailure('PAIRING_TIMEOUT')), PAIRING_TIMEOUT_MS);
    });

    try {
      await this.showPairingDialog(uri);
      return await Promise.race([approval, stopped]);
    } catch (error) {
      if (this.client && isAbandonedPairing(error)) abandonPairing(this.client, uri, approval);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      this.cancelPairing = null;
    }
  }

  /**
   * Resume a stored WalletConnect session without prompting. Returns null when
   * none is stored, so a page load never opens the Cashonize QR.
   */
  async restore(): Promise<WalletInfo | null> {
    this.client = await this.initClient();
    return this.reuseExistingSession();
  }

  private async initClient(): Promise<SignClient> {
    console.log('[Cashonize] Initializing WalletConnect...');

    if (!WALLETCONNECT_PROJECT_ID) {
      throw flowFailure('MISCONFIGURED', { details: 'No WalletConnect project ID in this build.' });
    }

    return getSignClient(WALLETCONNECT_PROJECT_ID);
  }

  private async reuseExistingSession(): Promise<WalletInfo | null> {
    const sessions = this.client?.session.getAll() ?? [];
    if (sessions.length === 0) {
      return null;
    }

    console.log('[Cashonize] Found existing session');
    this.session = sessions[sessions.length - 1];
    return this.getSessionInfo();
  }

  /**
   * Disconnect from Cashonize
   */
  async disconnect(): Promise<void> {
    if (this.client && this.session) {
      try {
        await this.client.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: WALLET_PROMPTS.disconnected,
          },
        });
      } catch (error) {
        console.warn('[Cashonize] Disconnect error:', error);
      }
    }

    this.session = null;
    this.currentAddress = null;
    this.client = null;
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (this.currentAddress) return this.currentAddress;

    if (!this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    const addresses = await this.getAddresses();
    this.currentAddress = addresses[0];
    return this.currentAddress;
  }

  /**
   * Get public key
   */
  async getPublicKey(): Promise<string> {
    // Cashonize doesn't expose raw public key via WC2
    // For contract deployment, we'll use address derivation
    throw flowFailure('WALLET_UNSUPPORTED', { details: 'Cashonize does not share a public key over WalletConnect.' });
  }

  /**
   * Get wallet balance via backend API
   */
  async getBalance(): Promise<WalletBalance | null> {
    if (!this.currentAddress) {
      return null;
    }

    try {
      const response = await fetch(
        `/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`
      );
      if (!response.ok) {
        console.warn('[Cashonize] Balance API returned error:', response.status);
        return null;
      }
      const data = await response.json();
      return {
        sat: data.sat || 0,
        bch: data.bch || 0,
      };
    } catch (error) {
      console.error('[Cashonize] Failed to fetch balance:', error);
      return null;
    }
  }

  /**
   * Sign a simple transaction
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.client || !this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    await this.getAddress();

    try {
      // Build simple transaction request
      const request = {
        userPrompt: WALLET_PROMPTS.fund,
        broadcast: true,
        transaction: {
          outputs: [
            {
              to: tx.to,
              amount: tx.amount,
            },
          ],
        },
      };

      const result = (await this.client.request({
        topic: this.session.topic,
        chainId: this.getChainId(),
        request: {
          method: 'bch_signTransaction',
          params: request,
        },
      })) as any;

      return {
        txId: result.txid || result.signedTransactionHash,
        hex: result.signedTransaction || '',
      };
    } catch (error) {
      console.error('[Cashonize] Sign transaction error:', error);
      throw walletRequestFailure(error, 'transaction');
    }
  }

  /**
   * Sign a CashScript covenant transaction
   *
   * This is Cashonize's killer feature - native covenant signing
   */
  async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    try {
      console.log('[Cashonize] Signing CashScript transaction...');

      // Cashonize supports the bch_signTransaction method with sourceOutputs
      // for covenant transactions
      const request = {
        userPrompt: options.userPrompt || WALLET_PROMPTS.transaction,
        broadcast: options.broadcast !== false,
        transaction: options.transaction,
        sourceOutputs: options.sourceOutputs,
      };

      const result = (await this.client.request({
        topic: this.session.topic,
        chainId: this.getChainId(),
        request: {
          method: 'bch_signTransaction',
          params: request,
        },
      })) as any;

      console.log('[Cashonize] Covenant transaction signed successfully');

      return {
        signedTransaction: result.signedTransaction,
        signedTransactionHash: result.signedTransactionHash || result.txid,
      };
    } catch (error) {
      console.error('[Cashonize] CashScript sign error:', error);
      throw walletRequestFailure(error, 'transaction');
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    const address = await this.getAddress();

    try {
      const result = await this.client.request({
        topic: this.session.topic,
        chainId: this.getChainId(),
        request: {
          method: 'bch_signMessage',
          params: [
            {
              address,
              message,
              userPrompt: userPrompt || WALLET_PROMPTS.signInMessage,
            },
          ],
        },
      });

      return normalizeSignatureResponse(result);
    } catch (error) {
      console.error('[Cashonize] Sign message error:', error);
      throw walletRequestFailure(error, 'signIn');
    }
  }

  /**
   * Get session info as WalletInfo
   */
  private async getSessionInfo(): Promise<WalletInfo> {
    const address = await this.getAddress();
    const network = this.getNetworkFromChainId();

    return {
      address,
      publicKey: undefined,
      balance: await this.getBalance(),
      network,
    };
  }

  /**
   * Get all addresses from session
   */
  private async getAddresses(): Promise<string[]> {
    if (!this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    // Extract addresses from session namespaces
    const accounts = this.session.namespaces.bch?.accounts || [];
    return accounts.map((account: string) => account.split(':')[2]);
  }

  /**
   * Get chain ID for current network
   */
  private getChainId(): string {
    const network = import.meta.env.VITE_BCH_NETWORK || 'chipnet';
    return network === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';
  }

  /**
   * The network the session's account is on, read from its CAIP-10 prefix
   * (`bch:bitcoincash:` or `bch:bchtest:`). `chains` is optional in a session
   * namespace, so it's only a fallback. A session that names neither was approved
   * for the one chain this build requested.
   */
  private getNetworkFromChainId(): 'mainnet' | 'testnet' | 'chipnet' {
    const namespace = this.session?.namespaces.bch;
    const chainId = namespace?.accounts?.[0]?.split(':').slice(0, 2).join(':') || namespace?.chains?.[0];
    if (chainId === 'bch:bchtest') return 'chipnet';
    if (chainId === 'bch:bitcoincash') return 'mainnet';
    return this.getChainId() === 'bch:bchtest' ? 'chipnet' : 'mainnet';
  }

  private async showPairingDialog(uri: string): Promise<void> {
    const copy = PAIRING.cashonize;
    const cashonize = WALLETS.cashonize;
    this.hidePairing = showPairingDialog({
      title: copy.title,
      line: copy.line,
      qrValue: uri,
      qrCaption: copy.qrCaption,
      link: uri,
      steps: copy.steps,
      open: { label: copy.openLabel, href: `${CASHONIZE_WEB_URL}/?uri=${encodeURIComponent(uri)}` },
      get: cashonize.getUrl && cashonize.getLabel
        ? { prompt: copy.missing, label: cashonize.getLabel, href: cashonize.getUrl }
        : undefined,
      onClose: () => this.cancelPairing?.(),
    });
  }

  private closePairing(): void {
    this.hidePairing?.();
    this.hidePairing = null;
  }
}
