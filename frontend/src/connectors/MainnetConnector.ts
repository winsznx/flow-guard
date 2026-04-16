/**
 * Mainnet.cash Connector
 *
 * Restored from v1 implementation
 * Provides integration with mainnet.cash wallet library for testing
 */

import { TestNetWallet, RegTestWallet, Wallet } from 'mainnet-js';
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

export class MainnetConnector implements IWalletConnector {
  type: WalletType = 'mainnet' as WalletType;
  private wallet: Wallet | TestNetWallet | RegTestWallet | null = null;
  private network: 'mainnet' | 'testnet' | 'chipnet' = 'chipnet';

  constructor(network?: 'mainnet' | 'testnet' | 'chipnet') {
    // Read from environment variable if not provided, default to chipnet
    this.network = network || (import.meta.env.VITE_BCH_NETWORK as 'mainnet' | 'testnet' | 'chipnet') || 'chipnet';
  }

  /**
   * Check if mainnet.cash is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      // mainnet-js is always available if imported
      return true;
    } catch (error) {
      console.error('[MainnetConnector] Not available:', error);
      return false;
    }
  }

  /**
   * Connect to wallet (create or restore from localStorage or seed phrase)
   * @param seedPhrase - Optional seed phrase to import existing wallet
   */
  async connect(seedPhrase?: string): Promise<WalletInfo> {
    try {
      console.log('[MainnetConnector] Connecting...', { network: this.network, hasSeed: !!seedPhrase });

      if (seedPhrase) {
        // Import wallet from seed phrase
        this.wallet = await this.importWallet(seedPhrase);

        const walletId = await this.wallet.toString();
        localStorage.setItem('mainnet_wallet_id', walletId);
      } else {
        // Check if wallet exists in localStorage
        const savedWalletId = localStorage.getItem('mainnet_wallet_id');

        if (savedWalletId) {
          console.log('[MainnetConnector] Restoring from wallet ID');
          // Restore from wallet ID (fallback)
          this.wallet = await this.restoreWallet(savedWalletId);
        } else {
          console.log('[MainnetConnector] Creating new wallet');
          // Create new wallet and show seed phrase to user
          this.wallet = await this.createWallet();

          // Save wallet for future sessions
          const walletId = await this.wallet.toString();
          const seed = await this.getSeedPhrase();

          localStorage.setItem('mainnet_wallet_id', walletId);

          alert(`⚠️ NEW WALLET CREATED!\n\nPlease save this seed phrase securely:\n\n${seed}\n\nYou will need it to restore your wallet. It will NOT be shown again.`);
        }
      }

      // Ensure wallet is fully initialized before fetching data
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fetch all wallet data in parallel for better performance
      const [address, publicKey, balance] = await Promise.all([
        this.getAddress().catch(err => {
          console.error('[MainnetConnector] Failed to get address:', err);
          throw new Error('Failed to retrieve wallet address');
        }),
        this.getPublicKey().catch(err => {
          console.warn('[MainnetConnector] Failed to get public key:', err);
          return undefined;
        }),
        this.getBalance().catch(err => {
          console.warn('[MainnetConnector] Failed to get balance:', err);
          return { bch: 0, sat: 0 };
        }),
      ]);

      console.log('[MainnetConnector] Connected successfully:', { address, network: this.network });

      return {
        address,
        publicKey,
        balance,
        network: this.network,
      };
    } catch (error: any) {
      console.error('[MainnetConnector] Connection failed:', error);

      if (error.message?.includes('Invalid seed phrase')) {
        throw error; // Pass through validation errors
      }

      throw new Error(`Failed to connect mainnet.cash wallet: ${error.message}`);
    }
  }

  /**
   * Check if wallet is currently connected
   */
  async isConnected(): Promise<boolean> {
    return this.wallet !== null;
  }

  /**
   * Create a new wallet based on network
   */
  private async createWallet(): Promise<Wallet | TestNetWallet | RegTestWallet> {
    switch (this.network) {
      case 'testnet':
      case 'chipnet':
        return await TestNetWallet.newRandom();
      case 'mainnet':
        return await Wallet.newRandom();
      default:
        return await TestNetWallet.newRandom();
    }
  }

  /**
   * Restore wallet from saved ID
   */
  private async restoreWallet(walletId: string): Promise<Wallet | TestNetWallet | RegTestWallet> {
    try {
      switch (this.network) {
        case 'testnet':
        case 'chipnet':
          return await TestNetWallet.fromId(walletId);
        case 'mainnet':
          return await Wallet.fromId(walletId);
        default:
          return await TestNetWallet.fromId(walletId);
      }
    } catch (error) {
      console.error('[MainnetConnector] Failed to restore wallet, creating new one:', error);
      return this.createWallet();
    }
  }

  /**
   * Import wallet from seed phrase
   */
  private async importWallet(seedPhrase: string): Promise<Wallet | TestNetWallet | RegTestWallet> {
    try {
      switch (this.network) {
        case 'testnet':
        case 'chipnet':
          return await TestNetWallet.fromSeed(seedPhrase);
        case 'mainnet':
          return await Wallet.fromSeed(seedPhrase);
        default:
          return await TestNetWallet.fromSeed(seedPhrase);
      }
    } catch (error) {
      console.error('[MainnetConnector] Failed to import from seed:', error);
      throw new Error('Invalid seed phrase. Please check and try again.');
    }
  }

