/**
 * Unified WalletConnect v2 Connector for BCH
 * Based on official implementations from:
 * - github.com/mainnet-pat/bch-wc2
 * - github.com/mr-zwets/bch-hodl-dapp (PRIMARY REFERENCE)
 * - github.com/mainnet-pat/wc2-bch-bcr
 */

import SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
import { getSdkError } from '@walletconnect/utils';
import { WalletConnectModal } from '@walletconnect/modal';
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

// WalletConnect configuration
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const APP_METADATA = {
  name: 'FlowGuard',
  description: 'BCH-native treasuries, streams, payments, and governance',
  url: window.location.origin,
  icons: [`${window.location.origin}/favicon.svg`],
};

// Global SignClient and Modal singletons
let globalSignClient: SignClient | undefined;
let globalWCModal: WalletConnectModal | undefined;

/**
 * Base WalletConnect v2 Connector
 * Handles connection, signing, and session management
 */
export class WalletConnect2Connector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType;

  protected client?: SignClient;
  protected session?: SessionTypes.Struct;
  protected chains: string[] = [];
  protected accounts: string[] = [];
  protected wcModal?: WalletConnectModal;
  protected useChipnet: boolean = false;

  constructor() {
    // Determine network from environment
    const network = import.meta.env.VITE_BCH_NETWORK || 'chipnet';
    this.useChipnet = network === 'chipnet';
  }

  async isAvailable(): Promise<boolean> {
    // WalletConnect is always available in browser
    return typeof window !== 'undefined';
  }

  async connect(): Promise<WalletInfo> {
    // Validate PROJECT_ID
    if (!PROJECT_ID || PROJECT_ID === 'demo-project-id') {
      throw new Error(
        'WalletConnect Project ID not configured. Please set VITE_WALLETCONNECT_PROJECT_ID in your .env file.'
      );
    }

    // Initialize SignClient (singleton)
    if (!globalSignClient) {
      console.log('WC: Initializing SignClient with project:', PROJECT_ID);
      try {
        // Add timeout to prevent hanging indefinitely (30 seconds)
        const initPromise = SignClient.init({
          projectId: PROJECT_ID,
          metadata: APP_METADATA,
        });

        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'WalletConnect connection timed out. Please check your internet connection and try again.'
                )
              ),
            30000
          );
        });

        globalSignClient = (await Promise.race([initPromise, timeoutPromise])) as SignClient;
        console.log('WC: SignClient initialized successfully');
      } catch (error: any) {
        console.error('WC: SignClient initialization failed:', error);
        // Reset singleton so user can retry
        globalSignClient = undefined;
        throw new Error(error.message || 'Failed to connect to WalletConnect. Please try again.');
      }
    }
    this.client = globalSignClient;

    // Initialize WalletConnectModal (singleton)
    if (!globalWCModal) {
      console.log('WC: Initializing WalletConnectModal...');
      globalWCModal = new WalletConnectModal({
        projectId: PROJECT_ID,
        themeMode: 'light',
        themeVariables: {
          '--wcm-z-index': '99999',
        },
        explorerExcludedWalletIds: 'ALL', // Don't show wallet explorer, just QR
      });
    }
    this.wcModal = globalWCModal;

    // Subscribe to events
    if (this.client) {
      await this._subscribeToEvents(this.client);
    }

    // Check for persisted session
    if (this.client) {
      await this._checkPersistedState(this.client);
    }

    // If no session, create new connection
    if (!this.session) {
      await this._connect();
    }

    // Get address
    const address = await this.getAddress();

    // Detect network from connected chain
    const connectedChain = this.chains[0];
    const network = connectedChain === 'bch:bchtest' ? 'chipnet' : 'mainnet';

    console.log('WC: Connection complete!', { address, network, chain: connectedChain });

    // Fetch balance
    const balance = await this.getBalance();

    return {
      address,
      network,
      balance,
    };
  }

  private async _subscribeToEvents(client: SignClient) {
    // Handle session updates (address changes)
    client.on('session_update', ({ topic, params }) => {
      console.log('WC: session_update', { topic, params });
      const { namespaces } = params;
      const _session = client.session.get(topic);
      const updatedSession = { ..._session, namespaces };
      this._onSessionConnected(updatedSession as any);
    });

    // Handle session deletion (disconnect)
    client.on('session_delete', () => {
      console.log('WC: session_delete');
      this._reset();
    });
  }

  private async _checkPersistedState(client: SignClient) {
    if (this.session) return;

    // Restore last session if exists
    const sessions = client.session.getAll();
    if (sessions.length > 0) {
      const lastSession = sessions[sessions.length - 1];
      console.log('WC: Restoring session', lastSession);
      await this._onSessionConnected(lastSession as any);
    }
  }

  private async _connect() {
    if (!this.client) throw new Error('SignClient not initialized');

    // Use the network configured in env
    const connectedChain = this.useChipnet ? 'bch:bchtest' : 'bch:bitcoincash';

    // Required namespaces per WC2 BCH-BCR spec
    const requiredNamespaces = {
      bch: {
        chains: [connectedChain],
        methods: ['bch_getAddresses', 'bch_signTransaction', 'bch_signMessage'],
        events: ['addressesChanged', 'disconnect'],
      },
    };

    console.log('WC: Requesting connection with namespaces:', requiredNamespaces);
    console.log('WC: Network from env:', this.useChipnet ? 'chipnet' : 'mainnet');

    // Request connection
    const { uri, approval } = await this.client.connect({
      requiredNamespaces,
    });

    // Show QR modal
    if (uri) {
      console.log('WC: Opening modal with URI:', uri);
      await this.wcModal!.openModal({ uri });
    }

    // Wait for user approval in wallet
    console.log('WC: Waiting for approval...');
    const session = await approval();
    console.log('WC: Session approved!', session);

    // Store session
    await this._onSessionConnected(session as any);

    // Close modal
    this.wcModal!.closeModal();
  }

  private async _onSessionConnected(session: SessionTypes.Struct) {
    console.log('WC: Session connected', session);

    // Extract accounts from namespaces
    const userAccountWc = session.namespaces?.bch?.accounts?.[0];
    if (!userAccountWc) {
      throw new Error('No BCH account found in session');
    }

    this.session = session;

    // Use the chains that the wallet actually connected to (from session)
    this.chains = session.namespaces.bch.chains || ['bch:bitcoincash'];
    this.accounts = session.namespaces.bch.accounts;

    console.log('WC: Connected to chains:', this.chains);
    console.log('WC: Accounts:', this.accounts);
  }

  private _reset() {
    this.session = undefined;
    this.chains = [];
    this.accounts = [];
  }

  async isConnected(): Promise<boolean> {
    return this.client !== undefined && this.session !== undefined;
  }

  async disconnect(): Promise<void> {
    if (!this.client || !this.session) return;

    try {
      await this.client.disconnect({
        topic: this.session.topic,
        reason: getSdkError('USER_DISCONNECTED'),
      });

      // Delete all pairings
      this.client.pairing.getAll().forEach((pairing) => {
        this.client!.pairing.delete(pairing.topic, getSdkError('USER_DISCONNECTED'));
      });
    } catch (error) {
      console.error('WC: Disconnect error:', error);
    } finally {
      this._reset();
    }
  }

  async getAddress(): Promise<string> {
    if (!this.session) {
      throw new Error('Wallet not connected');
    }

    // Get address from session accounts (format: "bch:bitcoincash:address" or "bch:bchtest:address")
    const userAccountWc = this.session.namespaces?.bch?.accounts?.[0];
    if (!userAccountWc) {
      throw new Error('No BCH account in session');
    }

    // Remove "bch:" prefix (slice(4))
    // "bch:bitcoincash:address" -> "bitcoincash:address"
    // "bch:bchtest:address" -> "bchtest:address"
    const addressWithNetwork = userAccountWc.slice(4);

    console.log('WC: Got address:', addressWithNetwork);
    return addressWithNetwork;
  }

  async getPublicKey(): Promise<string> {
    // WalletConnect uses placeholder substitution
    throw new Error('WalletConnect uses placeholder substitution for signatures');
  }

  async getBalance(): Promise<WalletBalance> {
    const address = await this.getAddress();
    console.log('WC: Fetching balance for address:', address);

    try {
      const balanceUrl = `/api/wallet/balance/${encodeURIComponent(address)}`;

      console.log('WC: Fetching from:', balanceUrl);

      const response = await fetch(balanceUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        console.warn('WC: Backend balance API returned error:', response.status);
        return { bch: 0, sat: 0 };
      }

      const data = await response.json();
      console.log('WC: Balance from backend:', data);

      return {
        sat: data.sat || 0,
        bch: data.bch || 0,
      };
    } catch (error) {
      console.error('WC: Failed to get balance:', error);
      // Return zero on error - wallet still works for transactions
      return { bch: 0, sat: 0 };
    }
  }

  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw new Error('Use signCashScriptTransaction() for WalletConnect');
  }

  async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('WC: Signing transaction', options);

      // Serialize using libauth stringify
      const serializedParams = JSON.parse(
        stringify({
          transaction: options.transaction,
          sourceOutputs: options.sourceOutputs,
          broadcast: options.broadcast ?? true,
          userPrompt: options.userPrompt,
        })
      );

      const result = await this.client.request<CashScriptSignResponse>({
        chainId: this.chains[0],
        topic: this.session.topic,
        request: {
          method: 'bch_signTransaction',
          params: serializedParams,
        },
      });

      console.log('WC: Transaction signed', result);
      return result;
    } catch (error: any) {
      console.error('WC: Transaction signing failed', error);
      throw new Error(`Transaction signing failed: ${error.message}`);
    }
  }

  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await this.client.request<string>({
        chainId: this.chains[0],
        topic: this.session.topic,
        request: {
          method: 'bch_signMessage',
          params: { message, userPrompt },
        },
      });

      return result;
    } catch (error: any) {
      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  on(_event: 'addressChanged' | 'disconnect', _callback: (data?: any) => void): void {
    // Events are handled in _subscribeToEvents
  }

  off(_event: string, _callback: (data?: any) => void): void {
    // Not needed
  }
}

/**
 * Paytaca Connector
 * Uses WalletConnect v2 (supports both browser extension and mobile app)
 */
export class PaytacaWCConnector extends WalletConnect2Connector {
  type: WalletType = 'paytaca' as WalletType;
}
