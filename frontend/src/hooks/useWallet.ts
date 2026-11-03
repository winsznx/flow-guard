/**
 * Wallet state for the whole app (Zustand store plus a hook). Paytaca, Cashonize,
 * WalletConnect, OPTN and WizardConnect all go through the connectors in ../connectors.
 */

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import {
  WalletType,
  WalletState,
  Transaction,
  SignedTransaction,
  IWalletConnector,
  WalletInfo,
  CashScriptSignOptions,
  CashScriptSignResponse,
} from '../types/wallet';
import { createWalletConnector, restoreWalletConnector } from '../connectors';
import { assertBackendNetworkMatches } from '../utils/networkGuard';
import { clearCachedBearer } from '../utils/auth';
import { TX_NOTICE_EVENT } from '../utils/txNotice';
import { CodedError, asFlowError, flowFailure } from '../copy/errors';

/**
 * Network this build targets. Baked in at build time — there is no runtime switch on
 * either side, which is why `connect()` verifies the backend agrees before prompting
 * the wallet for anything.
 */
const CONFIGURED_NETWORK: 'mainnet' | 'chipnet' =
  (import.meta.env.VITE_BCH_NETWORK as 'mainnet' | 'chipnet') === 'mainnet' ? 'mainnet' : 'chipnet';

let activeEventConnector: IWalletConnector | null = null;
let activeAddressChangedHandler: ((data?: any) => void) | null = null;
let activeDisconnectHandler: ((data?: any) => void) | null = null;

// Module-level lock - guarantees init runs at most once per page load,
// even if the hook re-mounts, state cascades, or dependency references shift.
// Survives all React re-renders because it lives outside the component tree.
let initFiredOnce = false;

/** Wait after a transaction notice before reading the balance, so FlowGuard's servers have seen it. */
const BALANCE_REFRESH_DELAY_MS = 4000;
let balanceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let balanceListenerAttached = false;

function asNetwork(network: WalletInfo['network']): 'mainnet' | 'chipnet' {
  return network === 'mainnet' ? 'mainnet' : 'chipnet';
}

function toCodedError(error: unknown): CodedError {
  return error instanceof CodedError ? error : flowFailure(asFlowError(error).code, { cause: error });
}

/** Ends a session whose wallet is on the other network than this build, and says so. */
async function rejectWrongNetwork(connector: IWalletConnector, walletInfo: WalletInfo): Promise<void> {
  if (asNetwork(walletInfo.network) === CONFIGURED_NETWORK) return;
  await connector.disconnect().catch((disconnectError: unknown) => {
    console.warn('[useWallet] Disconnect after a network mismatch failed:', disconnectError);
  });
  throw flowFailure('WRONG_NETWORK', {
    details: `Wallet is on ${walletInfo.network}. This build uses ${CONFIGURED_NETWORK}.`,
  });
}

function persistConnectedWallet(walletType: WalletType, walletInfo: WalletInfo): void {
  localStorage.setItem('wallet_type', walletType);
  localStorage.setItem('wallet_address', walletInfo.address);
  localStorage.setItem('wallet_connected_at', String(Date.now()));
  if (walletInfo.publicKey) {
    localStorage.setItem('wallet_publickey', walletInfo.publicKey);
  }
}

function connectedWalletState(
  walletType: WalletType,
  walletInfo: WalletInfo,
  connector: IWalletConnector,
): Partial<WalletStore> {
  return {
    walletType,
    address: walletInfo.address,
    publicKey: walletInfo.publicKey || null,
    balance: walletInfo.balance || null,
    isConnected: true,
    isConnecting: false,
    network: walletInfo.network,
    error: null,
    connector,
  };
}

