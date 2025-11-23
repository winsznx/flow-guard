/**
 * Mainnet.cash Wallet Connector
 * Provides integration with mainnet.cash wallet library
 */

import { TestNetWallet, RegTestWallet, Wallet } from 'mainnet-js';
import {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
} from '../../types/wallet';

export class MainnetConnector implements IWalletConnector {
  type = WalletType.MAINNET;
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
      console.error('Mainnet.cash not available:', error);
      return false;
    }
  }

  /**
   * Connect to wallet (create or restore from localStorage or seed phrase)
   * @param seedPhrase - Optional seed phrase to import existing wallet
   */
  async connect(seedPhrase?: string): Promise<WalletInfo> {
    try {
      if (seedPhrase) {
        // Import wallet from seed phrase
        this.wallet = await this.importWallet(seedPhrase);

        // Save wallet ID for future sessions
        const walletId = await this.wallet.toString();
        localStorage.setItem('mainnet_wallet_id', walletId);
        localStorage.setItem('mainnet_wallet_seed', seedPhrase);
      } else {
        // Check if wallet exists in localStorage
        const savedWalletId = localStorage.getItem('mainnet_wallet_id');
        const savedSeed = localStorage.getItem('mainnet_wallet_seed');

        if (savedSeed) {
          // Restore from seed phrase (more reliable)
          this.wallet = await this.importWallet(savedSeed);
        } else if (savedWalletId) {
          // Restore from wallet ID (fallback)
          this.wallet = await this.restoreWallet(savedWalletId);
        } else {
          // Create new wallet and show seed phrase to user
          this.wallet = await this.createWallet();

          // Save wallet for future sessions
          const walletId = await this.wallet.toString();
          const seed = await this.getSeedPhrase();

          localStorage.setItem('mainnet_wallet_id', walletId);
          localStorage.setItem('mainnet_wallet_seed', seed);

          // Alert user to save their seed phrase
          console.warn('NEW WALLET CREATED! Save this seed phrase:', seed);
          alert(`⚠️ NEW WALLET CREATED!\n\nPlease save this seed phrase securely:\n\n${seed}\n\nYou will need it to restore your wallet.`);
        }
      }

      // Ensure wallet is fully initialized before fetching data
      // Add a small delay to allow wallet internal state to settle
      await new Promise(resolve => setTimeout(resolve, 100));

      // Fetch all wallet data in parallel for better performance
      const [address, publicKey, balance] = await Promise.all([
        this.getAddress().catch(err => {
          console.error('Failed to get address:', err);
          throw new Error('Failed to retrieve wallet address');
        }),
        this.getPublicKey().catch(err => {
          console.warn('Failed to get public key:', err);
          // Public key is optional, but log the error
          return undefined;
        }),
        this.getBalance().catch(err => {
          console.warn('Failed to get balance:', err);
          // Return zero balance if fetch fails
          return { bch: 0, sat: 0 };
        }),
      ]);

      return {
        address,
        publicKey,
        balance,
        network: this.network,
      };
    } catch (error) {
      console.error('Failed to connect mainnet wallet:', error);
      throw new Error('Failed to connect to mainnet.cash wallet');
    }
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
      console.error('Failed to restore wallet, creating new one:', error);
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
      console.error('Failed to import wallet from seed phrase:', error);
      throw new Error('Invalid seed phrase. Please check and try again.');
    }
  }

  /**
   * Disconnect wallet
   * Note: This does NOT delete the seed phrase from localStorage
   * To completely remove wallet, user must manually clear localStorage
   */
  async disconnect(): Promise<void> {
    this.wallet = null;
    // Keep seed phrase in localStorage for reconnection
    // Only remove wallet_id
    localStorage.removeItem('mainnet_wallet_id');
  }

  /**
   * Permanently delete wallet from localStorage
   * WARNING: This will remove the seed phrase - wallet cannot be recovered without backup
   */
  async deleteWallet(): Promise<void> {
    this.wallet = null;
    localStorage.removeItem('mainnet_wallet_id');
    localStorage.removeItem('mainnet_wallet_seed');
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
      // Wait a bit for wallet to be fully initialized
      await new Promise(resolve => setTimeout(resolve, 50));

      // mainnet-js exposes publicKey property as Uint8Array
      // Try accessing it multiple ways in case it's not immediately available
      let publicKeyBytes = this.wallet.publicKey;
      
      // If publicKey is not directly available, try alternative methods
      if (!publicKeyBytes && 'getPublicKey' in this.wallet && typeof (this.wallet as any).getPublicKey === 'function') {
        publicKeyBytes = await (this.wallet as any).getPublicKey();
      }

      if (!publicKeyBytes) {
        // Try one more time after a short delay
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

      console.log('Retrieved public key:', publicKeyHex ? `${publicKeyHex.substring(0, 10)}...` : 'null');
      return publicKeyHex;
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
      const balanceResponse = await this.wallet.getBalance();
      // Handle both number and BalanceResponse types
      let satoshis = 0;

      if (typeof balanceResponse === 'number') {
        satoshis = balanceResponse;
      } else if (balanceResponse && typeof balanceResponse === 'object') {
        // BalanceResponse has sat property
        satoshis = (balanceResponse as any).sat || 0;
      }

      const bch = satoshis / 100000000; // Convert satoshis to BCH

      return {
        bch,
        sat: satoshis,
      };
    } catch (error) {
      console.error('Failed to get balance:', error);
      return {
        bch: 0,
        sat: 0,
      };
    }
  }

  /**
   * Sign and send transaction
   * Note: For covenant transactions, we need raw hex signing
   */
  async signTransaction(tx: Transaction): Promise<SignedTransaction> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Check if transaction has raw hex data (for covenant transactions)
      if (tx.data && typeof tx.data === 'string' && tx.data.length > 100) {
        // This is likely a raw transaction hex for a covenant transaction
        // mainnet-js may support signing raw transactions differently
        // For now, we'll need to handle this case specially
        
        // Try to use mainnet-js's ability to sign raw transactions if available
        // Note: This may require additional implementation based on mainnet-js API
        throw new Error(
          'Covenant transaction signing requires special handling. ' +
          'Please use the on-chain transaction flow through the backend API.'
        );
      }

      // For simple sends, use the standard send method
      const response = await this.wallet.send([
        {
          cashaddr: tx.to,
          value: tx.amount,
          unit: 'sat',
        },
      ]);

      // Extract txId from response (can be string or object)
      let txId = '';
      if (typeof response === 'string') {
        txId = response;
      } else if (response && typeof response === 'object') {
        txId = (response as any).txId || '';
      }

      return {
        txId,
        hex: '', // mainnet-js doesn't return hex in some cases
      };
    } catch (error) {
      console.error('Failed to sign transaction:', error);
      throw new Error('Failed to sign transaction');
    }
  }

  /**
   * Sign raw transaction hex (if supported)
   * This is required for covenant transactions
   */
  async signRawTransaction?(_txHex: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    // mainnet-js may have methods to sign raw transactions
    // This would need to be implemented based on mainnet-js API capabilities
    // For now, throw error as this feature needs proper implementation
    throw new Error('Raw transaction signing not yet implemented for mainnet.cash wallet');
  }

  /**
   * Sign a message
   */
  async signMessage(message: string): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const signature = await this.wallet.sign(message);
      return signature.signature;
    } catch (error) {
      console.error('Failed to sign message:', error);
      throw new Error('Failed to sign message');
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
      console.error('Failed to get seed phrase:', error);
      throw new Error('Failed to get seed phrase');
    }
  }

  /**
   * Export wallet as WIF (Wallet Import Format)
   */
  async exportWIF(): Promise<string> {
    if (!this.wallet) {
      throw new Error('Wallet not connected');
    }

    return this.wallet.privateKeyWif || '';
  }
}
