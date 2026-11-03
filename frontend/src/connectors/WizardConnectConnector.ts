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

import { DappConnectionManager, type StoredSession } from '@wizardconnect/dapp';
import {
  initiateDappRelay,
  PATH_RECEIVE,
  childIndexOfPathName,
  type DappRelayResult,
  type PathXpub,
  type RelayUpdatePayload,
} from '@wizardconnect/core';
import {
  encodeCashAddress,
  ripemd160,
  sha256,
  binToHex,
  hexToBin,
  hashTransaction,
  encodeTransaction,
  type TransactionCommon,
} from '@bitauth/libauth';
import type {
  IWalletConnector,
  WalletType,
  WalletInfo,
  WalletBalance,
  Transaction,
  SignedTransaction,
  CashScriptSignOptions,
  CashScriptSignResponse,
  SourceOutput,
} from '../types/wallet';
import { flowFailure, walletRequestFailure } from '../copy/errors';
import { PAIRING, WALLET_PROMPTS } from '../copy/wallets';
import { showPairingDialog } from './pairingDialog';

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

type LibauthInput = TransactionCommon['inputs'][number];

/**
 * Convert a libauth source output into hdwalletv1's relay-safe JSON, matching
 * `@wizardconnect/core`'s `sourceOutputToRelay`: bytecode/category as plain hex,
 * amounts as `<bigint: Xn>`. Outpoint + sequence come from the aligned spending
 * input (always present after decode) since our SourceOutput carries them only
 * conditionally.
 */
