/**
 * Unified Wallet Hook
 * Provides a React hook interface for both Selene and mainnet.cash wallets
 */

import { useState, useEffect, useCallback } from 'react';
import {
  WalletType,
  WalletState,
  WalletActions,
  Transaction,
  SignedTransaction,
  IWalletConnector,
} from '../types/wallet';
import { BCHExtensionConnector } from '../services/wallets/bch-extension-connector';
import { MainnetConnector } from '../services/wallets/mainnet-connector';

type UseWalletReturn = WalletState & WalletActions;

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    walletType: null,
    address: null,
    publicKey: null, // NEW: Store public key
    balance: null,
    isConnected: false,
    isConnecting: false,
    network: 'chipnet',
    error: null,
  });

  const [connector, setConnector] = useState<IWalletConnector | null>(null);

  /**
   * Initialize wallet from localStorage on mount
   */
  useEffect(() => {
    const initWallet = async () => {
      const savedWalletType = localStorage.getItem('wallet_type') as WalletType | null;
      const savedAddress = localStorage.getItem('wallet_address');

      if (savedWalletType && savedAddress) {
        try {
          // Reconnect to saved wallet
          await connect(savedWalletType);
        } catch (error) {
          console.error('Failed to reconnect wallet:', error);
          // Clear invalid saved data
          localStorage.removeItem('wallet_type');
          localStorage.removeItem('wallet_address');
        }
      }
    };

    initWallet();
  }, []);

  /**
   * Listen for BCH wallet events (account changes)
   */
  useEffect(() => {
    const handleAccountChange = (event: Event) => {
      const customEvent = event as CustomEvent;
      const newAddress = customEvent.detail.address;

      setState((prev) => ({
        ...prev,
        address: newAddress,
      }));

      localStorage.setItem('wallet_address', newAddress);
    };

    window.addEventListener('bch:accountChanged', handleAccountChange);

    return () => {
      window.removeEventListener('bch:accountChanged', handleAccountChange);
    };
  }, []);

  /**
   * Connect to a wallet
   * @param walletType - Type of wallet to connect to
   * @param seedPhrase - Optional seed phrase for mainnet.cash wallet import
   */
  const connect = useCallback(async (walletType: WalletType, seedPhrase?: string): Promise<void> => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      let newConnector: IWalletConnector;

      // Create appropriate connector
      switch (walletType) {
        case WalletType.BCH_EXTENSION:
          newConnector = new BCHExtensionConnector();
          break;
        case WalletType.MAINNET:
          // Network is read from VITE_BCH_NETWORK env var, defaults to chipnet
          // (handled inside MainnetConnector constructor)
          newConnector = new MainnetConnector();
          break;
        default:
          throw new Error('Unsupported wallet type');
      }

      // Check availability
      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        throw new Error(
          walletType === WalletType.BCH_EXTENSION
            ? 'BCH wallet extension not found. Please install Badger or Paytaca wallet.'
            : 'mainnet.cash library not available'
        );
      }

      // Connect (pass seed phrase if provided for mainnet.cash)
      let walletInfo;
      if (walletType === WalletType.MAINNET && seedPhrase) {
        walletInfo = await (newConnector as MainnetConnector).connect(seedPhrase);
      } else {
        walletInfo = await newConnector.connect();
      }

      // Update state
      setState({
        walletType,
        address: walletInfo.address,
        publicKey: walletInfo.publicKey || null, // NEW: Store public key
        balance: walletInfo.balance || null,
        isConnected: true,
        isConnecting: false,
        network: walletInfo.network,
        error: null,
      });

      setConnector(newConnector);

      // Save to localStorage
      localStorage.setItem('wallet_type', walletType);
      localStorage.setItem('wallet_address', walletInfo.address);
      if (walletInfo.publicKey) {
        localStorage.setItem('wallet_publickey', walletInfo.publicKey);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';

      setState((prev) => ({
        ...prev,
        isConnecting: false,
        error: errorMessage,
      }));

      throw error;
    }
  }, []);

  /**
   * Disconnect wallet
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (connector) {
      await connector.disconnect();
    }

    setState({
      walletType: null,
      address: null,
      publicKey: null, // NEW: Clear public key
      balance: null,
      isConnected: false,
      isConnecting: false,
      network: 'chipnet',
      error: null,
    });

    setConnector(null);

    // Clear localStorage
    localStorage.removeItem('wallet_type');
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_publickey'); // NEW: Clear public key
  }, [connector]);

  /**
   * Sign transaction
   */
  const signTransaction = useCallback(
    async (tx: Transaction): Promise<SignedTransaction> => {
      if (!connector) {
        throw new Error('Wallet not connected');
      }

      return connector.signTransaction(tx);
    },
    [connector]
  );

  /**
   * Sign message
   */
  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!connector) {
        throw new Error('Wallet not connected');
      }

      return connector.signMessage(message);
    },
    [connector]
  );


  /**
   * Get public key from connected wallet
   */
  const getPublicKey = useCallback(async (): Promise<string | null> => {
    if (!connector) {
      return null;
    }

    try {
      return await connector.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  }, [connector]);

  /**
   * Refresh balance
   */
  const refreshBalance = useCallback(async (): Promise<void> => {
    if (!connector) {
      return;
    }

    try {
      const balance = await connector.getBalance();
      setState((prev) => ({ ...prev, balance }));
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  }, [connector]);

  return {
    ...state,
    connect,
    disconnect,
    getPublicKey, // NEW: Expose public key getter
    signTransaction,
    signRawTransaction: undefined, // Not currently supported by available wallets
    signMessage,
    refreshBalance,
  };
}

