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

// WalletConnect Project ID - sourced exclusively from env. No hardcoded fallback.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

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

      if (!WALLETCONNECT_PROJECT_ID) {
        throw new Error(
          'WalletConnect requires a project ID. Get one free at https://cloud.walletconnect.com\n' +
            'Then add to .env.local: VITE_WALLETCONNECT_PROJECT_ID=your-id'
        );
      }

      // Initialize SignClient
      this.client = await SignClient.init({
        projectId: WALLETCONNECT_PROJECT_ID!,
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

    // Audit H-09: build the modal with createElement + textContent rather than
    // innerHTML template strings. The qrDataUrl is currently library-derived
    // and safe, but the previous shape would silently become an HTML-injection
    // sink the moment any field flowed in from a remote signing service.
    const modalRoot = document.createElement('div');
    modalRoot.className = 'bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 relative';

    const header = document.createElement('div');
    header.className = 'text-center mb-4';
    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold text-gray-900 mb-2';
    title.textContent = 'Connect with Cashonize';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-gray-600';
    subtitle.textContent = 'Scan this QR code with your Cashonize mobile app';
    header.append(title, subtitle);

    const qrWrapper = document.createElement('div');
    qrWrapper.className = 'bg-white p-4 rounded-lg border-2 border-gray-200 mb-4';
    const qrImg = document.createElement('img');
    qrImg.src = qrDataUrl;
    qrImg.alt = 'QR Code';
    qrImg.className = 'w-full';
    qrWrapper.appendChild(qrImg);

    const stepsWrapper = document.createElement('div');
    stepsWrapper.className = 'space-y-3';
    const steps = [
      'Open Cashonize app on your phone',
      'Tap the scan icon',
      'Scan this QR code',
    ];
    steps.forEach((label, i) => {
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2 text-sm text-gray-600';
      const badge = document.createElement('div');
      badge.className =
        'w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold flex-shrink-0';
      badge.textContent = String(i + 1);
      const text = document.createElement('span');
      text.textContent = label;
      row.append(badge, text);
      stepsWrapper.appendChild(row);
    });

    const footer = document.createElement('div');
    footer.className = 'mt-6 pt-4 border-t border-gray-200';
    const footerCopy = document.createElement('p');
    footerCopy.className = 'text-xs text-gray-500 text-center';
    footerCopy.append('Don\'t have Cashonize? ');
    const downloadLink = document.createElement('a');
    downloadLink.href = 'https://cashonize.com';
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.className = 'text-blue-600 hover:underline';
    downloadLink.textContent = 'Download here';
    footerCopy.appendChild(downloadLink);
    footer.appendChild(footerCopy);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'absolute top-4 right-4 text-gray-400 hover:text-gray-600';
    closeBtn.setAttribute('aria-label', 'Close');
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.setAttribute('class', 'w-6 h-6');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('d', 'M6 18L18 6M6 6l12 12');
    svg.appendChild(path);
    closeBtn.appendChild(svg);
    closeBtn.addEventListener('click', () => this.hideQRModal());

    modalRoot.append(header, qrWrapper, stepsWrapper, footer, closeBtn);

    // Replace any prior content atomically
    while (this.qrModal.firstChild) this.qrModal.removeChild(this.qrModal.firstChild);
    this.qrModal.appendChild(modalRoot);

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
