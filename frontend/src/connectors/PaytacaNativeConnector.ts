/**
 * Paytaca Native Browser Extension Connector
 *
 * Based on reference implementation from wc2-bch-bcr
 * Uses window.paytaca API for direct extension interaction
 *
 * @see https://github.com/mainnet-pat/wc2-bch-bcr/blob/main/examples/react/ConnectorContext.tsx
 */

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

export class PaytacaNativeConnector implements IWalletConnector {
  type: WalletType = 'paytaca' as WalletType;
  private currentAddress: string | null = null;
  private eventListeners: Map<string, Function[]> = new Map();

  /**
   * Check if Paytaca extension is installed and available
   */
  async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    // Check immediate availability
    if (window.paytaca && typeof window.paytaca.address === 'function') {
      console.log('[PaytacaNative] Extension detected immediately');
      return true;
    }

    // Wait up to 3 seconds for extension injection (async loading)
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 30; // 3 seconds (100ms intervals)

      const check = setInterval(() => {
        attempts++;
        if (window.paytaca && typeof window.paytaca.address === 'function') {
          clearInterval(check);
          console.log(`[PaytacaNative] Extension detected after ${attempts * 100}ms`);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(check);
          console.warn('[PaytacaNative] Extension not detected after 3s');
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Check if currently connected
   */
  async isConnected(): Promise<boolean> {
    if (!window.paytaca) return false;
    try {
      return await window.paytaca.connected();
    } catch {
      return false;
    }
  }

  /**
   * Connect to Paytaca wallet
   */
  async connect(): Promise<WalletInfo> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        'Paytaca wallet not found.\n\n' +
        'Please install the Paytaca browser extension:\n' +
        'https://chrome.google.com/webstore/detail/paytaca/pakphhpnneopheifihmjcjnbdbhaaiaa'
      );
    }

    try {
      // Check if already connected
      const alreadyConnected = await window.paytaca!.connected();

      if (!alreadyConnected) {
        console.log('[PaytacaNative] Requesting connection...');

        // Request connection - this prompts user for approval
        // Connection completes when addressChanged event fires
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout - user did not approve within 60s'));
          }, 60000);

          // Listen for addressChanged event (signals successful connection)
          const handleAddressChange = async () => {
            clearTimeout(timeout);
            window.paytaca!.on('addressChanged', () => {}); // Clear listener
            resolve();
          };

          window.paytaca!.on('addressChanged', handleAddressChange);

          // Initiate connection
          window.paytaca!.connect().catch((err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      } else {
        console.log('[PaytacaNative] Already connected');
      }

      // Get address
      const address = await window.paytaca!.address();
      if (!address) {
        throw new Error('Failed to get address from Paytaca');
      }

      this.currentAddress = address;

      // Determine network from address prefix
      const network = address.startsWith('bchtest:') ? 'chipnet' :
                     address.startsWith('bitcoincash:') ? 'mainnet' : 'chipnet';

      console.log('[PaytacaNative] Connected:', { address, network });

      // Get balance (Paytaca doesn't expose this via dApp API, return placeholder)
      const balance = await this.getBalance();

      return {
        address,
        network: network as 'mainnet' | 'chipnet',
        balance,
      };
    } catch (error: any) {
      console.error('[PaytacaNative] Connection failed:', error);

      if (error.message?.includes('timeout')) {
        throw new Error(
          'Connection timeout.\n\n' +
          'Please approve the connection request in your Paytaca wallet.'
        );
      }

      throw error;
    }
  }

  /**
   * Disconnect from Paytaca
   */
  async disconnect(): Promise<void> {
    if (!window.paytaca) return;

    try {
      await window.paytaca.disconnect();
      console.log('[PaytacaNative] Disconnected');
    } catch (error) {
      console.warn('[PaytacaNative] Disconnect error:', error);
    }

    this.currentAddress = null;
    this.eventListeners.clear();
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (this.currentAddress) return this.currentAddress;

    if (!window.paytaca) {
      throw new Error('Paytaca not connected');
    }

    const address = await window.paytaca.address();
    if (!address) {
      throw new Error('No address available - wallet may not be connected');
    }

    this.currentAddress = address;
    return address;
  }

