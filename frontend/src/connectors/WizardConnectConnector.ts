/**
 * WizardConnect Connector
 *
 * WizardConnect is a Bitcoin Cash-native dapp-to-wallet protocol built on top
 * of Nostr (NIP-17 gift-wrapped events over WebSocket). It is HD-aware
 * (BIP32 xpubs delivered up-front, dapp derives addresses locally),
 * CashTokens-aware, and CashScript-covenant-aware via the same
 * @bch-wc2/interfaces shapes Cashonize already uses.
 *
 * Production posture (Phase 1 research):
 *   - Pre-1.0 with active churn (16 core versions in ~2 months)
 *   - One production wallet today: Paytaca mobile (v0.24.x+)
 *   - One known third-party dapp (CashMint SDK)
 *
 * Ship posture: opt-in, gated behind VITE_ENABLE_WIZARDCONNECT, badged "Beta".
 *
 * Protocol references:
 *   https://gitlab.com/riftenlabs/lib/wizardconnect
 *   https://gitlab.com/riftenlabs/lib/wizardconnect/-/raw/master/docs/protocol.md
 *   https://gitlab.com/riftenlabs/lib/wizardconnect/-/raw/master/docs/dapp.md
 *
 * Reference implementation: CashMint SDK's WizardConnectSigner
 *   https://raw.githubusercontent.com/BCH-CashMint/cashmint-sdk/main/src/signer.ts
 */

import { DappConnectionManager } from '@wizardconnect/dapp';
import {
  initiateDappRelay,
  PATH_RECEIVE,
  childIndexOfPathName,
  type DappRelayResult,
  type RelayUpdatePayload,
} from '@wizardconnect/core';
import {
  encodeCashAddress,
  ripemd160,
  sha256,
  binToHex,
  hexToBin,
  hashTransaction,
} from '@bitauth/libauth';
import QRCode from 'qrcode';

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

// Connect-time timeout: wallet must complete handshake within this window.
const CONNECT_TIMEOUT_MS = 120_000;
// Sign-time timeout: wallet must respond to a sign request within this window.
const SIGN_TIMEOUT_MS = 180_000;
// LocalStorage key used by @wizardconnect/dapp's built-in session persistence.
const SESSION_STORAGE_KEY = 'wizardconnect-session';

/**
 * Relay URL preference list.
 *
 * Cauldron's relay is the de-facto production relay used by CashMint + Paytaca.
 * Riften Labs' own relay is the official default and is the redundancy hop.
 * Both are stock Nostr relays - no proprietary bridge.
 */
const RELAY_URLS = [
  'wss://relay.cauldron.quest:443',
  'wss://relay.riften.net:443',
];

/**
 * WizardConnect connector.
 *
 * Conforms to FlowGuard's IWalletConnector contract. The signTransaction()
 * convenience on DappConnectionManager handles sequence numbers, time stamps,
 * and AbortSignal cancellation for us; we forward the existing
 * CashScriptSignOptions shape unchanged because it already matches
 * WcSignTransactionRequest 1:1 (minus inputPaths).
 */
export class WizardConnectConnector implements IWalletConnector {
  type: WalletType = 'wizardconnect' as WalletType;

  private dappMgr: DappConnectionManager | null = null;
  private relay: DappRelayResult | null = null;
  private currentAddress: string | null = null;
  private network: 'mainnet' | 'testnet' | 'chipnet';

  private qrModal: HTMLDivElement | null = null;
  private eventListeners: Map<string, ((data?: unknown) => void)[]> = new Map();

  constructor() {
    this.network =
      (import.meta.env.VITE_BCH_NETWORK as 'mainnet' | 'testnet' | 'chipnet') ||
      'chipnet';
  }

