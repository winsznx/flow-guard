/**
 * Unified Wallet Hook
 * Provides a React hook interface for Paytaca, WalletConnect v2, and mainnet.cash wallets
 * Uses Zustand for global state management
 */

import { useEffect } from 'react';
import { create } from 'zustand';
import {
  WalletType,
  WalletState,
  Transaction,
  SignedTransaction,
  IWalletConnector,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';
import { createWalletConnector, MainnetConnector } from '../connectors';

let activeEventConnector: IWalletConnector | null = null;
let activeAddressChangedHandler: ((data?: any) => void) | null = null;
let activeDisconnectHandler: ((data?: any) => void) | null = null;

// Global state store using Zustand
interface WalletStore extends WalletState {
  connector: IWalletConnector | null;
  isConnectingRef: boolean;
  initAttempted: boolean;

  // Actions
  setConnector: (connector: IWalletConnector | null) => void;
  setState: (state: Partial<WalletState>) => void;
  setConnectingRef: (value: boolean) => void;
  setInitAttempted: (value: boolean) => void;
  connect: (walletType: WalletType, seedPhrase?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signCashScriptTransaction: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  signMessage: (message: string) => Promise<string>;
  getAddress: () => Promise<string | null>;
  getPublicKey: () => Promise<string | null>;
  refreshBalance: () => Promise<void>;
}

const useWalletStore = create<WalletStore>((set, get) => ({
  // Initial state
  walletType: null,
  address: null,
  publicKey: null,
  balance: null,
  isConnected: false,
  isConnecting: false,
  network: 'chipnet',
  error: null,
  connector: null,
  isConnectingRef: false,
  initAttempted: false,

  // Actions
  setConnector: (connector) => set({ connector }),
  setState: (newState) => set((state) => ({ ...state, ...newState })),
  setConnectingRef: (value) => set({ isConnectingRef: value }),
  setInitAttempted: (value) => set({ initAttempted: value }),

  connect: async (walletType: WalletType, seedPhrase?: string) => {
    const state = get();

    // Prevent concurrent connection attempts
    if (state.isConnectingRef) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    set({ isConnectingRef: true, isConnecting: true, error: null });

    try {
      let newConnector: IWalletConnector;

      // Create appropriate connector using factory
      newConnector = createWalletConnector(walletType);

      // Check availability
      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        const messages: Record<WalletType, string> = {
          [WalletType.PAYTACA]: 'Paytaca wallet not found. Please install the Paytaca browser extension from the Chrome Web Store.',
          [WalletType.CASHONIZE]: 'Cashonize wallet not available. Please install Cashonize mobile app from https://cashonize.com',
          [WalletType.WALLETCONNECT]: 'WalletConnect not available',
          [WalletType.MAINNET]: 'mainnet.cash library not available',
        };
        throw new Error(messages[walletType] || 'Wallet not available');
      }

      // Connect (pass seed phrase if provided for mainnet.cash)
      console.log(`Connecting to ${walletType} wallet...`, seedPhrase ? 'with seed phrase' : 'new wallet');

      let walletInfo;
      if (walletType === WalletType.MAINNET && seedPhrase) {
        walletInfo = await (newConnector as MainnetConnector).connect(seedPhrase);
      } else {
        walletInfo = await newConnector.connect();
      }

      console.log('Wallet connected successfully:', {
        type: walletType,
        address: walletInfo.address,
        network: walletInfo.network,
      });

      // Update state - THIS IS THE CRITICAL FIX
      set({
        walletType,
        address: walletInfo.address,
        publicKey: walletInfo.publicKey || null,
        balance: walletInfo.balance || null,
        isConnected: true,
        isConnecting: false,
        network: walletInfo.network,
        error: null,
        connector: newConnector,
      });

      // Save to localStorage
      localStorage.setItem('wallet_type', walletType);
      localStorage.setItem('wallet_address', walletInfo.address);
      localStorage.setItem('wallet_connected_at', String(Date.now()));
      if (walletInfo.publicKey) {
        localStorage.setItem('wallet_publickey', walletInfo.publicKey);
      }

      console.log('[useWallet] State updated to connected:', {
        isConnected: true,
        address: walletInfo.address,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';

      console.error('Wallet connection failed:', {
        type: walletType,
        error: error,
        message: errorMessage,
      });

      set({
        isConnecting: false,
        error: errorMessage,
      });

      throw error;
    } finally {
      // Always release the lock
      set({ isConnectingRef: false });
    }
  },

  disconnect: async () => {
    const state = get();
    const connector = state.connector;

    if (
      activeEventConnector
      && activeEventConnector.off
      && activeAddressChangedHandler
      && activeDisconnectHandler
    ) {
      activeEventConnector.off('addressChanged', activeAddressChangedHandler);
      activeEventConnector.off('disconnect', activeDisconnectHandler);
    }
    activeEventConnector = null;
    activeAddressChangedHandler = null;
    activeDisconnectHandler = null;

    set({
      walletType: null,
      address: null,
      publicKey: null,
      balance: null,
      isConnected: false,
      isConnecting: false,
      network: 'chipnet',
      error: null,
      connector: null,
      isConnectingRef: false,
    });

    localStorage.removeItem('wallet_type');
    localStorage.removeItem('wallet_address');
    localStorage.removeItem('wallet_publickey');

    if (!connector) {
      return;
    }

    try {
      await Promise.race([
        connector.disconnect(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Wallet disconnect timed out')), 5000);
        }),
      ]);
    } catch (disconnectError) {
      console.warn('[useWallet] Connector disconnect failed after local state reset:', disconnectError);
    }
  },

  signTransaction: async (tx: Transaction) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    return state.connector.signTransaction(tx);
  },

  signCashScriptTransaction: async (options: CashScriptSignOptions) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    if (!state.connector.signCashScriptTransaction) {
      throw new Error('Connected wallet does not support CashScript transactions');
    }

    return state.connector.signCashScriptTransaction(options);
  },

  signMessage: async (message: string) => {
    const state = get();

    if (!state.connector) {
      throw new Error('Wallet not connected');
    }

    return state.connector.signMessage(message);
  },

  getAddress: async () => {
    const state = get();

    if (!state.connector) {
      return state.address;
    }

    try {
      const address = await state.connector.getAddress();
      if (address && address !== state.address) {
        set({ address });
        localStorage.setItem('wallet_address', address);
      }
      return address || state.address;
    } catch (error) {
      console.error('Failed to get wallet address:', error);
      return state.address;
    }
  },

  getPublicKey: async () => {
    const state = get();

    if (!state.connector) {
      return null;
    }

    try {
      return await state.connector.getPublicKey();
    } catch (error) {
      console.error('Failed to get public key:', error);
      return null;
    }
  },

  refreshBalance: async () => {
    const state = get();

    if (!state.connector) {
      return;
    }

    try {
      const balance = await state.connector.getBalance();
      set({ balance });
    } catch (error) {
      console.error('Failed to refresh balance:', error);
    }
  },
}));

