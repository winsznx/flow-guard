/**
 * WalletConnect v2 Connector for BCH
 *
 * Supports Zapit, Cashonize, and other WC2-compatible BCH wallets
 * Based on WC2 BCH BCR specification: https://github.com/mainnet-pat/wc2-bch-bcr
 */

import SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import QRCode from 'qrcode';
import { stringify } from '@bitauth/libauth';
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

// WalletConnect Cloud project ID (free tier)
// Get yours at: https://cloud.walletconnect.com
const WALLETCONNECT_PROJECT_ID =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '2cce9f0a8e5f0f8e88f6d5a5e4f3e2d1';

export class WalletConnectConnector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType;
  private client: SignClient | null = null;
  private eventsActive = true;
  private session: SessionTypes.Struct | null = null;
  private currentAddress: string | null = null;

  /**
   * Check if WalletConnect is available
   */
  async isAvailable(): Promise<boolean> {
    // WalletConnect works in all modern browsers
    return typeof window !== 'undefined';
  }

  /**
   * Connect via WalletConnect v2
   */
  async connect(): Promise<WalletInfo> {
    try {
      console.log('Initializing WalletConnect SignClient...');
      console.log('Project ID:', WALLETCONNECT_PROJECT_ID);

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

      console.log('SignClient initialized');

      // Check for existing sessions
      const sessions = this.client.session.getAll();
      if (sessions.length > 0) {
        console.log('Found existing session, reusing...');
        this.session = sessions[sessions.length - 1] as any;
        return await this.getSessionInfo();
      }

      // Create new connection
      console.log('Creating new session...');

      // Get network from environment (chipnet by default for testing)
      const network = import.meta.env.VITE_BCH_NETWORK || 'chipnet';
      const primaryChain = network === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';

      console.log(`Requesting ${network} network (chain: ${primaryChain})`);

      const { uri, approval } = await this.client.connect({
        // Use requiredNamespaces to force specific network
        requiredNamespaces: {
          bch: {
            methods: ['bch_signTransaction', 'bch_signMessage', 'bch_getAddresses'],
            chains: [primaryChain], // Force chipnet or mainnet based on VITE_BCH_NETWORK
            events: ['addressesChanged', 'disconnect'],
          },
        },
      });

      if (!uri) {
        throw new Error('Failed to generate WalletConnect URI');
      }

      // Show QR code in modal
      console.log('WalletConnect URI generated, showing QR code...');
      await this.showQRCodeModal(uri);

      // Wait for wallet to connect (with timeout)
      console.log('Waiting for wallet approval...');
      const approvalTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout - please try again')), 120000); // 2 minutes
      });

      this.session = (await Promise.race([approval(), approvalTimeout])) as SessionTypes.Struct;
      this.hideQRCodeModal();

      console.log('Session approved:', this.session);

      return await this.getSessionInfo();
    } catch (error: any) {
      this.hideQRCodeModal();
      console.error('WalletConnect connection error:', error);

      if (error.message.includes('No matching key')) {
        throw new Error(
          'No BCH wallet connected. Please make sure you have Zapit or Cashonize installed on your mobile device.'
        );
      }

      if (error.message.includes('Connection timeout')) {
        throw new Error(
          'Connection timeout. Possible issues:\n\n' +
            '1. Wallet app not responding\n' +
            '2. Network/firewall blocking WalletConnect\n' +
            '3. Use Paytaca extension (desktop) or Testing Wallet instead'
        );
      }

      // WebSocket connection failures
      if (error.message?.includes('WebSocket') || error.toString().includes('WebSocket')) {
        throw new Error(
          'Cannot connect to WalletConnect relay.\n\n' +
            'This might be due to:\n' +
            '- Network/firewall blocking websockets\n' +
            '- VPN/proxy interference\n\n' +
            'Try:\n' +
            '1. Use Paytaca extension (easier for desktop)\n' +
            '2. Or use Testing Wallet option\n\n' +
            'See WALLET_CONNECTION_FIX.md for help'
        );
      }

      throw new Error(`WalletConnect failed: ${error.message}`);
    }
  }

  /**
   * Extract wallet info from session
   */
  private async getSessionInfo(): Promise<WalletInfo> {
    if (!this.session) {
      throw new Error('No active session');
    }

    // Get BCH accounts from session
    const bchNamespace = this.session.namespaces.bch;
    if (!bchNamespace || !bchNamespace.accounts || bchNamespace.accounts.length === 0) {
      throw new Error('No BCH accounts in session');
    }

    // Format: bch:bitcoincash:qr... or bch:bchtest:qr...
    const accountString = bchNamespace.accounts[0];
    const [, chain, address] = accountString.split(':');

    this.currentAddress = `${chain}:${address}`;

    // Determine network from chain
    const network = chain === 'bchtest' ? 'chipnet' : 'mainnet';

    // Fetch balance from blockchain
    const balance = await this.getBalance();

    return {
      address: this.currentAddress,
      network,
      balance,
    };
  }

  /**
   * Show QR code modal
   */
  private async showQRCodeModal(uri: string): Promise<void> {
    // Create a simple modal with QR code
    const modal = document.createElement('div');
    modal.id = 'wc-qr-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    modal.innerHTML = `
      <div style="
        background: white;
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        text-align: center;
      ">
        <h2 style="margin: 0 0 16px 0; color: #1a1a1a;">Scan with Zapit or Cashonize</h2>
        <div id="wc-qr-code" style="padding: 16px; background: white; border-radius: 8px;"></div>
        <p style="margin: 16px 0 0 0; color: #666; font-size: 14px;">
          Open your mobile BCH wallet and scan the QR code
        </p>
        <button id="wc-close-btn" style="
          margin-top: 16px;
          padding: 8px 24px;
          background: #f0f0f0;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        ">Cancel</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Generate QR code using QRCode library
    await this.renderQRCode(uri, 'wc-qr-code');

    // Close button
    document.getElementById('wc-close-btn')?.addEventListener('click', () => {
      this.hideQRCodeModal();
      if (this.client) {
        // Cancel connection attempt
        this.client
          .disconnect({
            topic: '',
            reason: { code: 6000, message: 'User cancelled' },
          })
          .catch(console.error);
      }
    });
  }

  /**
   * Hide QR code modal
   */
  private hideQRCodeModal(): void {
    const modal = document.getElementById('wc-qr-modal');
    if (modal) {
      modal.remove();
    }
  }

  /**
   * Render QR code
   */
  private async renderQRCode(uri: string, elementId: string): Promise<void> {
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      // Create canvas for QR code
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, uri, {
        width: 280,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });

      element.innerHTML = '';
      element.appendChild(canvas);

      // Add copy URI button
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy URI';
      copyBtn.style.cssText = `
        margin-top: 12px;
        padding: 8px 16px;
        background: #f0f0f0;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
      `;
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(uri);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
          copyBtn.textContent = 'Copy URI';
        }, 2000);
      };
      element.appendChild(copyBtn);
    } catch (error) {
      console.error('QR code generation error:', error);
      // Fallback to showing URI text
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'padding: 16px; background: #f9f9f9; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 10px;';
      wrapper.textContent = uri;
      const hint = document.createElement('p');
      hint.style.cssText = 'margin-top: 12px; font-size: 12px; color: #888;';
      hint.textContent = 'Copy this URI and paste in your wallet';
      element.replaceChildren(wrapper, hint);
    }
  }

  async isConnected(): Promise<boolean> {
    return this.session !== null && this.currentAddress !== null;
  }

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
        console.error('WalletConnect disconnect error:', error);
      }
    }
    this.client = null;
    this.session = null;
    this.currentAddress = null;
  }

  async getAddress(): Promise<string> {
    if (!this.currentAddress) {
      throw new Error('Wallet not connected');
    }
    return this.currentAddress;
  }

  async getPublicKey(): Promise<string> {
    // WalletConnect doesn't expose public keys directly
    // Use placeholder substitution like Paytaca
    throw new Error(
      'WalletConnect uses placeholder substitution for signatures. ' +
        'Pass placeholder pubkeys in transaction template.'
    );
  }

  async getBalance(): Promise<WalletBalance> {
    if (!this.currentAddress) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await fetch(
        `/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`
      );
      if (!response.ok) {
        console.warn('Balance API returned error:', response.status);
        return { bch: 0, sat: 0 };
      }
      const data = await response.json();
      return {
        sat: data.sat || 0,
        bch: data.bch || 0,
      };
    } catch (error) {
      console.error('Failed to fetch balance:', error);
      return { bch: 0, sat: 0 };
    }
  }

  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw new Error('Use signCashScriptTransaction() instead');
  }

  /**
   * Sign CashScript transaction via WalletConnect
   */
  async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get the connected chain from the session
      const bchNamespace = this.session.namespaces.bch;
      const connectedChain = bchNamespace?.chains?.[0] || 'bch:bchtest';

      console.log('Signing transaction on chain:', connectedChain);

      // Use libauth stringify for proper serialization (handles Uint8Arrays, BigInts, etc.)
      const serializedParams = JSON.parse(
        stringify({
          transaction: options.transaction,
          sourceOutputs: options.sourceOutputs,
          broadcast: options.broadcast ?? true,
          userPrompt: options.userPrompt,
        })
      );

      const result = await this.client.request({
        topic: this.session.topic,
        chainId: connectedChain,
        request: {
          method: 'bch_signTransaction',
          params: serializedParams,
        },
      });

      const typedResult = result as { signedTransaction: string; signedTransactionHash: string };

      return {
        signedTransaction: typedResult.signedTransaction,
        signedTransactionHash: typedResult.signedTransactionHash,
      };
    } catch (error: any) {
      console.error('WalletConnect signing error:', error);
      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      // Get the connected chain from the session
      const bchNamespace = this.session.namespaces.bch;
      const connectedChain = bchNamespace?.chains?.[0] || 'bch:bchtest';

      const signature = await this.client.request({
        topic: this.session.topic,
        chainId: connectedChain,
        request: {
          method: 'bch_signMessage',
          params: { message, userPrompt },
        },
      });

      return signature as string;
    } catch (error: any) {
      console.error('WalletConnect message signing error:', error);
      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
    if (!this.client) return;

    this.client.on('session_update', (args) => {
      if (this.eventsActive && event === 'addressChanged') {
        callback(args);
      }
    });

    this.client.on('session_delete', () => {
      if (this.eventsActive && event === 'disconnect') {
        callback();
      }
    });
  }

  off(_event: string, _callback: (data?: any) => void): void {
    this.eventsActive = false;
  }
}