  /**
   * WizardConnect runs entirely in-page (WebSocket transport, no extension
   * detection required). Available whenever we're in a browser context.
   */
  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && typeof WebSocket !== 'undefined';
  }

  async isConnected(): Promise<boolean> {
    return this.dappMgr !== null && this.currentAddress !== null;
  }

  /**
   * Connect: open a relay, render the wiz:// QR, wait for the wallet to
   * complete the handshake (walletready), then derive the first receive
   * address locally from the wallet-provided xpub.
   */
  async connect(): Promise<WalletInfo> {
    if (typeof window === 'undefined') {
      throw new Error('WizardConnect requires a browser environment');
    }

    console.log('[WizardConnect] Initiating relay...');

    const dappName = 'FlowGuard';
    const dappIcon = `${window.location.origin}/favicon.svg`;

    this.dappMgr = new DappConnectionManager(dappName, dappIcon);

    // Try to rehydrate a previous session (set by attachRelay + the protocol
    // layer). If present we reuse the same key material and pass it into
    // initiateDappRelay via existingCredentials so the wallet recognises us.
    //
    // walletPublicKey is only populated after the first successful key-exchange,
    // so we can only short-circuit the QR step when ALL three fields are present.
    const storedSession = this.dappMgr.loadStoredSession();
    const existingCredentials =
      storedSession?.walletPublicKey
        ? {
            privateKey: storedSession.privateKey,
            secret: storedSession.secret,
            walletPublicKey: storedSession.walletPublicKey,
          }
        : undefined;

    const statusCallback = (payload: RelayUpdatePayload) => {
      this.dappMgr?.updateConnection(payload.client, payload.status);
    };

    this.relay = initiateDappRelay(statusCallback, {
      explicitRelayUrls: RELAY_URLS,
      existingCredentials,
    });

    this.dappMgr.attachRelay(this.relay);

    if (storedSession?.paths?.length) {
      // Skip the QR step when we already have an authenticated session.
      this.dappMgr.restoreSessionPaths(storedSession.paths);
      this.currentAddress = this.deriveReceiveAddress();
      console.log(
        '[WizardConnect] Restored session - address:',
        this.currentAddress,
      );
      return this.buildWalletInfo();
    }

    try {
      await this.showQrModal(this.relay.uri, this.relay.qrUri);

      await this.waitForWalletReady();

      this.hideQrModal();

      this.currentAddress = this.deriveReceiveAddress();
      console.log(
        '[WizardConnect] Wallet ready - address:',
        this.currentAddress,
      );

      this.bindProtocolEvents();

      return this.buildWalletInfo();
    } catch (error) {
      this.hideQrModal();
      await this.cleanupRelay();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.dappMgr) {
      try {
        await this.dappMgr.sendDisconnect('User disconnected from FlowGuard');
      } catch (error) {
        console.warn('[WizardConnect] sendDisconnect failed:', error);
      }
      try {
        this.dappMgr.clearStoredSession();
        this.dappMgr.destroy();
      } catch (error) {
        console.warn('[WizardConnect] destroy failed:', error);
      }
    }

    await this.cleanupRelay();
    this.currentAddress = null;
    this.dappMgr = null;
    this.eventListeners.clear();
  }

  async getAddress(): Promise<string> {
    if (this.currentAddress) return this.currentAddress;
    if (!this.dappMgr) throw new Error('WizardConnect not connected');

    this.currentAddress = this.deriveReceiveAddress();
    return this.currentAddress;
  }

  /**
   * The wallet hands us BIP32 xpubs, so we can derive raw secp256k1 pubkeys
   * locally for any address index. Default path: receive/0.
   */
  async getPublicKey(): Promise<string> {
    if (!this.dappMgr) throw new Error('WizardConnect not connected');

    const childIndex = childIndexOfPathName(PATH_RECEIVE);
    if (childIndex === undefined) {
      throw new Error('WizardConnect: receive path is not registered');
    }

    const pubkey = this.dappMgr.getPubkey(childIndex, 0n);
    if (!pubkey) {
      throw new Error(
        'WizardConnect: pubkey unavailable - wallet has not sent walletready yet',
      );
    }
    return binToHex(pubkey);
  }

  /**
   * Balance is not exposed over the WizardConnect wire - fetch via the same
   * backend indexer Cashonize uses.
   */
  async getBalance(): Promise<WalletBalance> {
    if (!this.currentAddress) return { bch: 0, sat: 0 };

    try {
      const response = await fetch(
        `/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`,
      );
      if (!response.ok) return { bch: 0, sat: 0 };
      const data = (await response.json()) as { bch?: number; sat?: number };
      return { bch: data.bch ?? 0, sat: data.sat ?? 0 };
    } catch (error) {
      console.error('[WizardConnect] balance fetch failed:', error);
      return { bch: 0, sat: 0 };
    }
  }

  /**
   * Simple sends are out of scope - FlowGuard always builds transactions
   * via libauth/CashScript before signing, so callers should use
   * signCashScriptTransaction(). Mirrors PaytacaNativeConnector behaviour.
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw new Error(
      'WizardConnect requires fully constructed transactions. ' +
        'Use signCashScriptTransaction() with sourceOutputs.',
    );
  }

  /**
   * Sign a CashScript-compatible transaction. Maps FlowGuard's
   * CashScriptSignOptions onto the hdwalletv1 SignTransactionRequest payload.
   *
   * inputPaths default ([[0, 'receive', 0]]) covers single-input user spends.
   * Multi-input covenant spends MUST supply explicit inputPaths via the
   * extended options.inputPaths field - see /Users/mac/flow-guard/backend/src/utils/wcFundingBuilder.ts.
   */
  async signCashScriptTransaction(
    options: CashScriptSignOptions,
  ): Promise<CashScriptSignResponse> {
    if (!this.dappMgr) throw new Error('WizardConnect not connected');

    const inputPaths = options.inputPaths ?? [[0, PATH_RECEIVE, 0]];

    const abortController = new AbortController();
    const timer = window.setTimeout(
      () => abortController.abort(),
      SIGN_TIMEOUT_MS,
    );

    try {
      console.log('[WizardConnect] Signing transaction...', {
        broadcast: options.broadcast ?? true,
        inputs: inputPaths.length,
      });

      const response = await this.dappMgr.signTransaction(
        {
          transaction: {
            transaction: options.transaction as never,
            sourceOutputs: options.sourceOutputs as never,
            broadcast: options.broadcast ?? true,
            userPrompt: options.userPrompt,
          },
          inputPaths,
        },
        { signal: abortController.signal },
      );

      if (response.error) {
        throw new Error(`Wallet rejected sign: ${response.error}`);
      }

      const signedTransaction = response.signedTransaction;
      if (!signedTransaction) {
        throw new Error('Wallet returned empty signed transaction');
      }

      // hdwalletv1 only sends back the signed hex - compute the txid locally.
      const signedTransactionHash = hashTransaction(hexToBin(signedTransaction));

      console.log(
        '[WizardConnect] Signed:',
        signedTransactionHash,
      );

      return { signedTransaction, signedTransactionHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('aborted') ||
        message.includes('AbortError') ||
        message.includes('timeout')
      ) {
        throw new Error(
          'Transaction signing timed out - wallet did not respond',
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  /**
   * Message signing.
   *
   * IMPORTANT: hdwalletv1 v0.2 does not yet ship a `sign_message` wire action.
   * The protocol's only signing primitive is sign_transaction_request, which
   * means SIWX flows that need a personal-message signature cannot currently
   * be served by a WizardConnect wallet through hdwalletv1.
   *
   * Until the protocol gains sign_message, we raise a clear, actionable
   * error so the SIWX flow can degrade gracefully (the existing wallet
   * abstraction surfaces this via /Users/mac/flow-guard/frontend/src/hooks/useWallet.ts).
   */
  async signMessage(_message: string, _userPrompt?: string): Promise<string> {
    throw new Error(
      'WizardConnect hdwalletv1 does not support sign_message yet. ' +
        'Use Paytaca extension or Cashonize for SIWX authentication. ' +
        'Tracking upstream: https://gitlab.com/riftenlabs/lib/wizardconnect',
    );
  }

  on(event: 'addressChanged' | 'disconnect', callback: (data?: unknown) => void): void {
    const list = this.eventListeners.get(event) ?? [];
    list.push(callback);
    this.eventListeners.set(event, list);
  }

  off(event: string, callback: (data?: unknown) => void): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    const idx = list.indexOf(callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  private emit(event: string, data?: unknown): void {
    const list = this.eventListeners.get(event);
    if (!list) return;
    for (const cb of list) {
      try {
        cb(data);
      } catch (error) {
        console.warn(`[WizardConnect] listener for ${event} threw:`, error);
      }
    }
  }

  /**
   * Resolve once the wallet completes the handshake.
   * Rejects on disconnect or after CONNECT_TIMEOUT_MS.
   */
  private async waitForWalletReady(): Promise<void> {
    if (!this.dappMgr) throw new Error('Dapp manager not initialised');
    const mgr = this.dappMgr;

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        mgr.off('walletready', onReady);
        mgr.off('disconnect', onDisconnect);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onDisconnect = (reason: unknown, message: string | undefined) => {
        cleanup();
        reject(
          new Error(
            `WizardConnect rejected: ${message ?? String(reason ?? 'disconnect')}`,
          ),
        );
      };

      const timer = window.setTimeout(() => {
        cleanup();
        reject(
          new Error(
            'WizardConnect connection timed out - wallet did not scan the QR',
          ),
        );
      }, CONNECT_TIMEOUT_MS);

      mgr.on('walletready', onReady);
      mgr.on('disconnect', onDisconnect);
    });
  }

  /**
   * Wire post-connect protocol events to FlowGuard's event surface.
   * Disconnect from the wallet side -> emit "disconnect" so useWallet
   * clears local state.
   */
  private bindProtocolEvents(): void {
    if (!this.dappMgr) return;
    this.dappMgr.on('disconnect', (reason, message) => {
      console.log('[WizardConnect] Remote disconnect:', reason, message);
      this.emit('disconnect', { reason, message });
    });
  }

  /**
   * Derive a p2pkh address from the wallet's receive xpub.
   *
   * The wallet only ever sees xpubs leave the device once. All subsequent
   * address derivation is local: pubkey -> hash160 -> cashaddr.
   */
  private deriveReceiveAddress(): string {
    if (!this.dappMgr) throw new Error('Dapp manager not initialised');

    const childIndex = childIndexOfPathName(PATH_RECEIVE);
    if (childIndex === undefined) {
      throw new Error('WizardConnect: receive path is not registered');
    }

    const pubkey = this.dappMgr.getPubkey(childIndex, 0n);
    if (!pubkey) {
      throw new Error(
        'WizardConnect: pubkey unavailable - wallet has not delivered xpubs',
      );
    }

    const pubkeyHash = ripemd160.hash(sha256.hash(pubkey));
    const prefix = this.cashAddressPrefix();

    const result = encodeCashAddress({
      prefix,
      type: 'p2pkh',
      payload: pubkeyHash,
    });

    if (typeof result === 'string') return result;
    // libauth ^3 returns { address } when called as a non-throwing variant;
    // when called with default throwErrors it returns the raw string.
    return (result as { address: string }).address;
  }

  private cashAddressPrefix(): 'bitcoincash' | 'bchtest' | 'bchreg' {
    if (this.network === 'mainnet') return 'bitcoincash';
    if (this.network === 'testnet') return 'bchtest';
    return 'bchtest';
  }

  private async buildWalletInfo(): Promise<WalletInfo> {
    const address = this.currentAddress ?? this.deriveReceiveAddress();
    return {
      address,
      publicKey: await this.getPublicKey().catch(() => undefined),
      balance: await this.getBalance(),
      network: this.network,
    };
  }

  private async cleanupRelay(): Promise<void> {
    if (!this.relay) return;
    try {
      this.relay.cleanup();
    } catch (error) {
      console.warn('[WizardConnect] relay cleanup failed:', error);
    }
    this.relay = null;

    // Drop any stale persisted session that our cleanup might have left.
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // localStorage unavailable (SSR, private mode) - best-effort only.
    }
  }

  /**
   * QR display. Mirrors the CashonizeConnector pattern (createElement +
   * textContent, never innerHTML, never user-controlled HTML).
   */
  private async showQrModal(uri: string, qrUri: string): Promise<void> {
    const qrDataUrl = await QRCode.toDataURL(qrUri, {
      width: 300,
      margin: 2,
      color: { dark: '#1B1F1A', light: '#FFFFFF' },
    });

    const overlay = document.createElement('div');
    overlay.className =
      'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm';

    const card = document.createElement('div');
    card.className =
      'bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 relative';

    const header = document.createElement('div');
    header.className = 'text-center mb-4';

    const title = document.createElement('h3');
    title.className = 'text-xl font-semibold text-gray-900 mb-1';
    title.textContent = 'Connect with WizardConnect';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-sm text-gray-600';
    subtitle.textContent = 'Open Paytaca → Apps → WizardConnect and scan';
    header.append(title, subtitle);

    const qrWrap = document.createElement('div');
    qrWrap.className =
      'bg-white p-4 rounded-lg border-2 border-gray-200 mb-4 flex items-center justify-center';
    const qrImg = document.createElement('img');
    qrImg.src = qrDataUrl;
    qrImg.alt = 'WizardConnect QR code';
    qrImg.className = 'w-full max-w-[260px]';
    qrWrap.appendChild(qrImg);

    const uriRow = document.createElement('div');
    uriRow.className = 'flex items-stretch gap-2 mb-4';
    const uriField = document.createElement('input');
    uriField.type = 'text';
    uriField.readOnly = true;
    uriField.value = uri;
    uriField.className =
      'flex-1 min-w-0 px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 text-gray-700';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className =
      'px-3 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors';
    copyBtn.textContent = 'Copy';
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard?.writeText(uri).then(() => {
        copyBtn.textContent = 'Copied';
        window.setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 1500);
      });
    });
    uriRow.append(uriField, copyBtn);

    const beta = document.createElement('div');
    beta.className =
      'mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800';
    beta.textContent =
      'Beta - currently supported by Paytaca mobile only. Protocol may change.';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className =
      'absolute top-3 right-3 text-gray-400 hover:text-gray-700 text-2xl leading-none px-2';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => {
      this.hideQrModal();
    });

    card.append(closeBtn, header, qrWrap, uriRow, beta);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    this.qrModal = overlay;
  }

  private hideQrModal(): void {
    if (this.qrModal?.parentNode) {
      this.qrModal.parentNode.removeChild(this.qrModal);
    }
    this.qrModal = null;
  }
}