function toRelaySourceOutput(
  so: SourceOutput,
  input: LibauthInput | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    outpointTransactionHash: input ? binToHex(input.outpointTransactionHash) : '',
    outpointIndex: input ? input.outpointIndex : 0,
    unlockingBytecode: binToHex(so.unlockingBytecode ?? input?.unlockingBytecode ?? new Uint8Array(0)),
    sequenceNumber: input ? input.sequenceNumber : 0xffffffff,
    valueSatoshis: `<bigint: ${so.valueSatoshis ?? 0n}n>`,
    lockingBytecode: binToHex(so.lockingBytecode ?? new Uint8Array(0)),
  };
  if (so.token) {
    result.token = {
      category: binToHex(so.token.category),
      amount: `<bigint: ${so.token.amount}n>`,
      ...(so.token.nft
        ? {
            nft: {
              capability: so.token.nft.capability,
              commitment: binToHex(so.token.nft.commitment),
            },
          }
        : {}),
    };
  }
  return result;
}

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

  /** hdwalletv1 has no sign_message action; login uses the proof transaction. */
  supportsMessageSigning = false;

  private dappMgr: DappConnectionManager | null = null;
  private relay: DappRelayResult | null = null;
  private currentAddress: string | null = null;
  private network: 'mainnet' | 'testnet' | 'chipnet';

  private hidePairing: (() => void) | null = null;
  // Set while waiting for the wallet to scan the QR; lets closing the pairing
  // dialog reject the wait so connect() unwinds cleanly.
  private cancelPairing: ((err: Error) => void) | null = null;
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
      throw flowFailure('WALLET_UNSUPPORTED', { details: 'WizardConnect needs a browser.' });
    }

    console.log('[WizardConnect] Initiating relay...');

    this.dappMgr = this.createDappManager();

    const storedSession = this.dappMgr.loadStoredSession();
    const relay = this.openRelay(this.dappMgr, storedSession);

    if (storedSession?.paths?.length) {
      // Skip the QR step when we already have an authenticated session.
      return this.resumeStoredSession(storedSession.paths);
    }

    try {
      await this.showPairingDialog(relay.uri, relay.qrUri);

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
      throw walletRequestFailure(error, 'transaction');
    }
  }

  /**
   * Resume a stored, fully paired session without prompting. Returns null and
   * clears the half-finished pairing when there is nothing to resume, so a page
   * load never opens a relay QR.
   */
  async restore(): Promise<WalletInfo | null> {
    if (typeof window === 'undefined') return null;

    const dappMgr = this.createDappManager();
    const storedSession = dappMgr.loadStoredSession();
    if (!storedSession?.walletPublicKey || !storedSession.paths?.length) {
      dappMgr.clearStoredSession();
      dappMgr.destroy();
      return null;
    }

    this.dappMgr = dappMgr;
    this.openRelay(dappMgr, storedSession);

    try {
      return await this.resumeStoredSession(storedSession.paths);
    } catch (error) {
      await this.cleanupRelay();
      dappMgr.destroy();
      this.dappMgr = null;
      this.currentAddress = null;
      throw error;
    }
  }

  private createDappManager(): DappConnectionManager {
    return new DappConnectionManager('FlowGuard', `${window.location.origin}/favicon.svg`);
  }

  /**
   * Open the relay, reusing stored key material when the wallet already
   * completed a key exchange so it recognises us. walletPublicKey is only
   * populated after the first successful key-exchange.
   */
  private openRelay(dappMgr: DappConnectionManager, storedSession: StoredSession | null): DappRelayResult {
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

    const relay = initiateDappRelay(statusCallback, {
      explicitRelayUrls: RELAY_URLS,
      existingCredentials,
    });
    this.relay = relay;
    dappMgr.attachRelay(relay);
    return relay;
  }

  private async resumeStoredSession(paths: PathXpub[]): Promise<WalletInfo> {
    if (!this.dappMgr) throw flowFailure('UNKNOWN', { details: 'WizardConnect manager is not set up.' });

    this.dappMgr.restoreSessionPaths(paths);
    this.currentAddress = this.deriveReceiveAddress();
    console.log(
      '[WizardConnect] Restored session - address:',
      this.currentAddress,
    );
    // Restored sessions must also bridge a wallet-side disconnect to
    // useWallet, otherwise a reload leaves a stale "connected" UI.
    this.bindProtocolEvents();
    return this.buildWalletInfo();
  }

  async disconnect(): Promise<void> {
    if (this.dappMgr) {
      try {
        await this.dappMgr.sendDisconnect(WALLET_PROMPTS.disconnected);
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
    if (!this.dappMgr) throw flowFailure('WALLET_SESSION_ENDED');

    this.currentAddress = this.deriveReceiveAddress();
    return this.currentAddress;
  }

  /**
   * The wallet hands us BIP32 xpubs, so we can derive raw secp256k1 pubkeys
   * locally for any address index. Default path: receive/0.
   */
  async getPublicKey(): Promise<string> {
    if (!this.dappMgr) throw flowFailure('WALLET_SESSION_ENDED');

    const childIndex = childIndexOfPathName(PATH_RECEIVE);
    if (childIndex === undefined) {
      throw flowFailure('WALLET_SESSION_ENDED', { details: 'WizardConnect receive path is not registered.' });
    }

    const pubkey = this.dappMgr.getPubkey(childIndex, 0n);
    if (!pubkey) {
      throw flowFailure('WALLET_SESSION_ENDED', { details: 'WizardConnect wallet has not sent walletready yet.' });
    }
    return binToHex(pubkey);
  }

  /**
   * Balance is not exposed over the WizardConnect wire - fetch via the same
   * backend indexer Cashonize uses.
   */
  async getBalance(): Promise<WalletBalance | null> {
    if (!this.currentAddress) return null;

    try {
      const response = await fetch(
        `/api/wallet/balance/${encodeURIComponent(this.currentAddress)}`,
      );
      if (!response.ok) return null;
      const data = (await response.json()) as { bch?: number; sat?: number };
      return { bch: data.bch ?? 0, sat: data.sat ?? 0 };
    } catch (error) {
      console.error('[WizardConnect] balance fetch failed:', error);
      return null;
    }
  }

  /**
   * Simple sends are out of scope - FlowGuard always builds transactions
   * via libauth/CashScript before signing, so callers should use
   * signCashScriptTransaction(). Mirrors PaytacaNativeConnector behaviour.
   */
  async signTransaction(_tx: Transaction): Promise<SignedTransaction> {
    throw flowFailure('WALLET_UNSUPPORTED', { details: 'WizardConnect only signs fully built transactions.' });
  }

  /**
   * Sign a CashScript-compatible transaction. Maps FlowGuard's
   * CashScriptSignOptions onto the hdwalletv1 SignTransactionRequest payload.
   *
   * inputPaths default: every wallet-owned (non-contract) input at receive/0.
   * Covenant (P2SH) inputs are intentionally excluded so the wallet leaves their
   * pre-set unlocking script intact. Callers may override via options.inputPaths.
   */
  async signCashScriptTransaction(
    options: CashScriptSignOptions,
  ): Promise<CashScriptSignResponse> {
    if (!this.dappMgr) throw flowFailure('WALLET_SESSION_ENDED');

    // hdwalletv1 signs listed inputs as standard P2PKH: it derives the key at the
    // given path and REPLACES the input's unlocking script with <sig><pubkey>.
    // That is correct for wallet-owned inputs (P2PKH user coins on funding, the
    // auth-proof input on login) but destructive for a covenant (P2SH32) input —
    // it would overwrite the pre-set covenant unlocking script and the redeem-hash
    // check fails. So list ONLY non-contract inputs; covenant inputs (flagged on
    // the source output by deserializeWcSignOptions) keep their unlocking script
    // intact. A caller may still override via options.inputPaths.
    const decodedTransaction =
      typeof options.transaction === 'object' && options.transaction !== null
        ? (options.transaction as unknown as TransactionCommon)
        : undefined;
    const txInputs = decodedTransaction?.inputs ?? [];
    const keyedInputPaths: [number, string, number][] =
      options.sourceOutputs.length > 0
        ? options.sourceOutputs.flatMap((so, i): [number, string, number][] =>
            (so as { contract?: unknown }).contract ? [] : [[i, PATH_RECEIVE, 0]],
          )
        : txInputs.map((_, i): [number, string, number] => [i, PATH_RECEIVE, 0]);
    const inputPaths: [number, string, number][] = options.inputPaths ?? keyedInputPaths;

    // hdwalletv1's SignTransactionRequest wire format (see @wizardconnect/core's
    // hdwalletv1-serialize): the transaction is a HEX string and each source
    // output uses plain-hex bytecode + `<bigint: Xn>` values — NOT libauth's
    // extended-JSON object form. Sending the tx as an object makes the wallet
    // run decodeTransaction(hexToBin(<object>)) → empty → the exact failure we
    // saw: "Failed to decode transaction: requires 4 bytes, remaining 0".
    const transactionHex =
      typeof options.transaction === 'string'
        ? options.transaction
        : binToHex(encodeTransaction(options.transaction as unknown as TransactionCommon));
    const wcSignRequest = {
      transaction: transactionHex,
      sourceOutputs: options.sourceOutputs.map((so, i) =>
        toRelaySourceOutput(so, txInputs[i]),
      ),
      broadcast: options.broadcast ?? true,
      userPrompt: options.userPrompt || WALLET_PROMPTS.transaction,
    };

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
          transaction: wcSignRequest as never,
          inputPaths,
        },
        { signal: abortController.signal },
      );

      if (response.error) {
        throw walletRequestFailure(response.error, 'transaction');
      }

      const signedTransaction = response.signedTransaction;
      // Diagnostic: surface exactly what the wallet returned so a decode failure
      // is actionable (empty vs non-hex vs wrong key vs truncated).
      console.log('[WizardConnect] sign response:', {
        responseKeys: Object.keys(response ?? {}),
        signedType: typeof signedTransaction,
        signedLength: typeof signedTransaction === 'string' ? signedTransaction.length : undefined,
        signedHead: typeof signedTransaction === 'string' ? signedTransaction.slice(0, 80) : signedTransaction,
      });
      if (typeof signedTransaction !== 'string' || !/^[0-9a-fA-F]+$/.test(signedTransaction) || signedTransaction.length < 20) {
        throw flowFailure('WALLET_INCOMPLETE_SIGNATURE', {
          details:
            `WizardConnect returned an unusable signed transaction ` +
            `(type=${typeof signedTransaction}, len=${typeof signedTransaction === 'string' ? signedTransaction.length : 'n/a'}, ` +
            `head="${typeof signedTransaction === 'string' ? signedTransaction.slice(0, 40) : String(signedTransaction)}", ` +
            `keys=[${Object.keys(response ?? {}).join(',')}])`,
        });
      }

      // hdwalletv1 only sends back the signed hex - compute the txid locally.
      const signedTransactionHash = hashTransaction(hexToBin(signedTransaction));

      console.log(
        '[WizardConnect] Signed:',
        signedTransactionHash,
      );

      return { signedTransaction, signedTransactionHash };
    } catch (error) {
      throw walletRequestFailure(error, 'transaction');
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
    throw flowFailure('SIGN_IN_FAILED', {
      details: 'WizardConnect hdwalletv1 has no sign_message action. Sign-in uses the proof transaction.',
    });
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
    if (!this.dappMgr) throw flowFailure('UNKNOWN', { details: 'WizardConnect manager is not set up.' });
    const mgr = this.dappMgr;

    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timer);
        mgr.off('walletready', onReady);
        mgr.off('disconnect', onDisconnect);
        this.cancelPairing = null;
      };
      // Allow the QR overlay's close button / Escape to abort the wait.
      this.cancelPairing = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onDisconnect = (reason: unknown, message: string | undefined) => {
        cleanup();
        reject(flowFailure('WALLET_REJECTED', { details: message ?? String(reason ?? 'disconnect') }));
      };

      const timer = window.setTimeout(() => {
        cleanup();
        reject(flowFailure('PAIRING_TIMEOUT'));
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
    if (!this.dappMgr) throw flowFailure('UNKNOWN', { details: 'WizardConnect manager is not set up.' });

    const childIndex = childIndexOfPathName(PATH_RECEIVE);
    if (childIndex === undefined) {
      throw flowFailure('WALLET_SESSION_ENDED', { details: 'WizardConnect receive path is not registered.' });
    }

    const pubkey = this.dappMgr.getPubkey(childIndex, 0n);
    if (!pubkey) {
      throw flowFailure('WALLET_SESSION_ENDED', { details: 'WizardConnect wallet has not delivered its keys.' });
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

  private async showPairingDialog(uri: string, qrUri: string): Promise<void> {
    const copy = PAIRING.wizardconnect;
    this.hidePairing = showPairingDialog({
      title: copy.title,
      line: copy.line,
      qrValue: qrUri,
      qrCaption: copy.qrCaption,
      link: uri,
      beta: copy.beta,
      onClose: () => {
        if (this.cancelPairing) this.cancelPairing(flowFailure('PAIRING_CANCELLED'));
        else this.hideQrModal();
      },
    });
  }

  private hideQrModal(): void {
    this.hidePairing?.();
    this.hidePairing = null;
  }
}
