/**
 * Cashonize Wallet Connector
 *
 * Cashonize is a CashScript-aware BCH wallet that supports covenant transactions.
 * It uses WalletConnect v2 protocol but provides enhanced CashScript signing capabilities.
 *
 * Features:
 * - Native CashScript transaction signing
 * - Covenant unlock script support
 * - CashTokens support (fungible & NFTs)
 * - Mobile wallet via WalletConnect v2
 *
 * Installation: https://cashonize.com
 */

import SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import QRCode from 'qrcode';
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

const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '2cce9f0a8e5f0f8e88f6d5a5e4f3e2d1';

export class CashonizeConnector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType; // Uses WC protocol
  private client: SignClient | null = null;
  private session: SessionTypes.Struct | null = null;
  private currentAddress: string | null = null;
  private qrModal: HTMLDivElement | null = null;

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
      console.log('[Cashonize] Initializing WalletConnect...');

      if (!WALLETCONNECT_PROJECT_ID || WALLETCONNECT_PROJECT_ID === 'demo-project-id') {
        throw new Error(
          'WalletConnect requires a project ID. Get one free at https://cloud.walletconnect.com\n' +
            'Then add to .env.local: VITE_WALLETCONNECT_PROJECT_ID=your-id'
        );
      }

      // Initialize SignClient
      this.client = await SignClient.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        metadata: {
          name: 'FlowGuard',
          description: 'BCH-native treasuries, streams, payments, and governance',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.svg`],
        },
      });

      // Check for existing sessions
      const sessions = this.client.session.getAll();
      if (sessions.length > 0) {
        console.log('[Cashonize] Found existing session');
        this.session = sessions[sessions.length - 1] as any;
        return await this.getSessionInfo();
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
        throw new Error('Failed to generate WalletConnect URI');
      }

      // Show Cashonize-specific QR code modal
      await this.showCashonizeQRModal(uri);

      // Wait for approval
      const approvalTimeout = new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error('Connection timeout - please scan QR code with Cashonize')),
          120000
        );
      });

      this.session = (await Promise.race([approval(), approvalTimeout])) as SessionTypes.Struct;
      this.hideQRModal();

      console.log('[Cashonize] Session established');

      return await this.getSessionInfo();
    } catch (error: any) {
      this.hideQRModal();
      console.error('[Cashonize] Connection error:', error);

      if (error.message?.includes('timeout')) {
        throw new Error(
          'Connection timeout. Please:\n\n' +
            '1. Open Cashonize app on your mobile device\n' +
            '2. Tap the scan icon\n' +
            '3. Scan the QR code\n\n' +
            'Download: https://cashonize.com'
        );
      }

      throw error;
    }
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
            message: 'User disconnected',
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
      throw new Error('Cashonize not connected');
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
    throw new Error('Public key not available via WalletConnect');
  }

  /**
   * Get wallet balance via backend API
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.currentAddress) {
      return { bch: 0, sat: 0 };
    }

    try {
      const response = await fetch(
        `/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`
      );
      if (!response.ok) {
        console.warn('[Cashonize] Balance API returned error:', response.status);
        return { bch: 0, sat: 0 };
      }
      const data = await response.json();
      return {
        sat: data.sat || 0,
        bch: data.bch || 0,
      };
    } catch (error) {
      console.error('[Cashonize] Failed to fetch balance:', error);
      return { bch: 0, sat: 0 };
    }
  }

  /**
   * Sign a simple transaction
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.client || !this.session) {
      throw new Error('Cashonize not connected');
    }

    const address = await this.getAddress();

    try {
      // Build simple transaction request
      const request = {
        userPrompt: 'Sign transaction to fund contract',
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
    } catch (error: any) {
      console.error('[Cashonize] Sign transaction error:', error);
      throw new Error(`Failed to sign transaction: ${error.message}`);
    }
  }

  /**
   * Sign a CashScript covenant transaction
   *
   * This is Cashonize's killer feature - native covenant signing
   */
  async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw new Error('Cashonize not connected');
    }

    try {
      console.log('[Cashonize] Signing CashScript transaction...');

      // Cashonize supports the bch_signTransaction method with sourceOutputs
      // for covenant transactions
      const request = {
        userPrompt: options.userPrompt || 'Sign contract transaction',
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
    } catch (error: any) {
      console.error('[Cashonize] CashScript sign error:', error);
      throw new Error(`Failed to sign covenant transaction: ${error.message}`);
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw new Error('Cashonize not connected');
    }

    const address = await this.getAddress();

    try {
      const result = (await this.client.request({
        topic: this.session.topic,
        chainId: this.getChainId(),
        request: {
          method: 'bch_signMessage',
          params: [
            {
              address,
              message,
              userPrompt: userPrompt || 'Sign message',
            },
          ],
        },
      })) as any;

      return result.signature;
    } catch (error: any) {
      console.error('[Cashonize] Sign message error:', error);
      throw new Error(`Failed to sign message: ${error.message}`);
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
      throw new Error('No session');
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
   * Get network from chain ID
   */
  private getNetworkFromChainId(): 'mainnet' | 'testnet' | 'chipnet' {
    const chainId = this.session?.namespaces.bch?.chains?.[0];
    if (chainId?.includes('bchtest')) return 'chipnet';
    if (chainId?.includes('bitcoincash')) return 'mainnet';
    return 'chipnet';
  }

  /**
   * Show Cashonize-branded QR code modal
   */
  private async showCashonizeQRModal(uri: string): Promise<void> {
    // Create modal
    this.qrModal = document.createElement('div');
    this.qrModal.className =
      'fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm';

    // Generate QR code
    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    });

    this.qrModal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
        <div class="text-center mb-4">
          <h3 class="text-xl font-semibold text-gray-900 mb-2">Connect with Cashonize</h3>
          <p class="text-sm text-gray-600">
            Scan this QR code with your Cashonize mobile app
          </p>
        </div>

        <div class="bg-white p-4 rounded-lg border-2 border-gray-200 mb-4">
          <img src="${qrDataUrl}" alt="QR Code" class="w-full" />
        </div>

        <div class="space-y-3">
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">1</div>
            <span>Open Cashonize app on your phone</span>
          </div>
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">2</div>
            <span>Tap the scan icon</span>
          </div>
          <div class="flex items-center gap-2 text-sm text-gray-600">
            <div class="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0">3</div>
            <span>Scan this QR code</span>
          </div>
        </div>

        <div class="mt-6 pt-4 border-t border-gray-200">
          <p class="text-xs text-gray-500 text-center">
            Don't have Cashonize?
            <a href="https://cashonize.com" target="_blank" rel="noopener" class="text-blue-600 hover:underline">
              Download here
            </a>
          </p>
        </div>

        <button
          onclick="this.closest('.fixed').remove()"
          class="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.qrModal);
  }

  /**
   * Hide QR code modal
   */
  private hideQRModal(): void {
    if (this.qrModal && this.qrModal.parentNode) {
      this.qrModal.parentNode.removeChild(this.qrModal);
      this.qrModal = null;
    }
  }
}