// Hook to use wallet store
export function useWallet() {
  // Get all state and actions from Zustand store
  const {
    walletType,
    address,
    publicKey,
    balance,
    isConnected,
    isConnecting,
    network,
    error,
    connector,
    isConnectingRef,
    initAttempted,
    connect,
    disconnect,
    signTransaction,
    signCashScriptTransaction,
    signMessage,
    getAddress,
    getPublicKey,
    refreshBalance,
    setState,
    setInitAttempted,
  } = useWalletStore();

  /**
   * Initialize wallet from localStorage on mount (only once globally)
   */
  useEffect(() => {
    // CRITICAL: Use global flag from Zustand store, not local ref
    if (initAttempted) {
      console.log('[useWallet] Init already attempted, skipping...');
      return;
    }

    const savedWalletType = localStorage.getItem('wallet_type') as WalletType | null;
    const savedAddress = localStorage.getItem('wallet_address');
    const connectedAt = Number(localStorage.getItem('wallet_connected_at') || '0');
    const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

    if (!savedWalletType || !savedAddress || (connectedAt > 0 && Date.now() - connectedAt > SESSION_MAX_AGE_MS)) {
      if (connectedAt > 0 && Date.now() - connectedAt > SESSION_MAX_AGE_MS) {
        localStorage.removeItem('wallet_type');
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_publickey');
        localStorage.removeItem('wallet_connected_at');
      }
      console.log('[useWallet] No saved wallet found or session expired');
      setInitAttempted(true);
      return;
    }

    if (isConnectingRef) {
      console.log('[useWallet] Connection already in progress, skipping init...');
      return;
    }

    let cancelled = false;

    const initWallet = async () => {
      if (cancelled) return;
      console.log('[useWallet] Reconnecting saved wallet...', savedWalletType);
      try {
        await connect(savedWalletType);
      } catch (error) {
        if (cancelled) return;
        console.error('[useWallet] Failed to reconnect wallet:', error);
        const message = error instanceof Error ? error.message : String(error || '');
        const isTransientWalletConnectError =
          savedWalletType === WalletType.WALLETCONNECT
          && /(timeout|relay|websocket|network|temporar|stale session)/i.test(message);

        if (isTransientWalletConnectError) {
          console.warn('[useWallet] WalletConnect reconnect failed transiently; preserving saved session metadata');
          return;
        }

        localStorage.removeItem('wallet_type');
        localStorage.removeItem('wallet_address');
      } finally {
        if (!cancelled) setInitAttempted(true);
      }
    };

    initWallet();

    return () => { cancelled = true; };
  }, [initAttempted, isConnectingRef, connect, setInitAttempted]);

  /**
   * Listen for wallet events (address changes, disconnection)
   */
  useEffect(() => {
    const detachActiveConnector = () => {
      if (
        activeEventConnector
        && activeEventConnector.off
        && activeAddressChangedHandler
        && activeDisconnectHandler
      ) {
        activeEventConnector.off('addressChanged', activeAddressChangedHandler);
        activeEventConnector.off('disconnect', activeDisconnectHandler);
      }
      activeEventConnector = null;
      activeAddressChangedHandler = null;
      activeDisconnectHandler = null;
    };

    if (!connector) {
      detachActiveConnector();
      return;
    }

    if (activeEventConnector === connector) {
      return;
    }

    detachActiveConnector();

    if (connector.on) {
      const handleAddressChange = (nextAddress?: any) => {
        if (typeof nextAddress !== 'string' || nextAddress.length === 0) {
          return;
        }
        setState({ address: nextAddress });
        localStorage.setItem('wallet_address', nextAddress);
      };

      const handleDisconnect = () => {
        void disconnect();
      };

      connector.on('addressChanged', handleAddressChange);
      connector.on('disconnect', handleDisconnect);

      activeEventConnector = connector;
      activeAddressChangedHandler = handleAddressChange;
      activeDisconnectHandler = handleDisconnect;
    }
  }, [connector, setState, disconnect]);

  return {
    walletType,
    address,
    publicKey,
    balance,
    isConnected,
    isConnecting,
    initAttempted,
    network,
    error,
    connect,
    disconnect,
    getPublicKey,
    signTransaction,
    signCashScriptTransaction,
    signMessage,
    getAddress,
    refreshBalance,
  };
}
