/**
 * WalletConnect v2 connector. The pairing QR code shows in FlowGuard's own dialog.
 *
 * Based on reference implementations from:
 * - https://github.com/mainnet-pat/wc2-bch-bcr
 * - https://github.com/mainnet-pat/dapp-starter
 *
 * Supports BCH wallets via WalletConnect v2:
 * - Cashonize (web/mobile)
 * - Zapit (mobile)
 * - Paytaca (mobile via WC2)
 */

import type SignClient from '@walletconnect/sign-client';
import type { SessionTypes } from '@walletconnect/types';
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
import { normalizeSignatureResponse } from '../utils/signature';
import { flowFailure, walletRequestFailure } from '../copy/errors';
import { PAIRING, WALLET_PROMPTS } from '../copy/wallets';
import { abandonPairing, getSignClient, isAbandonedPairing } from './signClient';
import { showPairingDialog } from './pairingDialog';

const PAIRING_TIMEOUT_MS = 120_000;

export type PairingCopy = { title: string; line: string; qrCaption: string; openLabel: string };

// WalletConnect Project ID - sourced exclusively from env. Free at
// https://cloud.walletconnect.com. No hardcoded fallback so a misconfigured
// deploy fails loudly at connect() time instead of routing through a shared
// throwaway project id.
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined;

// Get network from environment
const BCH_NETWORK = (import.meta.env.VITE_BCH_NETWORK || 'chipnet') as 'mainnet' | 'chipnet';

export class Web3ModalWalletConnectConnector implements IWalletConnector {
  type: WalletType = 'walletconnect' as WalletType;

  private client: SignClient | null = null;
  private session: any | null = null;
  private hidePairing: (() => void) | null = null;
  private cancelPairing: (() => void) | null = null;
  /** What the pairing dialog says. OPTN overrides it with its own name. */
  protected pairingCopy: PairingCopy = PAIRING.walletconnect;
  private currentAddress: string | null = null;
  private eventListeners: Map<string, Function[]> = new Map();
  private clientEventsSubscribed = false;
  private staleTopicCleanup: Promise<void> | null = null;

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private _sessionSupportsMethod(method: string): boolean {
    if (!this.session || !this._isRecord(this.session.namespaces)) {
      return false;
    }

    const namespaces = Object.values(this.session.namespaces) as Array<{
      methods?: unknown;
    }>;
    return namespaces.some((namespace) => {
      return Array.isArray(namespace.methods) && namespace.methods.includes(method);
    });
  }

  private _extractErrorMessage(error: unknown, fallback: string): string {
    const seen = new Set<string>();
    const messages: string[] = [];

    const pushMessage = (value: unknown) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (!trimmed || trimmed === '[object Object]' || seen.has(trimmed)) return;
      seen.add(trimmed);
      messages.push(trimmed);
    };

    if (this._isRecord(error)) {
      pushMessage(error.message);
      pushMessage(error.reason);

      if (this._isRecord(error.data)) {
        pushMessage(error.data.message);
      }

      if (this._isRecord(error.error)) {
        pushMessage(error.error.message);
      }

      if (this._isRecord(error.cause)) {
        pushMessage(error.cause.message);
      }

      if (this._isRecord(error.response)) {
        pushMessage(error.response.message);
      }
    } else if (typeof error === 'string') {
      pushMessage(error);
    }

    if (messages.length > 0) {
      return messages.join(' | ');
    }