  /**
   * Get public key
   *
   * NOTE: Paytaca doesn't expose raw public keys via standard dApp API.
   * For contract interactions, use placeholder substitution pattern:
   * - Pass 33-byte zero-filled placeholder for pubkey
   * - Paytaca replaces it with actual pubkey during signing
   */
  async getPublicKey(): Promise<string> {
    throw new Error(
      'Paytaca uses automatic pubkey substitution during signing.\n\n' +
      'For contract interactions, use 33-byte zero placeholder:\n' +
      'new Uint8Array(33) // Paytaca will replace with actual pubkey\n\n' +
      'See: https://github.com/mainnet-pat/wc2-bch-bcr'
    );
  }

  /**
   * Get wallet balance
   *
   * NOTE: Paytaca dApp API doesn't expose balance.
   * Balance should be fetched from blockchain indexer (Chaingraph/Electrum).
   */
  async getBalance(): Promise<WalletBalance> {
    console.warn(
      '[PaytacaNative] Balance fetching not supported via dApp API. ' +
      'Use Chaingraph or Electrum indexer instead.'
    );
    return { bch: 0, sat: 0 };
  }

  /**
   * Sign a simple send transaction
   *
   * For Paytaca, simple sends should also use signCashScriptTransaction
   * with proper transaction construction via libauth.
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw new Error(
      'Use signCashScriptTransaction() for all Paytaca transactions.\n\n' +
      'Paytaca requires full transaction construction with sourceOutputs.\n' +
      'See: https://cashscript.org/docs/ for transaction building.'
    );
  }

  /**
   * Sign a CashScript contract transaction
   *
   * This is the primary signing method for Paytaca.
   * Supports both simple sends and covenant interactions.
   */
  async signCashScriptTransaction(
    options: CashScriptSignOptions
  ): Promise<CashScriptSignResponse> {
    if (!window.paytaca) {
      throw new Error('Paytaca not connected');
    }

    try {
      console.log('[PaytacaNative] Signing transaction...', {
        broadcast: options.broadcast ?? true,
        userPrompt: options.userPrompt,
      });

      const result = await window.paytaca.signTransaction({
        transaction: options.transaction,
        sourceOutputs: options.sourceOutputs,
        broadcast: options.broadcast ?? true,
        userPrompt: options.userPrompt,
      });

      if (!result) {
        throw new Error('Transaction signing rejected by user');
      }

      console.log('[PaytacaNative] Transaction signed:', result.signedTransactionHash);

      return {
        signedTransaction: result.signedTransaction,
        signedTransactionHash: result.signedTransactionHash,
      };
    } catch (error: any) {
      console.error('[PaytacaNative] Signing failed:', error);

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        throw new Error('Transaction rejected by user');
      }

      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!window.paytaca) {
      throw new Error('Paytaca not connected');
    }

    try {
      console.log('[PaytacaNative] Signing message...');

      const result = await window.paytaca.signMessage({
        message,
        userPrompt,
      });

      if (!result) {
        throw new Error('Message signing rejected by user');
      }

      console.log('[PaytacaNative] Message signed');
      return normalizeSignatureResponse(result);
    } catch (error: any) {
      console.error('[PaytacaNative] Message signing failed:', error);

      if (error.message?.includes('rejected') || error.message?.includes('cancelled')) {
        throw new Error('Message signing rejected by user');
      }

      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  /**
   * Register event listener
   */
  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
    if (!window.paytaca) return;

    // Store callback for cleanup
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);

    // Register with Paytaca
    window.paytaca.on(event, callback);

    console.log(`[PaytacaNative] Event listener registered: ${event}`);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback: (data?: any) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }

    // Note: Paytaca API may not support individual listener removal
    // Listeners are cleared on disconnect
    console.log(`[PaytacaNative] Event listener removed: ${event}`);
  }
}
