/**
 * BCH Browser Extension Wallet Connector
 * Supports Paytaca and other BCH browser extension wallets
 * Uses the standard window.bitcoincash API
 * 
 * Debug helper: In browser console, run:
 *   window.debugBCHWallet = () => {
 *     console.log('window.bitcoincash:', window.bitcoincash);
 *     console.log('window.paytaca:', window.paytaca);
 *     console.log('window.paytacaWallet:', window.paytacaWallet);
 *     console.log('All wallet-related properties:', Object.keys(window).filter(k => 
 *       k.toLowerCase().includes('paytaca') || 
 *       k.toLowerCase().includes('bitcoincash') ||
 *       k.toLowerCase().includes('wallet')
 *     ));
 *   };
 *   window.debugBCHWallet();
 */

import {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
} from '../../types/wallet';

// Standard BCH wallet interface (injected by browser extensions)
// Based on window.bitcoincash standard
interface BCHWallet {
  getAddress(): Promise<string>;
  getAddresses?(): Promise<string[]>;
  getPublicKey?(): Promise<string>;
  getBalance?(address?: string): Promise<{ confirmed: number; unconfirmed: number }>;
  getRegtestUTXOs?(): Promise<any[]>;
  send(outputs: { address: string; amount: number }[]): Promise<{ txid: string; hex?: string }>;
  signTransaction?(tx: any): Promise<{ txid: string; hex: string }>;
  signMessage(message: string): Promise<string>;
  on?(event: string, callback: (...args: any[]) => void): void;
  removeListener?(event: string, callback: (...args: any[]) => void): void;
}

// Extend Window interface to include bitcoincash and paytaca
// Paytaca may also inject as window.paytacaWallet or other variants
declare global {
  interface Window {
    bitcoincash?: BCHWallet;
    paytaca?: BCHWallet;
    paytacaWallet?: BCHWallet;
    // Some wallets inject under different names
    [key: string]: any;
  }
}

export class BCHExtensionConnector implements IWalletConnector {
  type = WalletType.BCH_EXTENSION;
  private wallet: BCHWallet | null = null;
  private address: string | null = null;
  private listeners: Map<string, (...args: any[]) => void> = new Map();

  /**
   * Check if BCH wallet extension is installed
   * Waits up to 5 seconds for wallet to be injected
   * Checks multiple possible property names and validates wallet API
   */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Helper to check if a wallet object is valid (has required methods)
    const isValidWallet = (wallet: any): boolean => {
      return (
        wallet &&
        typeof wallet === 'object' &&
        typeof wallet.getAddress === 'function' &&
        typeof wallet.send === 'function'
      );
    };

    // Check if wallet is already available
    const checkExisting = () => {
      if (window.bitcoincash && isValidWallet(window.bitcoincash)) return window.bitcoincash;
      if (window.paytaca && isValidWallet(window.paytaca)) return window.paytaca;
      if (window.paytacaWallet && isValidWallet(window.paytacaWallet)) return window.paytacaWallet;

      // Check for any property that might be a wallet (for debugging)
      for (const key in window) {
        if (key.toLowerCase().includes('paytaca') || key.toLowerCase().includes('bitcoincash')) {
          const candidate = (window as any)[key];
          if (isValidWallet(candidate)) {
            console.log(`Found wallet under property: ${key}`);
            return candidate;
          }
        }
      }
      return null;
    };

    const existing = checkExisting();
    if (existing) {
      console.log('Wallet already available:', existing);
      return true;
    }

    // Wait for wallet to be injected (Paytaca may inject asynchronously)
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds total (50 * 100ms)