    if (this._isRecord(error)) {
      return fallback;
    }

    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return fallback;
  }

  private async _withRequestTimeout<T>(
    promise: Promise<T>,
    context: string,
    timeoutOverrideMs?: number,
  ): Promise<T> {
    const timeoutMs = timeoutOverrideMs
      ?? Number(import.meta.env.VITE_WALLETCONNECT_REQUEST_TIMEOUT_MS || 90000);
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${context} timed out after ${timeoutMs / 1000}s`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private _normalizeCashAddress(raw: string): string {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return trimmed;
    if (trimmed.startsWith('bitcoincash:') || trimmed.startsWith('bchtest:')) {
      return trimmed;
    }
    const [, chain] = this._getPrimaryChain().split(':');
    return `${chain}:${trimmed}`;
  }

  private _extractAddress(result: unknown): string | null {
    if (typeof result === 'string' && result.trim().length > 0) {
      return this._normalizeCashAddress(result);
    }
    if (Array.isArray(result) && result.length > 0 && typeof result[0] === 'string') {
      return this._normalizeCashAddress(result[0]);
    }
    if (result && typeof result === 'object') {
      const addresses = (result as { addresses?: unknown }).addresses;
      if (Array.isArray(addresses) && addresses.length > 0 && typeof addresses[0] === 'string') {
        return this._normalizeCashAddress(addresses[0]);
      }
    }
    return null;
  }

  private _emitAddressChanged(address: string): void {
    const listeners = this.eventListeners.get('addressChanged');
    if (listeners) {
      listeners.forEach((cb) => cb(address));
    }
  }

  private async _syncAddressFromWallet(options?: { logErrors?: boolean }): Promise<string | null> {
    if (!this.client || !this.session) {
      return this.currentAddress;
    }

    if (!this._sessionSupportsMethod('bch_getAddresses')) {
      return this.currentAddress;
    }

    try {
      const connectedChain = this._getPrimaryChain();
      const result = await this._requestWithoutRedirect(() =>
        this.client!.request({
          topic: this.session!.topic,
          chainId: connectedChain,
          request: {
            method: 'bch_getAddresses',
            params: {},
          },
        })
      );

      const nextAddress = this._extractAddress(result);
      if (nextAddress && nextAddress !== this.currentAddress) {
        this.currentAddress = nextAddress;
        this._emitAddressChanged(nextAddress);
      }
    } catch (error) {
      if (options?.logErrors) {
        console.warn('[Web3ModalWC] Failed to refresh address from wallet:', error);
      }
    }

    return this.currentAddress;
  }

  /**
   * Check if WalletConnect is available
   * (WalletConnect works in all modern browsers)
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
   * Connect via WalletConnect v2
   */
  async connect(): Promise<WalletInfo> {
    try {
      await this._ensureClient();

      const reused = await this._reuseExistingSession();
      if (reused) {
        return reused;
      }

      // Create new session
      await this._createNewSession();

      return await this._getSessionInfo();
    } catch (error) {
      console.error('[Web3ModalWC] Connection failed:', error);
      throw walletRequestFailure(error, 'transaction');
    }
  }

  /**
   * Resume a stored WalletConnect session without prompting. Returns null when
   * no stored session is usable, so a page load never opens a pairing QR.
   */
  async restore(): Promise<WalletInfo | null> {
    await this._ensureClient();
    const info = await this._reuseExistingSession();
    if (!info && this.staleTopicCleanup) {
      // Cleanup publishes over the relay, so a slow or unreachable relay must
      // not hold page-load init open.
      const cleanupTimeoutMs = Number(
        import.meta.env.VITE_WALLETCONNECT_STALE_CLEANUP_TIMEOUT_MS || 3000
      );
      try {
        await this._withRequestTimeout(
          this.staleTopicCleanup,
          'WalletConnect stale session cleanup',
          cleanupTimeoutMs,
        );
      } catch (error) {
        console.warn('[Web3ModalWC] Continuing restore without waiting for cleanup:', error);
      }
    }
    return info;
  }

  private async _ensureClient(): Promise<SignClient> {
    if (!WALLETCONNECT_PROJECT_ID) {
      throw flowFailure('MISCONFIGURED', { details: 'No WalletConnect project ID in this build.' });
    }

    if (this.client) {
      return this.client;
    }

    this.client = await getSignClient(WALLETCONNECT_PROJECT_ID);
    return this.client;
  }

  private async _reuseExistingSession(): Promise<WalletInfo | null> {
    if (!this.client) return null;

    const existingSessions = this.client.session.getAll();
    if (existingSessions.length === 0) {
      return null;
    }

    console.log('[Web3ModalWC] Found existing session(s), validating...');

    const sortedSessions = [...existingSessions].sort((a, b) => (b.expiry || 0) - (a.expiry || 0));
    for (const candidate of sortedSessions) {
      if (!this._isSessionStructurallyUsable(candidate)) {
        continue;
      }

      this.session = candidate;
      try {
        console.log('[Web3ModalWC] Reusing active WalletConnect session');
        // Clean up stale sessions/pairings so the relay isn't subscribed to
        // dead topics. Without this, the relay floods the client with old
        // messages from prior sessions and onRelayMessage() spams decryption failures.
        void this._cleanupStaleTopics(candidate.topic);

        const info = await this._getSessionInfo();
        await this._subscribeToEvents();

        // Probe session health in the background without blocking restore.
        void this._validateSession(candidate).then((isUsable) => {
          if (!isUsable) {
            console.warn('[Web3ModalWC] Reused session failed live probe; will request fresh session on next connect');
          }
        });

        return info;
      } catch (error) {
        console.warn('[Web3ModalWC] Failed to hydrate existing session candidate:', error);
        this.session = null;
      }
    }

    console.warn('[Web3ModalWC] Existing WalletConnect sessions are stale');
    // Disconnect everything before a fresh session is requested
    this.staleTopicCleanup = this._cleanupStaleTopics(null);
    this.session = null;
    return null;
  }

  /**
   * Disconnect all sessions + pairings except the one keep-topic refers to.
   * Without this, prior sessions stored in IndexedDB stay subscribed on the
   * relay, and the client gets flooded with old encrypted messages it can't
   * decrypt ("onRelayMessage() -> failed to process an inbound message").
   *
   * Pass `null` to wipe everything.
   */
  private async _cleanupStaleTopics(keepTopic: string | null): Promise<void> {
    if (!this.client) return;

    try {
      const sessions = this.client.session.getAll();
      const staleSessions = sessions.filter((s) => s.topic !== keepTopic);

      if (staleSessions.length === 0 && keepTopic !== null) {
        return;
      }

      console.log(`[Web3ModalWC] Cleaning up ${staleSessions.length} stale session(s)`);

      const disconnectReason = { code: 6000, message: WALLET_PROMPTS.replaced };
      await Promise.allSettled(
        staleSessions.map((s) =>
          this.client!.disconnect({ topic: s.topic, reason: disconnectReason })
        )
      );

      // Pairings outlive sessions; disconnect any pairing not tied to the
      // session we're keeping.
      const pairings = this.client.core.pairing.getPairings();
      const sessionPairingTopic = keepTopic
        ? sessions.find((s) => s.topic === keepTopic)?.pairingTopic
        : null;
      const stalePairings = pairings.filter((p) => p.topic !== sessionPairingTopic);

      if (stalePairings.length > 0) {
        console.log(`[Web3ModalWC] Cleaning up ${stalePairings.length} stale pairing(s)`);
        await Promise.allSettled(
          stalePairings.map((p) =>
            this.client!.core.pairing.disconnect({ topic: p.topic })
          )
        );
      }
    } catch (error) {
      console.warn('[Web3ModalWC] Stale topic cleanup failed (non-fatal):', error);
    }
  }

  private _isSessionStructurallyUsable(session: SessionTypes.Struct): boolean {
    // WalletConnect expiry is in seconds.
    const nowSeconds = Math.floor(Date.now() / 1000);
    if ((session.expiry || 0) <= nowSeconds + 5) {
      return false;
    }

    const primaryChain = this._getPrimaryChain();
    const namespace = session.namespaces?.bch;
    if (!namespace || !Array.isArray(namespace.accounts) || namespace.accounts.length === 0) {
      return false;
    }
    if (!Array.isArray(namespace.methods) || !namespace.methods.includes('bch_signTransaction')) {
      return false;
    }
    if (!namespace.accounts.some((account) => account.startsWith(`${primaryChain}:`))) {
      return false;
    }

    return true;
  }

  private async _validateSession(session: SessionTypes.Struct): Promise<boolean> {
    if (!this.client) return false;
    if (!this._isSessionStructurallyUsable(session)) {
      return false;
    }

    try {
      const primaryChain = this._getPrimaryChain();
      const validationTimeoutMs = Number(
        import.meta.env.VITE_WALLETCONNECT_SESSION_VALIDATION_TIMEOUT_MS || 8000
      );
      const result = await this._withRequestTimeout(
        this._requestWithoutRedirect(() =>
          this.client!.request({
            topic: session.topic,
            chainId: primaryChain,
            request: {
              method: 'bch_getAddresses',
              params: {},
            },
          })
        ),
        'WalletConnect session validation request',
        validationTimeoutMs,
      );

      const address = this._extractAddress(result);
      if (!address) return false;
      this.currentAddress = address;
      return true;
    } catch (error) {
      console.warn('[Web3ModalWC] Session validation failed:', error);
      return false;
    }
  }

  /**
   * Create new WalletConnect session
   */
  private async _createNewSession(): Promise<void> {
    if (!this.client) throw flowFailure('UNKNOWN', { details: 'WalletConnect client is not set up.' });

    console.log('[Web3ModalWC] Creating new session...');

    // Determine chain based on network
    const primaryChain = BCH_NETWORK === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';

    console.log(`[Web3ModalWC] Requesting ${BCH_NETWORK} network (chain: ${primaryChain})`);

    // Create connection request
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
      throw flowFailure('RELAY_UNREACHABLE', { details: 'WalletConnect returned no pairing link.' });
    }

    const approvalPromise = approval();
    approvalPromise.catch((error: unknown) => console.debug('[Web3ModalWC] Pairing proposal ended:', error));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stopped = new Promise<never>((_, reject) => {
      this.cancelPairing = () => reject(flowFailure('PAIRING_CANCELLED'));
      timer = setTimeout(() => reject(flowFailure('PAIRING_TIMEOUT')), PAIRING_TIMEOUT_MS);
    });

    try {
      await this._showPairingDialog(uri);
      this.session = (await Promise.race([approvalPromise, stopped])) as SessionTypes.Struct;
      console.log('[Web3ModalWC] Session approved');
    } catch (error) {
      if (isAbandonedPairing(error)) abandonPairing(this.client, uri, approvalPromise);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      this.cancelPairing = null;
      this.hidePairing?.();
      this.hidePairing = null;
    }

    // Subscribe to events
    await this._subscribeToEvents();
  }

  private async _showPairingDialog(uri: string): Promise<void> {
    const copy = this.pairingCopy;
    this.hidePairing = showPairingDialog({
      title: copy.title,
      line: copy.line,
      qrValue: uri,
      qrCaption: copy.qrCaption,
      link: uri,
      open: { label: copy.openLabel, href: uri },
      onClose: () => this.cancelPairing?.(),
    });
  }

  /**
   * Subscribe to WalletConnect events
   */
  private async _subscribeToEvents(): Promise<void> {
    if (!this.client) return;
    if (this.clientEventsSubscribed) return;

    console.log('[Web3ModalWC] Subscribing to events...');

    this.client.on('session_ping', (args) => {
      console.log('[Web3ModalWC] Ping:', args);
    });

    this.client.on('session_event', (args) => {
      console.log('[Web3ModalWC] Event:', args);
      const { params } = args;
      if (params.chainId !== this._getPrimaryChain()) return;

      if (params.event.name === 'addressesChanged') {
        const nextAddress = this._extractAddress(params.event.data);
        if (nextAddress && nextAddress !== this.currentAddress) {
          this.currentAddress = nextAddress;
          this._emitAddressChanged(nextAddress);
        }
      }

      // Emit event to registered listeners
      const listeners = this.eventListeners.get(params.event.name);
      if (listeners) {
        listeners.forEach((cb) => cb(params.event.data));
      }
    });

    this.client.on('session_update', ({ topic, params }) => {
      console.log('[Web3ModalWC] Session update:', topic, params);
      if (this.session && this.session.topic === topic) {
        this.session = { ...this.session, namespaces: params.namespaces };
      }
    });

    this.client.on('session_delete', (args) => {
      console.log('[Web3ModalWC] Session deleted:', args);

      const currentTopic = this.session?.topic;
      const deletedTopic = this._isRecord(args) && typeof args.topic === 'string'
        ? args.topic
        : null;

      if (currentTopic) {
        if (deletedTopic && deletedTopic !== currentTopic) {
          console.log('[Web3ModalWC] Ignoring stale session delete event for topic:', deletedTopic);
          return;
        }
        const currentSessionStillActive = this.client?.session.getAll().some((session) => session.topic === currentTopic);
        if (currentSessionStillActive) {
          console.log('[Web3ModalWC] Ignoring session delete because active session is still present');
          return;
        }
      }

      // Emit disconnect event
      const listeners = this.eventListeners.get('disconnect');
      if (listeners) {
        listeners.forEach((cb) => cb(args));
      }

      // Clean up
      this._reset();
    });

    this.clientEventsSubscribed = true;
  }

  /**
   * Get wallet info from session
   */
  private async _getSessionInfo(): Promise<WalletInfo> {
    if (!this.session) {
      throw flowFailure('WALLET_SESSION_ENDED');
    }

    // Get BCH accounts from session
    const bchNamespace = this.session.namespaces.bch;
    if (!bchNamespace || !bchNamespace.accounts || bchNamespace.accounts.length === 0) {
      throw flowFailure('WALLET_UNSUPPORTED', { details: 'The wallet session has no Bitcoin Cash account.' });
    }

    // Format: bch:bitcoincash:qr... or bch:bchtest:qr...
    const accountString = bchNamespace.accounts[0];
    const accountParts = accountString.split(':');
    const chain = accountParts[1] || (BCH_NETWORK === 'chipnet' ? 'bchtest' : 'bitcoincash');
    const accountAddress = accountParts.slice(2).join(':');

    this.currentAddress = this._normalizeCashAddress(accountAddress || accountString);
    if (!this.currentAddress) {
      await this._syncAddressFromWallet({ logErrors: false });
    }

    // Determine network
    const network = chain === 'bchtest' ? 'chipnet' : 'mainnet';

    console.log('[Web3ModalWC] Connected:', { address: this.currentAddress, network });

    // Get balance
    const balance = await this.getBalance();

    return {
      address: this.currentAddress,
      network: network as 'mainnet' | 'chipnet',
      balance,
    };
  }

  /**
   * Get primary chain ID
   */
  private _getPrimaryChain(): string {
    return BCH_NETWORK === 'chipnet' ? 'bch:bchtest' : 'bch:bitcoincash';
  }

  /**
   * Reset connector state
   */
  private _reset(): void {
    this.session = null;
    this.currentAddress = null;
    this.eventListeners.clear();
    this.clientEventsSubscribed = false;

    // Clear localStorage WC2 entries
    if (typeof window !== 'undefined') {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('wc@2')) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  /**
   * Disconnect from WalletConnect
   */
  async disconnect(): Promise<void> {
    if (this.client && this.session) {
      try {
        await this.client.disconnect({
          topic: this.session.topic,
          reason: {
            code: 6000,
            message: WALLET_PROMPTS.disconnected,
          },
        });
        console.log('[Web3ModalWC] Disconnected');
      } catch (error) {
        console.error('[Web3ModalWC] Disconnect error:', error);
      }
    }

    this._reset();
    this.client = null;
  }

  /**
   * Get connected address
   */
  async getAddress(): Promise<string> {
    if (!this.currentAddress) {
      await this._syncAddressFromWallet({ logErrors: false });
    }
    if (!this.currentAddress) {
      throw flowFailure('NOT_CONNECTED');
    }
    return this.currentAddress;
  }

  /**
   * Get public key
   * WalletConnect uses placeholder substitution like Paytaca
   */
  async getPublicKey(): Promise<string> {
    throw flowFailure('WALLET_UNSUPPORTED', {
      details: 'WalletConnect wallets fill in the public key while signing. Use a 33-byte zero placeholder.',
    });
  }

  // In-memory balance cache. Prevents back-to-back fetches from spamming
  // the rate-limited backend when reconnect/init effects race.
  private balanceCache: { address: string; value: WalletBalance; expiresAt: number } | null = null;
  private balanceInFlight: Promise<WalletBalance | null> | null = null;

  /**
   * Get wallet balance via backend API. Cached for 10s per address;
   * concurrent callers share the same in-flight promise.
   */
  async getBalance(): Promise<WalletBalance | null> {
    if (!this.currentAddress) {
      return null;
    }

    const address = this.currentAddress;
    const now = Date.now();
    if (
      this.balanceCache
      && this.balanceCache.address === address
      && this.balanceCache.expiresAt > now
    ) {
      return this.balanceCache.value;
    }

    if (this.balanceInFlight) {
      return this.balanceInFlight;
    }

    this.balanceInFlight = (async () => {
      try {
        const response = await fetch(
          `/api/wallet/balance/${encodeURIComponent(address)}`
        );
        if (!response.ok) {
          console.warn('[Web3ModalWC] Balance API returned error:', response.status);
          return null;
        }
        const data = await response.json();
        const value: WalletBalance = { sat: data.sat || 0, bch: data.bch || 0 };
        this.balanceCache = { address, value, expiresAt: Date.now() + 10_000 };
        return value;
      } catch (error) {
        console.error('[Web3ModalWC] Failed to fetch balance:', error);
        return null;
      } finally {
        this.balanceInFlight = null;
      }
    })();

    return this.balanceInFlight;
  }

  /**
   * Sign simple transaction
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw flowFailure('WALLET_UNSUPPORTED', { details: 'WalletConnect wallets only sign fully built transactions.' });
  }

  /**
   * Suppress chrome-extension:// redirects that the WC SDK triggers after requests.
   * The SDK tries to deep-link to the wallet app but on desktop this causes
   * unwanted navigation to chrome-extension://invalid/ or extension pages.
   */
  private async _requestWithoutRedirect<T>(fn: () => Promise<T>): Promise<T> {
    const originalOpen = window.open;
    window.open = (url?: string | URL, ...rest: any[]) => {
      const urlStr = url?.toString() || '';
      if (urlStr.startsWith('chrome-extension://') || urlStr === '') {
        console.log('[Web3ModalWC] Suppressed extension redirect:', urlStr);
        return null;
      }
      return originalOpen.call(window, url, ...rest);
    };
    try {
      return await fn();
    } finally {
      window.open = originalOpen;
    }
  }

  /**
   * Sign CashScript transaction via WalletConnect
   *
   * Uses libauth stringify for proper serialization of Uint8Array and BigInt
   */
  async signCashScriptTransaction(options: CashScriptSignOptions): Promise<CashScriptSignResponse> {
    if (!this.client || !this.session) {
      throw flowFailure('NOT_CONNECTED');
    }

    try {
      const connectedChain = this._getPrimaryChain();

      console.log('[Web3ModalWC] Signing transaction...', {
        chain: connectedChain,
        broadcast: options.broadcast ?? true,
      });

      // Use libauth stringify to handle Uint8Arrays and BigInts
      const serializedParams = JSON.parse(
        stringify({
          transaction: options.transaction,
          sourceOutputs: options.sourceOutputs,
          broadcast: options.broadcast ?? true,
          userPrompt: options.userPrompt || WALLET_PROMPTS.transaction,
        })
      );

      const result = await this._withRequestTimeout(
        this._requestWithoutRedirect(() =>
          this.client!.request({
            topic: this.session!.topic,
            chainId: connectedChain,
            request: {
              method: 'bch_signTransaction',
              params: serializedParams,
            },
          })
        ),
        'WalletConnect sign transaction request'
      );

      const typedResult = result as {
        signedTransaction: string;
        signedTransactionHash: string;
      };

      console.log('[Web3ModalWC] Transaction signed:', typedResult.signedTransactionHash);

      return {
        signedTransaction: typedResult.signedTransaction,
        signedTransactionHash: typedResult.signedTransactionHash,
      };
    } catch (error) {
      console.error('[Web3ModalWC] Signing failed:', error);

      const reason = this._extractErrorMessage(error, 'Wallet returned an empty error response');
      const failure = walletRequestFailure(reason, 'transaction');
      if (failure.code === 'WALLET_TIMEOUT') {
        try {
          await this.disconnect();
        } catch (disconnectError) {
          console.warn('[Web3ModalWC] Reset after a signing timeout failed:', disconnectError);
        }
      }
      throw failure;
    }
  }

  /**
   * Sign message via WalletConnect
   */
  async signMessage(message: string, userPrompt?: string): Promise<string> {
    if (!this.client || !this.session) {
      throw flowFailure('NOT_CONNECTED');
    }

    try {
      const connectedChain = this._getPrimaryChain();

      console.log('[Web3ModalWC] Signing message...');

      const result = await this._withRequestTimeout(
        this._requestWithoutRedirect(() =>
          this.client!.request({
            topic: this.session!.topic,
            chainId: connectedChain,
            request: {
              method: 'bch_signMessage',
              params: { message, userPrompt: userPrompt || WALLET_PROMPTS.signInMessage },
            },
          })
        ),
        'WalletConnect sign message request'
      );

      console.log('[Web3ModalWC] Message signed');
      return normalizeSignatureResponse(result);
    } catch (error) {
      console.error('[Web3ModalWC] Message signing failed:', error);
      throw walletRequestFailure(this._extractErrorMessage(error, 'Wallet returned an empty error response'), 'signIn');
    }
  }

  /**
   * Register event listener
   */
  on(event: 'addressChanged' | 'disconnect', callback: (data?: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    const listeners = this.eventListeners.get(event)!;
    if (!listeners.includes(callback)) {
      listeners.push(callback);
    }

    console.log(`[Web3ModalWC] Event listener registered: ${event}`);
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

    console.log(`[Web3ModalWC] Event listener removed: ${event}`);
  }
}