function clearSavedWalletSession(): void {
  localStorage.removeItem('wallet_type');
  localStorage.removeItem('wallet_address');
  localStorage.removeItem('wallet_publickey');
  localStorage.removeItem('wallet_connected_at');
  clearCachedBearer();
}

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
  connect: (walletType: WalletType) => Promise<void>;
  /** Resume a saved wallet without prompting. Resolves false when nothing was resumed. */
  restore: (walletType: WalletType) => Promise<boolean>;
  disconnect: () => Promise<void>;
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signCashScriptTransaction: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  signMessage: (message: string, userPrompt?: string) => Promise<string>;
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
  network: CONFIGURED_NETWORK,
  error: null,
  connector: null,
  isConnectingRef: false,
  initAttempted: false,

  // Actions
  setConnector: (connector) => set({ connector }),
  setState: (newState) => set((state) => ({ ...state, ...newState })),
  setConnectingRef: (value) => set({ isConnectingRef: value }),
  setInitAttempted: (value) => set({ initAttempted: value }),

  connect: async (walletType: WalletType) => {
    const state = get();

    // Prevent concurrent connection attempts
    if (state.isConnectingRef) {
      console.log('Connection already in progress, skipping...');
      return;
    }

    set({ isConnectingRef: true, isConnecting: true, error: null });

    try {
      // Fail before prompting the wallet if this build and the API disagree on which
      // BCH network they target. Neither side can switch at runtime, so nothing
      // downstream recovers from it — and the first visible symptom would otherwise be
      // a wallet prompt for a transaction that cannot confirm. Inconclusive checks
      // (API unreachable, unexpected shape) pass through silently.
      await assertBackendNetworkMatches(CONFIGURED_NETWORK);

      const newConnector: IWalletConnector = createWalletConnector(walletType);

      const isAvailable = await newConnector.isAvailable();
      if (!isAvailable) {
        throw flowFailure(walletType === WalletType.PAYTACA ? 'WALLET_NOT_INSTALLED' : 'WALLET_UNSUPPORTED');
      }

      console.log(`Connecting to ${walletType} wallet...`);

      const walletInfo = await newConnector.connect();

      await rejectWrongNetwork(newConnector, walletInfo);

      console.log('Wallet connected successfully:', {
        type: walletType,
        address: walletInfo.address,
        network: walletInfo.network,
      });

      // Update state - THIS IS THE CRITICAL FIX
      set(connectedWalletState(walletType, walletInfo, newConnector));

      // Save to localStorage
      persistConnectedWallet(walletType, walletInfo);

      console.log('[useWallet] State updated to connected:', {
        isConnected: true,
        address: walletInfo.address,
      });
    } catch (error) {
      const failure = toCodedError(error);

      console.error('Wallet connection failed:', { type: walletType, code: failure.code, error });

      set({
        isConnecting: false,
        error: failure.code === 'PAIRING_CANCELLED' ? null : failure.message,
      });

      throw failure;
    } finally {
      // Always release the lock
      set({ isConnectingRef: false });
    }
  },

  restore: async (walletType: WalletType) => {
    if (get().isConnectingRef) {
      return false;
    }

    set({ isConnectingRef: true, isConnecting: true, error: null });

    try {
      await assertBackendNetworkMatches(CONFIGURED_NETWORK);

      const restored = await restoreWalletConnector(walletType);
      if (!restored) {
        set({ isConnecting: false });
        return false;
      }

      await rejectWrongNetwork(restored.connector, restored.info);
      set(connectedWalletState(walletType, restored.info, restored.connector));
      persistConnectedWallet(walletType, restored.info);
      return true;
    } catch (error) {
      // A silent restore never writes the store error: nobody asked for it, and
      // the picker would show it the next time it opens.
      set({ isConnecting: false });
      throw toCodedError(error);
    } finally {
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
      network: CONFIGURED_NETWORK,
      error: null,
      connector: null,
      isConnectingRef: false,
    });

    clearSavedWalletSession();

    if (!connector) {
      return;
    }

    try {
      await Promise.race([
        connector.disconnect(),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(flowFailure('WALLET_TIMEOUT', { details: 'Wallet disconnect took over 5 seconds.' })), 5000);
        }),
      ]);
    } catch (disconnectError) {
      console.warn('[useWallet] Connector disconnect failed after local state reset:', disconnectError);
    }
  },

  signTransaction: async (tx: Transaction) => {
    const state = get();

    if (!state.connector) {
      throw flowFailure('NOT_CONNECTED');
    }

    return state.connector.signTransaction(tx);
  },

  signCashScriptTransaction: async (options: CashScriptSignOptions) => {
    const state = get();

    if (!state.connector) {
      throw flowFailure('NOT_CONNECTED');
    }

    if (!state.connector.signCashScriptTransaction) {
      throw flowFailure('WALLET_UNSUPPORTED');
    }

    return state.connector.signCashScriptTransaction(options);
  },

  signMessage: async (message: string, userPrompt?: string) => {
    const state = get();

    if (!state.connector) {
      throw flowFailure('NOT_CONNECTED');
    }

    return state.connector.signMessage(message, userPrompt);
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

/**
 * Every transaction FlowGuard sends publishes a notice, so one listener keeps the
 * wallet balance current after each of them.
 */
function attachBalanceRefresh(): void {
  if (balanceListenerAttached || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  balanceListenerAttached = true;
  window.addEventListener(TX_NOTICE_EVENT, () => {
    if (balanceRefreshTimer) clearTimeout(balanceRefreshTimer);
    balanceRefreshTimer = setTimeout(() => {
      balanceRefreshTimer = null;
      void useWalletStore.getState().refreshBalance();
    }, BALANCE_REFRESH_DELAY_MS);
  });
}

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
    initAttempted,
    connect,
    restore,
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

  // Stable refs to Zustand actions so the init effect's deps stay empty.
  // (Zustand actions are referentially stable, but we ref them anyway to make
  // the contract explicit and prevent future regressions.)
  const restoreRef = useRef(restore);
  const setInitAttemptedRef = useRef(setInitAttempted);
  restoreRef.current = restore;
  setInitAttemptedRef.current = setInitAttempted;

  /**
   * Initialize wallet from localStorage exactly once per page load.
   *
   * Guarded by a module-level boolean so React re-mounts / state cascades
   * cannot retrigger the reconnect flow. Without this guard, every state
   * change (isConnected → true, etc.) would re-run the effect and call
   * restore() again, causing the WalletConnect Core re-init loop.
   *
   * Restoring never prompts: a saved wallet with no resumable session is
   * forgotten, and the user reconnects from the wallet picker.
   */
  useEffect(() => {
    if (initFiredOnce) {
      return;
    }
    initFiredOnce = true;
    attachBalanceRefresh();

    const savedWalletType = localStorage.getItem('wallet_type') as WalletType | null;
    const savedAddress = localStorage.getItem('wallet_address');
    const connectedAt = Number(localStorage.getItem('wallet_connected_at') || '0');
    const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const sessionExpired = connectedAt > 0 && Date.now() - connectedAt > SESSION_MAX_AGE_MS;

    if (!savedWalletType || !savedAddress || sessionExpired) {
      if (sessionExpired) {
        localStorage.removeItem('wallet_type');
        localStorage.removeItem('wallet_address');
        localStorage.removeItem('wallet_publickey');
        localStorage.removeItem('wallet_connected_at');
      }
      console.log('[useWallet] No saved wallet found or session expired');
      setInitAttemptedRef.current(true);
      return;
    }

    // No unmount guard: the store is global, so the outcome must land even if
    // the first mounting component is gone (StrictMode mounts effects twice).
    const initWallet = async () => {
      console.log('[useWallet] Restoring saved wallet...', savedWalletType);
      try {
        const restored = await restoreRef.current(savedWalletType);
        if (!restored) {
          console.log('[useWallet] Saved wallet has no resumable session');
          clearSavedWalletSession();
        }
      } catch (error) {
        console.error('[useWallet] Failed to restore wallet:', error);
        clearSavedWalletSession();
      } finally {
        setInitAttemptedRef.current(true);
      }
    };

    void initWallet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    /**
     * Surfaced from the active connector so `authFetch` can pick the login path
     * without string-matching wallet types. Wallets that cannot sign FlowGuard's
     * ~380-byte CAIP-122 message (OPTN, WizardConnect) log in with a proof transaction.
     */
    supportsMessageSigning: connector?.supportsMessageSigning,
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