  /**
   * Disconnect wallet
   * Note: This does NOT delete the seed phrase from localStorage
   */
  async disconnect(): Promise<void> {
    this.wallet = null;
    localStorage.removeItem('mainnet_wallet_id');
    localStorage.removeItem('mainnet_wallet_seed');
    console.log('[MainnetConnector] Disconnected');
  }

  /**
   * Permanently delete wallet from localStorage
   * WARNING: This will remove the seed phrase - wallet cannot be recovered without backup
   */
  async deleteWallet(): Promise<void> {
    this.wallet = null;
    localStorage.removeItem('mainnet_wallet_id');
    localStorage.removeItem('mainnet_wallet_seed');
    console.log('[MainnetConnector] Wallet deleted from storage');
  }

  /**
   * Get wallet address
   */
  async getAddress(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }
    return this.wallet.getDepositAddress();
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
      // Wait for wallet to be fully initialized
      await new Promise(resolve => setTimeout(resolve, 50));

      // mainnet-js exposes publicKey property as Uint8Array
      let publicKeyBytes = this.wallet.publicKey;

      // Try alternative methods if not immediately available
      if (!publicKeyBytes && 'getPublicKey' in this.wallet && typeof (this.wallet as any).getPublicKey === 'function') {
        publicKeyBytes = await (this.wallet as any).getPublicKey();
      }

      if (!publicKeyBytes) {
        // Retry after delay
        await new Promise(resolve => setTimeout(resolve, 100));
        publicKeyBytes = this.wallet.publicKey;
      }

      if (!publicKeyBytes) {
        throw new Error('Public key not available from wallet');
      }

      // Convert Uint8Array to hex string
      const publicKeyHex = Array.from(publicKeyBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('[MainnetConnector] Retrieved public key:', publicKeyHex ? `${publicKeyHex.substring(0, 10)}...` : 'null');
      return publicKeyHex;
    } catch (error) {
      console.error('[MainnetConnector] Failed to get public key:', error);
      throw new Error('Failed to retrieve public key from wallet');
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
      const balanceResponse = await this.wallet.getBalance();

      // Handle both number and BalanceResponse types
      let satoshis = 0;

      if (typeof balanceResponse === 'number') {
        satoshis = balanceResponse;
      } else if (balanceResponse && typeof balanceResponse === 'object') {
        // BalanceResponse has sat property
        satoshis = (balanceResponse as any).sat || 0;
      }

      const bch = satoshis / 100000000;

      return {
        bch,
        sat: satoshis,
      };
    } catch (error) {
      console.error('[MainnetConnector] Failed to get balance:', error);
      return {
        bch: 0,
        sat: 0,
      };
    }
  }

  /**
   * Sign and send transaction
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // For covenant transactions with raw hex
      if (tx.data && typeof tx.data === 'string' && tx.data.length > 100) {
        throw new Error(
          'Covenant transaction signing requires special handling. ' +
          'Please use Paytaca extension for covenant transactions.'
        );
      }

      // For simple sends
      const response = await this.wallet.send([
        {
          cashaddr: tx.to,
          value: tx.amount,
          unit: 'sat',
        },
      ]);

      // Extract txId from response
      let txId = '';
      if (typeof response === 'string') {
        txId = response;
      } else if (response && typeof response === 'object') {
        txId = (response as any).txId || '';
      }

      return {
        txId,
        hex: '', // mainnet-js doesn't always return hex
      };
    } catch (error: any) {
      console.error('[MainnetConnector] Transaction failed:', error);
      throw new Error(`Transaction failed: ${error.message}`);
    }
  }

  /**
   * Sign CashScript transaction
   * Limited support - use Paytaca for production
   */
  async signCashScriptTransaction(
    _options: CashScriptSignOptions
  ): Promise<CashScriptSignResponse> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    throw new Error(
      'The seed-phrase wallet does not support covenant transaction signing. ' +
      'Covenant operations (streams, payments, airdrops, vaults) require a CashScript-compatible wallet.\n\n' +
      'Supported wallets: Paytaca browser extension, Cashonize, or any WalletConnect-compatible BCH wallet.'
    );
  }

  /**
   * Sign a message
   */
  async signMessage(message: string, _userPrompt?: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.wallet.sign(message);
      return signature.signature;
    } catch (error: any) {
      console.error('[MainnetConnector] Message signing failed:', error);
      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  /**
   * Get wallet seed phrase (for backup)
   */
  async getSeedPhrase(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const seed = await this.wallet.getSeed();
      return seed.seed;
    } catch (error) {
      console.error('[MainnetConnector] Failed to get seed phrase:', error);
      throw new Error('Failed to get seed phrase');
    }
  }

  /**
   * Export wallet as WIF — disabled for security.
   * Users must back up their seed phrase on wallet creation.
   */
  async exportWIF(): Promise<string> {
    throw new Error('WIF export is disabled for security. Back up your seed phrase instead.');
  }

  /**
   * Event listeners (mainnet-js doesn't support events)
   */
  on(_event: 'addressChanged' | 'disconnect', _callback: (data?: any) => void): void {
    // mainnet-js doesn't have event system - silent no-op
  }

  off(_event: string, _callback: (data?: any) => void): void {
    // mainnet-js doesn't have event system - silent no-op
  }
}