      const checkWallet = setInterval(() => {
        attempts++;

        const wallet = checkExisting();
        if (wallet) {
          clearInterval(checkWallet);
          console.log('Wallet detected after', attempts * 100, 'ms');
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkWallet);
          console.warn('Wallet not detected after', maxAttempts * 100, 'ms');
          console.warn('Available window properties:', Object.keys(window).filter(k =>
            k.toLowerCase().includes('paytaca') ||
            k.toLowerCase().includes('bitcoincash') ||
            k.toLowerCase().includes('wallet')
          ));
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Get the name of the installed wallet (if available)
   */
  private async getWalletName(): Promise<string> {
    if (typeof window === 'undefined') return 'Unknown';

    // Try to detect which wallet is installed
    if (window.paytaca) {
      return 'Paytaca Wallet';
    }

    if (window.bitcoincash) {
      // Could be Paytaca or other wallet
      return 'BCH Wallet';
    }

    return 'Unknown';
  }

  /**
   * Connect to BCH wallet (existing wallet from browser extension)
   */
  async connect(): Promise<WalletInfo> {
    if (typeof window === 'undefined') {
      throw new Error('Window is not available');
    }

    // Check for wallet availability
    const walletAvailable = await this.isAvailable();
    if (!walletAvailable) {
      // Provide detailed debugging information
      const debugInfo = {
        windowProperties: Object.keys(window).filter(k =>
          k.toLowerCase().includes('paytaca') ||
          k.toLowerCase().includes('bitcoincash') ||
          k.toLowerCase().includes('wallet')
        ),
        hasBitcoincash: !!window.bitcoincash,
        hasPaytaca: !!window.paytaca,
        hasPaytacaWallet: !!window.paytacaWallet,
      };

      console.error('Wallet detection failed. Debug info:', debugInfo);

      throw new Error(
        'BCH wallet extension not found. Please ensure:\n' +
        '1. Paytaca wallet extension is installed and enabled\n' +
        '2. The wallet is unlocked\n' +
        '3. Refresh the page after installing/enabling the extension\n' +
        '4. Check the browser console for more details'
      );
    }

    try {
      // Use whichever wallet is available (prefer bitcoincash standard API)
      // Check multiple possible property names
      this.wallet =
        window.bitcoincash ||
        window.paytaca ||
        window.paytacaWallet ||
        null;

      // If still not found, search for any wallet-like object
      if (!this.wallet) {
        for (const key in window) {
          if (key.toLowerCase().includes('paytaca') || key.toLowerCase().includes('bitcoincash')) {
            const candidate = (window as any)[key];
            if (candidate && typeof candidate.getAddress === 'function') {
              console.log(`Using wallet from property: ${key}`);
              this.wallet = candidate;
              break;
            }
          }
        }
      }

      if (!this.wallet) {
        throw new Error('Wallet not available after detection');
      }

      // Get address from the user's existing wallet
      const address = await this.wallet.getAddress();
      this.address = address;

      // Get public key (required for contract deployment)
      let publicKey: string | undefined;
      try {
        publicKey = await this.getPublicKey();
      } catch (error) {
        console.warn('Could not retrieve public key:', error);
        // Public key is optional for connection, but required for vault creation
      }

      // Get balance
      const balance = await this.getBalance();

      // Set up event listeners if supported
      this.setupEventListeners();

      const walletName = await this.getWalletName();
      console.log(`Connected to ${walletName}`);

      return {
        address,
        publicKey,
        balance,
        network: 'chipnet', // Default to chipnet for now
      };
    } catch (error) {
      console.error('Failed to connect BCH wallet:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to BCH wallet';
      throw new Error(errorMessage);
    }
  }

  /**
   * Set up event listeners for wallet changes (if wallet supports it)
   */
  private setupEventListeners(): void {
    if (!this.wallet || !this.wallet.on) return;

    try {
      // Listen for account changes
      const accountChangeHandler = (newAddress: string) => {
        this.address = newAddress;
        // Emit custom event for React components
        window.dispatchEvent(
          new CustomEvent('bch:accountChanged', { detail: { address: newAddress } })
        );
      };

      this.listeners.set('accountsChanged', accountChangeHandler);

      if (this.wallet.on) {
        this.wallet.on('accountsChanged', accountChangeHandler);
      }
    } catch (error) {
      console.warn('Could not set up event listeners:', error);
    }
  }

  /**
   * Clean up event listeners
   */
  private cleanupEventListeners(): void {
    if (!this.wallet || !this.wallet.removeListener) return;

    try {
      this.listeners.forEach((handler, event) => {
        this.wallet!.removeListener!(event, handler);
      });

      this.listeners.clear();
    } catch (error) {
      console.warn('Could not clean up event listeners:', error);
    }
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    this.cleanupEventListeners();
    this.wallet = null;
    this.address = null;
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    if (this.address) {
      return this.address;
    }

    this.address = await this.wallet.getAddress();
    return this.address;
  }

  /**
   * Get wallet public key (hex format)
   * Required for contract deployment
   */
  async getPublicKey(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      if (!this.wallet.getPublicKey) {
        throw new Error('Wallet does not support getPublicKey method. Please use a compatible BCH wallet.');
      }

      const publicKey = await this.wallet.getPublicKey();
      console.log('Retrieved public key:', publicKey ? `${publicKey.substring(0, 10)}...` : 'null');
      return publicKey;
    } catch (error) {
      console.error('Failed to get public key:', error);
      throw new Error('Failed to retrieve public key from wallet. This is required for vault creation.');
    }
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Try to get balance if the method exists
      if (!this.wallet.getBalance) {
        console.warn('Wallet does not support getBalance method');
        return { bch: 0, sat: 0 };
      }

      const address = await this.getAddress();
      const balanceResponse = await this.wallet.getBalance(address);
      const satoshis = balanceResponse.confirmed + balanceResponse.unconfirmed;
      const bch = satoshis / 100000000; // Convert satoshis to BCH

      return {
        bch,
        sat: satoshis,
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      // Return zero balance instead of throwing
      return {
        bch: 0,
        sat: 0,
      };
    }
  }

  /**
   * Sign and broadcast transaction
   * Note: Standard BCH wallet APIs support simple sends, not raw transaction hex signing
   * For covenant transactions, we need raw hex signing which may not be supported
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Check if transaction has raw hex data (for covenant transactions)
      if (tx.data && typeof tx.data === 'string' && tx.data.length > 100) {
        // This is likely a raw transaction hex
        // Try to use signTransaction method if available
        if (this.wallet.signTransaction && typeof this.wallet.signTransaction === 'function') {
          try {
            const result = await this.wallet.signTransaction({ hex: tx.data });
            return {
              txId: result.txid || '',
              hex: result.hex || tx.data,
            };
          } catch (rawSignError) {
            console.warn('Raw transaction signing not supported, falling back to send method');
          }
        }

        // If raw signing not available, throw error
        throw new Error(
          'Covenant transaction signing requires raw hex support. ' +
          'Your wallet may not support this feature. Please use a compatible wallet or contact support.'
        );
      }

      // For simple sends, use the standard send method
      const result = await this.wallet.send([
        {
          address: tx.to,
          amount: tx.amount, // amount in satoshis
        },
      ]);

      return {
        txId: result.txid,
        hex: result.hex || '',
      };
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error('Failed to sign transaction. User may have rejected.');
    }
  }

  /**
   * Sign raw transaction hex (if supported by wallet)
   * This is required for covenant transactions
   */
  async signRawTransaction?(txHex: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    // Check if wallet supports raw transaction signing
    if (this.wallet.signTransaction && typeof this.wallet.signTransaction === 'function') {
      try {
        const result = await this.wallet.signTransaction({ hex: txHex });
        return result.hex || txHex;
      } catch (error) {
        console.error('Raw transaction signing failed:', error);
        throw new Error('Wallet does not support raw transaction signing');
      }
    }

    throw new Error('Wallet does not support raw transaction signing');
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.wallet.signMessage(message);
      return signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message. User may have rejected.');
    }
  }
}
