/**
 * Blockchain transaction utilities
 * Handles wallet signing and transaction broadcasting
 */

import { binToHex, decodeTransaction, hashTransaction, hexToBin, isHex } from '@bitauth/libauth';
import { broadcastTransaction, getDepositInfo } from './api';
import { authFetch } from './auth';
import type { Transaction, SignedTransaction, CashScriptSignOptions, CashScriptSignResponse, SourceOutput } from '../types/wallet';
import { emitTransactionNotice, normalizeWalletNetwork } from './txNotice';
import {
  CodedError,
  apiFailure,
  asFlowError,
  classifyWalletError,
  flowFailure,
  rawErrorText,
  type ErrorCode,
  type SyncedOutcome,
} from '../copy/errors';
import { TX_NOTICES } from '../copy/wallets';
import { AIRDROP_CLAIM_PATTERNS, WALLET_STALE_COINS_PATTERN } from './walletErrorPatterns';

export interface SignTransactionRequest {
  txHex: string;
  requiresSignatures: string[]; // Public keys that need to sign
}

export interface SignTransactionResult {
  signedTxHex: string;
  txid: string;
}

export interface WalletInterface {
  signTransaction: (tx: Transaction) => Promise<SignedTransaction>;
  signRawTransaction?: (txHex: string) => Promise<string>;
  signCashScriptTransaction?: (options: CashScriptSignOptions) => Promise<CashScriptSignResponse>;
  signMessage: (message: string) => Promise<string>;
  getAddress?: () => Promise<string | null>;
  isConnected: boolean;
  address: string | null;
  walletType?: string | null;
  /**
   * Forwarded to `authFetch` so it can pick the login path. `false` (currently OPTN)
   * selects the proof-transaction login. Defaults to `true` when omitted.
   */
  supportsMessageSigning?: boolean;
  network?: 'mainnet' | 'testnet' | 'chipnet';
}

export interface SerializedSourceOutput {
  lockingBytecode: string;
  valueSatoshis: string;
  outpointTransactionHash?: string;
  outpointIndex?: number;
  unlockingBytecode?: string;
  sequenceNumber?: number;
  token?: {
    category: string;
    amount: string;
    nft?: { capability: 'none' | 'mutable' | 'minting'; commitment: string };
  };
  contract?: { abiFunction: object; redeemScript: string; artifact: object };
}

export interface SerializedWcTransaction {
  transaction: string;
  sourceOutputs: SerializedSourceOutput[];
  broadcast?: boolean;
  userPrompt?: string;
}

export interface LifecycleBuildResult<TPayload = Record<string, unknown>> {
  wcTransaction: SerializedWcTransaction;
  payload: TPayload;
  metadata?: {
    amount?: number;
    statusHint?: string;
    entityId?: string;
  };
}

export interface LifecycleConfirmResult {
  state: 'confirmed' | 'pending' | 'failed';
  txHash: string;
  retryable: boolean;
  message?: string;
  nextStatus?: string;
}

interface StreamCancelBuildPayload {
  vestedAmount?: number;
  unvestedAmount?: number;
  cancelReturnAddress?: string;
  senderAddress?: string;
}

interface RunLifecycleActionOptions<TPayload = Record<string, unknown>> {
  wallet: WalletInterface;
  /** Toast title once the transaction is sent, from TX_NOTICES in copy/wallets.ts. */
  actionLabel: string;
  /** Names the outcome when the transaction went out but FlowGuard's update didn't. */
  syncedOutcome?: SyncedOutcome;
  /** Log context only. Never shown. */
  signContext: string;
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  };
  retries?: number;
  retryDelayMs?: number;
  retryBackoffFactor?: number;
  build: (signerAddress: string) => Promise<LifecycleBuildResult<TPayload>>;
  confirm?: (args: {
    txHash: string;
    signerAddress: string;
    buildPayload: TPayload;
  }) => Promise<Response>;
  mapNextStatus?: (payload: any) => string | undefined;
}

const LIFECYCLE_RETRYABLE_ERROR_CODES = new Set([
  'TX_NOT_FOUND',
  'TX_NOT_INDEXED',
  'TX_PENDING',
  'TX_UNCONFIRMED',
  'INDEXER_LAG',
  'MEMPOOL_PROPAGATION',
  'BACKEND_RETRY',
  'CONFIRM_PENDING',
]);

const LIFECYCLE_RETRYABLE_MESSAGE_HINTS = [
  'transaction hash not found',
  'transaction not found on chipnet',
  'pending confirmation',
  'indexer',
  'still syncing',
  'mempool',
  'propagation',
  'temporarily unavailable',
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableLifecycleFailure(httpStatus: number, payload: any, message: string): boolean {
  if (payload?.retryable === true) return true;
  if (String(payload?.state || '').toLowerCase() === 'pending') return true;

  const code = String(payload?.errorCode || payload?.code || '').toUpperCase();
  if (LIFECYCLE_RETRYABLE_ERROR_CODES.has(code)) return true;

  if ([408, 409, 425, 429, 502, 503, 504].includes(httpStatus)) return true;

  const normalizedMessage = message.toLowerCase();
  return LIFECYCLE_RETRYABLE_MESSAGE_HINTS.some((hint) => normalizedMessage.includes(hint));
}

function resolveLifecycleNextStatus(payload: any): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  if (typeof payload.status === 'string') return payload.status;
  if (payload.stream && typeof payload.stream.status === 'string') return payload.stream.status;
  if (payload.payment && typeof payload.payment.status === 'string') return payload.payment.status;
  if (payload.campaign && typeof payload.campaign.status === 'string') return payload.campaign.status;
  if (payload.plan && typeof payload.plan.status === 'string') return payload.plan.status;
  if (payload.proposal && typeof payload.proposal.status === 'string') return payload.proposal.status;
  return undefined;
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function confirmWithRetries<TPayload>(
  options: RunLifecycleActionOptions<TPayload>,
  txHash: string,
  signerAddress: string,
  buildPayload: TPayload,
  confirmResult: LifecycleConfirmResult,
  mapNextStatus: (payload: any) => string | undefined,
): Promise<void> {
  if (!options.confirm) return;
  const maxAttempts = Math.max(1, options.retries ?? 6);
  const backoffFactor = Math.max(1, options.retryBackoffFactor ?? 1.2);
  let delay = Math.max(250, options.retryDelayMs ?? 1500);
  let lastRetryableMessage = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await options.confirm({ txHash, signerAddress, buildPayload });
    const payload = await parseJsonSafe(response);
    const message = getApiErrorMessage(payload, '');

    if (response.ok) {
      const serverState = String(payload?.state || '').toLowerCase();
      confirmResult.state = serverState === 'pending' ? 'pending' : 'confirmed';
      confirmResult.retryable = payload?.retryable === true || confirmResult.state === 'pending';
      confirmResult.message = message || undefined;
      confirmResult.nextStatus = mapNextStatus(payload);
      return;
    }

    const retryable = isRetryableLifecycleFailure(response.status, payload, message);
    if (!retryable) {
      throw apiFailure(payload, response.status, 'SENT_NOT_SYNCED');
    }

    lastRetryableMessage = message;
    if (attempt < maxAttempts) {
      await sleep(delay);
      delay = Math.round(delay * backoffFactor);
      continue;
    }

    confirmResult.state = 'pending';
    confirmResult.retryable = true;
    confirmResult.message = lastRetryableMessage || message || undefined;
    confirmResult.nextStatus = mapNextStatus(payload);
  }
}

export async function runLifecycleAction<TPayload = Record<string, unknown>>(
  options: RunLifecycleActionOptions<TPayload>
): Promise<{ build: LifecycleBuildResult<TPayload>; confirm: LifecycleConfirmResult }> {
  const signerAddress = await resolveWalletAddress(options.wallet);
  if (!options.wallet.signCashScriptTransaction) {
    throw flowFailure('WALLET_UNSUPPORTED');
  }

  const buildResult = await options.build(signerAddress);
  if (!buildResult?.wcTransaction) {
    throw flowFailure('SERVER_PREPARE_FAILED', { details: `${options.signContext}: no transaction to sign.` });
  }

  const signOptions = {
    ...deserializeWcSignOptions(buildResult.wcTransaction),
    // Standardized lifecycle: backend performs broadcast after wallet signing.
    broadcast: false,
  };

  const signResult = await options.wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(
    signResult,
    signOptions,
    options.signContext,
    options.wallet,
    options.metadata,
  );

  const mapNextStatus = options.mapNextStatus ?? resolveLifecycleNextStatus;

  const confirmResult: LifecycleConfirmResult = {
    state: 'confirmed',
    txHash,
    retryable: false,
  };

  if (options.confirm) {
    try {
      await confirmWithRetries(options, txHash, signerAddress, buildResult.payload, confirmResult, mapNextStatus);
    } catch (error) {
      // The transaction is already on the network. Only FlowGuard's own update failed,
      // so this is never reported as a failure.
      publishTransactionNotice(txHash, options.wallet, options.actionLabel);
      throw flowFailure('SENT_NOT_SYNCED', {
        params: options.syncedOutcome ? { outcome: options.syncedOutcome } : {},
        txid: txHash,
        details: rawErrorText(error),
      });
    }
  }

  publishTransactionNotice(txHash, options.wallet, options.actionLabel);
  return {
    build: buildResult,
    confirm: confirmResult,
  };
}

/**
 * Sign + broadcast a single WalletConnect transaction object (no confirm loop).
 * Used for standalone prep transactions such as the CashToken funding anchor,
 * which must be broadcast before the real funding tx can be built.
 */
export async function signAndBroadcastWcTransaction(
  wallet: WalletInterface,
  serialized: SerializedWcTransaction,
  context: string,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    fromAddress?: string;
  },
  notice: { label: string; step?: NoticeStep } = { label: TX_NOTICES.sent },
): Promise<string> {
  if (!wallet.signCashScriptTransaction) {
    throw flowFailure('WALLET_UNSUPPORTED');
  }
  const signOptions = {
    ...deserializeWcSignOptions(serialized),
    broadcast: false,
  };
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  const txHash = await resolveTxHashFromSignResult(signResult, signOptions, context, wallet, metadata);
  return publishTransactionNotice(txHash, wallet, notice.label, notice.step);
}

function requireSignedTransactionHex(signResult: CashScriptSignResponse, context: string): string {
  if (!signResult?.signedTransaction || typeof signResult.signedTransaction !== 'string') {
    throw flowFailure('WALLET_INCOMPLETE_SIGNATURE', { details: `${context}: the wallet returned no signed transaction.` });
  }
  return signResult.signedTransaction;
}

function inspectUnsignedPlaceholderInputs(txHex: string): number[] {
  const decoded = decodeTransaction(hexToBin(txHex));
  if (typeof decoded === 'string') return [];
  const placeholderPubkeyPattern = `21${'00'.repeat(33)}`;
  const placeholderSigPattern = `41${'00'.repeat(65)}`;
  const failedInputs: number[] = [];

  decoded.inputs.forEach((input, index) => {
    const unlockingHex = binToHex(input.unlockingBytecode);
    if (
      unlockingHex.includes(placeholderPubkeyPattern) ||
      unlockingHex.includes(placeholderSigPattern)
    ) {
      failedInputs.push(index);
    }
  });

  return failedInputs;
}

export async function resolveTxHashFromSignResult(
  signResult: CashScriptSignResponse,
  signOptions: CashScriptSignOptions,
  context: string,
  wallet: WalletInterface,
  metadata?: {
    txType?: 'create' | 'unlock' | 'proposal' | 'approve' | 'payout';
    vaultId?: string;
    proposalId?: string;
    amount?: number;
    fromAddress?: string;
    toAddress?: string;
  }
): Promise<string> {
  const signedTxHex = requireSignedTransactionHex(signResult, context);
  const unsignedPlaceholderInputs = inspectUnsignedPlaceholderInputs(signedTxHex);
  if (unsignedPlaceholderInputs.length > 0) {
    const oneBasedInputs = unsignedPlaceholderInputs.map((index) => index + 1).join(', ');
    throw flowFailure('WALLET_INCOMPLETE_SIGNATURE', {
      details: `${context}: placeholder left unsigned in input(s) ${oneBasedInputs}.`,
    });
  }
  const walletBroadcasts = signOptions.broadcast ?? true;

  if (walletBroadcasts) {
    if (signResult.signedTransactionHash) return signResult.signedTransactionHash;
    // The wallet signed but didn't say it sent it, so send it here before treating it
    // as on the network. A copy the wallet did relay comes back as already known.
    const localTxid = txidFromHex(signedTxHex);
    try {
      const broadcastResult = await broadcastTransaction(signedTxHex, wallet, metadata);
      return broadcastResult.txid;
    } catch (error) {
      if (localTxid && networkAlreadyHasIt(error)) return localTxid;
      throw error;
    }
  }

  const broadcastResult = await broadcastTransaction(signedTxHex, wallet, metadata);
  return signResult.signedTransactionHash || broadcastResult.txid;
}

const ALREADY_KNOWN = /already (?:in|known)|txn-already|transaction already in block chain/i;

function networkAlreadyHasIt(error: unknown): boolean {
  const failure = asFlowError(error);
  return ALREADY_KNOWN.test(`${failure.details ?? ''} ${error instanceof Error ? error.message : ''}`);
}

function txidFromHex(hex: string | undefined): string | null {
  if (!hex || !isHex(hex)) return null;
  const encoded = hexToBin(hex);
  return typeof decodeTransaction(encoded) === 'string' ? null : hashTransaction(encoded);
}

/** The server's own wording, for logs and pending notes. Never joined with a status phrase. */
function getApiErrorMessage(error: any, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  const diagnostics = error?.debug?.diagnostics ?? error?.diagnostics;
  if (diagnostics) {
    console.debug('[blockchain] API error diagnostics:', diagnostics);
  }
  const pick = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return pick(error.userMessage) || pick(error.message) || pick(error.error) || fallback;
}

type NoticeStep = { index: number; of: number };

/** Step 1 of a two-step action: the toast asks for the next approval instead of saying it's pending. */
const FIRST_OF_TWO: NoticeStep = { index: 1, of: 2 };

function publishTransactionNotice(txHash: string, wallet: WalletInterface, label: string, step?: NoticeStep): string {
  emitTransactionNotice({
    txHash,
    network: normalizeWalletNetwork(wallet.network),
    label,
    ...(step ? { step } : {}),
  });
  return txHash;
}

/** Throws from an action's prepare step when the server answered with an error. */
function prepareFailed(
  response: Response,
  payload: unknown,
  messages?: ReadonlyArray<readonly [RegExp, ErrorCode]>,
): CodedError {
  return apiFailure(payload, response.status, 'SERVER_PREPARE_FAILED', messages);
}

/** Throws when the server answered without the transaction to sign. */
function nothingToSign(details: string): CodedError {
  return flowFailure('SERVER_PREPARE_FAILED', { details });
}

/** Logs an action's failure and keeps its catalog code. Raw text from elsewhere is classified once. */
function actionFailure(error: unknown, context: string): CodedError {
  console.error(`[FlowGuard] ${context}:`, error);
  return error instanceof CodedError ? error : flowFailure(classifyWalletError(error), { cause: error });
}

/** Step 2 failures that mean the wallet or server hasn't seen the coins step 1 created yet. */
function isStaleAfterStepOne(failure: CodedError): boolean {
  if (failure.code === 'BROADCAST_SPENT_INPUTS' || failure.code === 'SERVER_PREPARE_FAILED') return true;
  return failure.code === 'UNKNOWN' && WALLET_STALE_COINS_PATTERN.test(failure.details ?? '');
}

/**
 * After step 1 of 2 went out, a step 2 failure keeps its own code and carries the
 * step 1 transaction. Waiting only helps while the new coins aren't seen yet, and a
 * decline is told as "step 1 is done" because step 1 did go out.
 */
function afterPreparationFailure(error: unknown, preparationTxId: string | null, context: string): CodedError {
  const failure = actionFailure(error, context);
  if (!preparationTxId || failure.code === 'SENT_NOT_SYNCED' || failure.code === 'SIGN_IN_REJECTED') return failure;
  const details = failure.details ?? failure.message;
  if (failure.code === 'WALLET_REJECTED' || isStaleAfterStepOne(failure)) {
    return flowFailure('STEP_PENDING', { txid: preparationTxId, details });
  }
  return flowFailure(failure.code, { txid: failure.txid ?? preparationTxId, details });
}


async function resolveWalletAddress(wallet: WalletInterface): Promise<string> {
  if (wallet.getAddress) {
    try {
      const refreshed = await wallet.getAddress();
      if (refreshed) return refreshed;
    } catch (error) {
      console.warn('[FlowGuard] Failed to refresh wallet address, using cached value:', error);
    }
  }

  if (wallet.address) {
    return wallet.address;
  }

  throw flowFailure('NOT_CONNECTED');
}

/**
 * Deserialize a serialized WC transaction payload from backend into wallet-ready signing options.
 * Also ensures non-contract inputs keep empty unlocking bytecode so wallets can recognize owned inputs.
 */
export function deserializeWcSignOptions(serialized: SerializedWcTransaction): CashScriptSignOptions {
  const decoded = decodeTransaction(hexToBin(serialized.transaction));
  if (typeof decoded === 'string') {
    throw flowFailure('SERVER_PREPARE_FAILED', { details: `Couldn't decode the transaction to sign: ${decoded}` });
  }

  const sourceOutputs: SourceOutput[] = serialized.sourceOutputs.map(so => {
    const out: SourceOutput & Record<string, unknown> = {
      lockingBytecode: hexToBin(so.lockingBytecode),
      valueSatoshis: BigInt(so.valueSatoshis),
    };
    // Extra outpoint fields needed by WalletConnect BCH signing spec
    if (so.outpointTransactionHash) out['outpointTransactionHash'] = hexToBin(so.outpointTransactionHash);
    if (so.outpointIndex !== undefined) out['outpointIndex'] = so.outpointIndex;
    if (so.unlockingBytecode !== undefined) out.unlockingBytecode = hexToBin(so.unlockingBytecode);
    if (so.sequenceNumber !== undefined) out['sequenceNumber'] = so.sequenceNumber;
    if (so.token) {
      out.token = {
        category: hexToBin(so.token.category),
        amount: BigInt(so.token.amount),
        ...(so.token.nft ? {
          nft: { capability: so.token.nft.capability, commitment: hexToBin(so.token.nft.commitment) },
        } : {}),
      };
    }
    if (so.contract) {
      out.contract = {
        abiFunction: so.contract.abiFunction as NonNullable<SourceOutput['contract']>['abiFunction'],
        redeemScript: hexToBin(so.contract.redeemScript),
        artifact: so.contract.artifact as NonNullable<SourceOutput['contract']>['artifact'],
      };
    }
    return out as SourceOutput;
  });

  for (let i = 0; i < sourceOutputs.length; i++) {
    const sourceOutput = sourceOutputs[i] as (SourceOutput & { contract?: unknown });
    const txInput = decoded.inputs[i];
    if (!txInput) continue;

    // For wallet-owned inputs, force empty unlocking bytecode so wallets actually sign.
    // Some builders include placeholder unlocking scripts in sourceOutputs; if those are
    // preserved on non-contract inputs, wallets may skip signing and the tx fails OP_EQUALVERIFY.
    if (!sourceOutput.contract) {
      txInput.unlockingBytecode = new Uint8Array(0);
      sourceOutput.unlockingBytecode = new Uint8Array(0);
      continue;
    }

    // Preserve explicit unlocking bytecode for contract inputs only.
    if (sourceOutput.unlockingBytecode !== undefined) {
      txInput.unlockingBytecode = sourceOutput.unlockingBytecode;
    }
  }

  return {
    transaction: decoded as Record<string, unknown>,
    sourceOutputs,
    broadcast: serialized.broadcast,
    userPrompt: serialized.userPrompt,
  };
}

/**
 * Create, sign, and broadcast an on-chain proposal
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @param userPublicKey The user's public key (hex)
 * @returns Transaction ID
 */
export async function createProposalOnChain(
  wallet: WalletInterface,
  proposalId: string,
  _userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string; amount?: number; toAddress?: string }
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.requestCreated,
    signContext: 'Proposal create signing failed',
    metadata: {
      txType: 'proposal',
      ...metadata,
      proposalId,
      fromAddress: wallet.address || undefined,
    },
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/proposals/${proposalId}/create-onchain`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });

      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }

      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return proposal creation transaction');
      }

      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/proposals/${proposalId}/confirm-create`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({
        txHash,
        metadata,
      }),
    }),
  });


  return confirm.txHash;
}

/**
 * Approve a proposal on-chain
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @param userPublicKey The user's public key (hex)
 * @returns Transaction ID
 */
export async function approveProposalOnChain(
  wallet: WalletInterface,
  proposalId: string,
  _userPublicKey: string,
  metadata?: { vaultId?: string; proposalId?: string }
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.requestApproved,
    signContext: 'Proposal approval signing failed',
    metadata: {
      txType: 'approve',
      ...metadata,
      proposalId,
      fromAddress: wallet.address || undefined,
    },
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/proposals/${proposalId}/approve-onchain`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });

      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }

      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return proposal approval transaction');
      }

      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/proposals/${proposalId}/confirm-approval`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({
        txHash,
        metadata,
      }),
    }),
  });


  return confirm.txHash;
}

/**
 * Execute a payout on-chain
 * @param wallet The wallet hook return value
 * @param proposalId The proposal ID
 * @returns Transaction ID
 */
export async function executePayoutOnChain(
  wallet: WalletInterface,
  proposalId: string,
  metadata?: { vaultId?: string; proposalId?: string; amount?: number; toAddress?: string }
): Promise<{
  status: 'pending' | 'broadcasted';
  sessionId: string;
  signaturesCollected: number;
  requiredSignatures: number;
  txid?: string;
  remainingSigners?: string[];
}> {
  if (!wallet.signCashScriptTransaction) {
    throw flowFailure('WALLET_UNSUPPORTED');
  }
  if (!wallet.address) {
    throw flowFailure('NOT_CONNECTED');
  }

  const apiUrl = '/api';
  const response = await authFetch(`${apiUrl}/proposals/${proposalId}/execute`, {
    wallet,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({ metadata }),
  });

  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw prepareFailed(response, payload);
  }
  if (!payload?.wcTransaction || !payload?.sessionId) {
    throw nothingToSign('Backend did not return execute signing session data');
  }

  const signOptions = deserializeWcSignOptions(payload.wcTransaction as SerializedWcTransaction);
  signOptions.broadcast = false;
  const signResult = await wallet.signCashScriptTransaction(signOptions);
  // Each signer's copy carries only that signer's signature and isn't valid on its own,
  // so it goes to the server, which combines the copies and broadcasts once.
  const signedTransaction = requireSignedTransactionHex(signResult, 'Proposal execute signing failed');

  const submitResponse = await authFetch(`${apiUrl}/proposals/${proposalId}/execute-signature`, {
    wallet,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-address': wallet.address,
    },
    body: JSON.stringify({
      sessionId: payload.sessionId,
      signedTransaction,
    }),
  });

  const submitResult = await parseJsonSafe(submitResponse);
  if (!submitResponse.ok) {
    throw prepareFailed(submitResponse, submitResult);
  }

  if (submitResult.pending || submitResult.state === 'pending') {
    return {
      status: 'pending',
      sessionId: payload.sessionId,
      signaturesCollected: submitResult.signaturesCollected ?? 1,
      requiredSignatures: submitResult.requiredSignatures ?? 2,
      remainingSigners: submitResult.remainingSigners,
    };
  }

  return {
    status: 'broadcasted',
    sessionId: payload.sessionId,
    signaturesCollected: submitResult.signaturesCollected ?? 2,
    requiredSignatures: submitResult.requiredSignatures ?? 2,
    txid: publishTransactionNotice(
      submitResult.txid || submitResult.txHash,
      wallet,
      TX_NOTICES.paymentSent,
    ),
  };
}


/**
 * Deposit BCH to a vault contract
 * This is a simple P2PKH → P2SH send using the wallet's native send() method
 * @param wallet The wallet hook return value
 * @param contractAddress The vault contract address (P2SH)
 * @param amountBCH The amount to deposit in BCH
 * @param onConfirm Optional confirmation callback that returns a promise resolving to boolean
 * @returns Transaction ID
 */
export async function depositToVault(
  wallet: WalletInterface,
  contractAddress: string,
  amountBCH: number,
  onConfirm?: (details: { amount: number; recipient: string; network: 'mainnet' | 'testnet' | 'chipnet' }) => Promise<boolean>,
  vaultId?: string,
): Promise<string> {
  try {
    if (!wallet.address) {
      throw flowFailure('NOT_CONNECTED');
    }

    if (amountBCH <= 0) {
      throw flowFailure('UNKNOWN', { details: 'Deposit amount must be greater than 0.' });
    }

    // Convert BCH to satoshis
    const amountSatoshis = Math.round(amountBCH * 100000000);

    // Preferred path: backend-built WC transaction that initializes vault state NFT.
    if (vaultId) {
      try {
        let depositInfo = await getDepositInfo(vaultId, wallet.address);
        // The first deposit creates the vault's state token from a coin at output index 0.
        // When the wallet has none, the server returns a self-send that makes one first.
        if (depositInfo?.requiresPreparation && depositInfo?.preparationTransaction) {
          await signAndBroadcastWcTransaction(
            wallet,
            depositInfo.preparationTransaction as SerializedWcTransaction,
            'Vault funding preparation',
            { txType: 'create', fromAddress: wallet.address || undefined },
            { label: TX_NOTICES.walletReady, step: FIRST_OF_TWO },
          );
          for (let attempt = 0; attempt < 15 && !depositInfo?.wcTransaction; attempt += 1) {
            await sleep(2500);
            depositInfo = await getDepositInfo(vaultId, wallet.address);
          }
          if (!depositInfo?.wcTransaction) {
            throw flowFailure('STEP_PENDING', { details: 'The vault deposit still needs its preparation step.' });
          }
        }
        if (depositInfo?.wcTransaction && wallet.signCashScriptTransaction) {
          const signOptions = deserializeWcSignOptions(depositInfo.wcTransaction as SerializedWcTransaction);
          signOptions.broadcast = false;
          const signResult = await wallet.signCashScriptTransaction(signOptions);
          const txHash = await resolveTxHashFromSignResult(
            signResult,
            signOptions,
            'Vault funding signing failed',
            wallet,
            {
              txType: 'create',
              vaultId,
              amount: amountBCH,
              fromAddress: wallet.address || undefined,
              toAddress: contractAddress,
            },
          );
          return publishTransactionNotice(txHash, wallet, TX_NOTICES.vaultDeposit);
        }

        const isInitialFunding = Number(depositInfo?.currentBalance || 0) <= 0 && Number(depositInfo?.amountToDeposit || 0) > 0;
        if (isInitialFunding) {
          if (!wallet.signCashScriptTransaction) {
            throw flowFailure('WALLET_UNSUPPORTED', { details: 'This wallet cannot sign the first vault deposit.' });
          }
          throw nothingToSign(depositInfo?.warning || 'The first vault deposit could not be built for this wallet.');
        }
      } catch (fundingError) {
        console.warn('[FlowGuard][VaultFunding] Failed to build state-NFT funding tx:', fundingError);
        throw fundingError;
      }
    }

    // For mainnet.cash wallets, show confirmation dialog if callback provided
    if (onConfirm && wallet.walletType === 'mainnet') {
      // Get network from wallet state (it's part of WalletState)
      const network = wallet.network || 'chipnet';
      const confirmed = await onConfirm({
        amount: amountBCH,
        recipient: contractAddress,
        network,
      });

      if (!confirmed) {
        throw flowFailure('WALLET_REJECTED');
      }
    }

    // Use wallet's signTransaction method to send BCH
    // This will use the wallet's native send() method (mainnet.cash or extension)
    const transaction: Transaction = {
      to: contractAddress,
      amount: amountSatoshis,
    };

    const signedTx = await wallet.signTransaction(transaction);
    const depositTxId = signedTx.txId || txidFromHex(signedTx.hex);

    if (!depositTxId) {
      throw flowFailure('SEND_UNCONFIRMED', { details: 'The wallet returned no transaction ID for the deposit.' });
    }

    return publishTransactionNotice(depositTxId, wallet, TX_NOTICES.vaultDeposit);
  } catch (error) {
    throw actionFailure(error, 'Failed to deposit to vault');
  }
}

/**
 * Get blockchain explorer URL for a transaction
 * @param txHash Transaction hash
 * @param network Network type (chipnet or mainnet)
 * @returns Explorer URL
 */
export function getExplorerTxUrl(txHash: string, network: 'chipnet' | 'mainnet' = 'chipnet'): string {
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/transaction/${txHash}`;
  }
  return `https://chipnet.chaingraph.cash/tx/${txHash}`;
}

/**
 * Get blockchain explorer URL for an address
 * @param address BCH address (with or without prefix)
 * @param network Network type (chipnet or mainnet)
 * @returns Explorer URL
 */
export function getExplorerAddressUrl(address: string, network: 'chipnet' | 'mainnet' = 'chipnet'): string {
  // Keep the address as-is (with prefix if present)
  // chaingraph.cash expects full address with prefix
  if (network === 'mainnet') {
    return `https://blockchair.com/bitcoin-cash/address/${address}`;
  }
  return `https://chipnet.chaingraph.cash/address/${address}`;
}

/**
 * Fund a stream contract with initial deposit
 * @param wallet The wallet hook return value
 * @param streamId The stream ID to fund
 * @returns Transaction ID
 */
async function fetchFundingInfo(wallet: WalletInterface, streamId: string): Promise<any> {
  const response = await authFetch(`/api/streams/${streamId}/funding-info`, {
    wallet,
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) {
    throw prepareFailed(response, payload);
  }
  return payload;
}

/**
 * CashToken funding may need a one-time "anchor" self-send first (BCH genesis
 * requires spending a coin at output-index 0). When the backend signals
 * needsAnchor, sign+broadcast that prep tx, then poll funding-info until the
 * fresh vout-0 coin registers so the real funding tx can be built.
 */
async function ensureFundingAnchor(wallet: WalletInterface, streamId: string): Promise<void> {
  let payload = await fetchFundingInfo(wallet, streamId);
  if (!payload?.needsAnchor || !payload?.wcTransaction) return;

  await signAndBroadcastWcTransaction(
    wallet,
    payload.wcTransaction as SerializedWcTransaction,
    'Stream funding preparation',
    { txType: 'create', fromAddress: wallet.address || undefined },
    { label: TX_NOTICES.walletReady, step: FIRST_OF_TWO },
  );

  for (let attempt = 0; attempt < 15; attempt += 1) {
    await sleep(2500);
    payload = await fetchFundingInfo(wallet, streamId);
    if (!payload?.needsAnchor) return;
  }
  throw flowFailure('STEP_PENDING', { details: 'The funding-info route still reports needsAnchor.' });
}

export async function fundStreamContract(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  try {
    const apiUrl = '/api';
    await ensureFundingAnchor(wallet, streamId);
    const { confirm } = await runLifecycleAction({
      wallet,
      actionLabel: TX_NOTICES.streamFunded,
      signContext: 'Stream funding signing failed',
      metadata: {
        txType: 'create',
        fromAddress: wallet.address || undefined,
      },
      build: async () => {
        const payload = await fetchFundingInfo(wallet, streamId);

        if (payload?.needsAnchor) {
          throw flowFailure('STEP_PENDING', { details: 'The funding-info route still reports needsAnchor.' });
        }

        const { wcTransaction } = payload;
        if (!wcTransaction) {
          throw nothingToSign('Stream funding requires a CashScript-compatible wallet transaction object from backend.');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload,
        };
      },
      confirm: ({ txHash }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
        }),
      }),
    });

    if (confirm.state === 'pending' && confirm.message) {
      console.warn('[FlowGuard] Stream funding pending confirmation:', confirm.message);
    }

    return confirm.txHash;
  } catch (error) {
    throw actionFailure(error, 'Failed to fund stream');
  }
}

export async function fundBatchStreamContracts(
  wallet: WalletInterface,
  vaultId: string,
  payload: {
    senderAddress: string;
    tokenType: 'BCH' | 'FUNGIBLE_TOKEN';
    tokenCategory?: string;
    tokenDecimals?: number;
    launchContext?: {
      source: string;
      title?: string;
      description?: string;
      preferredLane?: string;
    };
    entries: Array<{
      recipient: string;
      totalAmount: number;
      streamType: 'LINEAR' | 'RECURRING' | 'STEP' | 'TRANCHE' | 'HYBRID';
      startTime: number;
      endTime?: number;
      cliffTimestamp?: number | null;
      cancelable: boolean;
      transferable?: boolean;
      refillable?: boolean;
      description?: string | null;
      intervalSeconds?: number;
      hybridUnlockTimestamp?: number;
      hybridUpfrontPercentage?: number;
      scheduleTemplate?: string | null;
      trancheSchedule?: Array<{
        unlockTime: number;
        amount: number;
        percentage?: number;
      }>;
    }>;
  },
): Promise<{ txId: string; streamIds: string[] }> {
  try {
    const { build, confirm } = await runLifecycleAction<{
      streams?: Array<{ id: string }>;
      wcTransaction: SerializedWcTransaction;
    }>({
      wallet,
      actionLabel: TX_NOTICES.streamsFunded,
      signContext: 'Batch stream funding signing failed',
      build: async () => {
        const response = await authFetch(`/api/treasuries/${vaultId}/batch-create`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const data = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, data);
        }

        if (!data.wcTransaction) {
          throw nothingToSign('Batch stream funding requires a CashScript-compatible wallet');
        }

        return {
          wcTransaction: data.wcTransaction as SerializedWcTransaction,
          payload: data,
        };
      },
      confirm: ({ txHash, buildPayload }) => {
        const streamIds = Array.isArray(buildPayload.streams)
          ? buildPayload.streams.map((stream) => stream.id)
          : [];

        return authFetch(`/api/treasuries/${vaultId}/batch-create/confirm`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            txHash,
            streamIds,
          }),
        });
      },
    });

    const streamIds = Array.isArray(build.payload.streams)
      ? build.payload.streams.map((stream) => stream.id)
      : [];

    if (confirm.state === 'pending' && confirm.message) {
      console.warn('[FlowGuard] Batch stream confirmation pending:', confirm.message);
    }

    return { txId: confirm.txHash, streamIds };
  } catch (error) {
    throw actionFailure(error, 'Failed to fund batch stream contracts');
  }
}

/**
 * Claim vested funds from a stream
 * @param wallet The wallet hook return value
 * @param streamId The stream ID to claim from
 * @returns Transaction ID
 */
export async function claimStreamFunds(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  try {
    const apiUrl = '/api';
    const { confirm } = await runLifecycleAction<{
      claimableAmount: number;
      wcTransaction: SerializedWcTransaction;
    }>({
      wallet,
      actionLabel: TX_NOTICES.streamClaimed,
      syncedOutcome: 'claim',
      signContext: 'Stream claim signing failed',
      build: async (signerAddress) => {
        const response = await authFetch(`${apiUrl}/streams/${streamId}/claim`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipientAddress: signerAddress,
            signerAddress,
          }),
        });

        const payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, payload);
        }

        const { claimableAmount, wcTransaction } = payload;
        if (!Number.isFinite(claimableAmount) || claimableAmount <= 0) {
          throw flowFailure('NOTHING_TO_CLAIM', { details: `Claimable amount: ${String(claimableAmount)}` });
        }
        if (!wcTransaction) {
          throw nothingToSign('No transaction returned from backend');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: {
            claimableAmount,
            wcTransaction: wcTransaction as SerializedWcTransaction,
          },
        };
      },
      confirm: ({ txHash, buildPayload }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-claim`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claimedAmount: buildPayload.claimableAmount,
          txHash,
        }),
      }),
    });

    if (confirm.state === 'pending' && confirm.message) {
      console.warn('[FlowGuard] Stream claim pending confirmation:', confirm.message);
    }

    return confirm.txHash;
  } catch (error) {
    throw actionFailure(error, 'Failed to claim stream');
  }
}

/**
 * Cancel a stream on-chain.
 */
export async function cancelStreamOnChain(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction<StreamCancelBuildPayload>({
    wallet,
    actionLabel: TX_NOTICES.streamCancelled,
    syncedOutcome: 'streamCancelled',
    signContext: 'Stream cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/streams/${streamId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({}),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: {
          vestedAmount: typeof payload.vestedAmount === 'number' ? payload.vestedAmount : undefined,
          unvestedAmount: typeof payload.unvestedAmount === 'number' ? payload.unvestedAmount : undefined,
          cancelReturnAddress:
            typeof payload.cancelReturnAddress === 'string' ? payload.cancelReturnAddress : undefined,
          senderAddress: typeof payload.senderAddress === 'string' ? payload.senderAddress : undefined,
        },
      };
    },
    confirm: ({ txHash, signerAddress, buildPayload }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({
        txHash,
        vestedAmount: buildPayload.vestedAmount,
        unvestedAmount: buildPayload.unvestedAmount,
        cancelReturnAddress: buildPayload.cancelReturnAddress,
        senderAddress: buildPayload.senderAddress,
      }),
    }),
  });

  return confirm.txHash;
}

/**
 * Pause a stream on-chain.
 */
export async function pauseStreamOnChain(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.streamPaused,
    syncedOutcome: 'streamPaused',
    signContext: 'Stream pause signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/streams/${streamId}/pause`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return pause transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-pause`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Resume a paused stream on-chain.
 */
export async function resumeStreamOnChain(
  wallet: WalletInterface,
  streamId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.streamResumed,
    signContext: 'Stream resume signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/streams/${streamId}/resume`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return resume transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-resume`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Refill an open-ended recurring stream with additional BCH/token runway.
 */
export async function refillStreamOnChain(
  wallet: WalletInterface,
  streamId: string,
  refillAmount: number,
): Promise<string> {
  if (!Number.isFinite(refillAmount) || refillAmount <= 0) {
    throw flowFailure('UNKNOWN', { details: 'Amount to add must be greater than 0.' });
  }

  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.streamFundsAdded,
    signContext: 'Stream add funds signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/streams/${streamId}/refill`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({ refillAmount }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return refill transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: {
          refillAmount,
        },
      };
    },
    confirm: ({ txHash, signerAddress, buildPayload }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-refill`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash, refillAmount: buildPayload.refillAmount }),
    }),
  });

  return confirm.txHash;
}

/**
 * Transfer a transferable vesting stream to a new recipient.
 */
export async function transferStreamOnChain(
  wallet: WalletInterface,
  streamId: string,
  newRecipientAddress: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.streamRecipientChanged,
    signContext: 'Stream recipient change signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/streams/${streamId}/transfer`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({ newRecipientAddress }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return transfer transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: { newRecipientAddress },
      };
    },
    confirm: ({ txHash, signerAddress, buildPayload }) => authFetch(`${apiUrl}/streams/${streamId}/confirm-transfer`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash, newRecipientAddress: buildPayload.newRecipientAddress }),
    }),
  });

  return confirm.txHash;
}

/**
 * Fund a recurring payment contract with initial deposit
 * @param wallet The wallet hook return value
 * @param paymentId The payment ID to fund
 * @returns Transaction ID
 */
export async function fundPaymentContract(
  wallet: WalletInterface,
  paymentId: string
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending'; detail?: string | null }> {
  let preparationTxId: string | null = null;
  try {
    if (!wallet.address) {
      throw flowFailure('NOT_CONNECTED');
    }

    const apiUrl = '/api';

    const fetchFundingInfo = async () => {
      const response = await authFetch(`${apiUrl}/payments/${paymentId}/funding-info`, {
        wallet,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw prepareFailed(response, await parseJsonSafe(response));
      }

      return response.json();
    };

    let data = await fetchFundingInfo();

    if (data.requiresPreparation && data.preparationTransaction) {
      console.log('[FlowGuard] Wallet needs consolidation for token creation, signing prep tx...');
      const prepOptions = {
        ...deserializeWcSignOptions(data.preparationTransaction),
        // Wallet-side broadcast can fail/hang on some BCH WC wallets.
        broadcast: false,
      };
      const prepResult = await wallet.signCashScriptTransaction!(prepOptions);
      preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed', wallet);
      console.log('[FlowGuard] Consolidation tx broadcast:', preparationTxId);
      publishTransactionNotice(preparationTxId, wallet, TX_NOTICES.walletReady, FIRST_OF_TWO);

      await new Promise(resolve => setTimeout(resolve, 8000));
      data = await fetchFundingInfo();
    }

    const { confirm } = await runLifecycleAction({
      wallet,
      actionLabel: TX_NOTICES.paymentFunded,
      signContext: 'Payment funding signing failed',
      metadata: {
        txType: 'create',
        fromAddress: wallet.address || undefined,
      },
      build: async () => {
        const { wcTransaction } = data;
        if (!wcTransaction) {
          throw nothingToSign('Payment funding requires a CashScript-compatible wallet transaction object from backend.');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: data,
        };
      },
      confirm: ({ txHash }) => authFetch(`${apiUrl}/payments/${paymentId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      }),
    });

    return {
      txHash: confirm.txHash,
      confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
      detail: confirm.message || null,
    };
  } catch (error) {
    throw afterPreparationFailure(error, preparationTxId, 'Failed to fund payment');
  }
}

/**
 * Claim interval payment
 * @param wallet The wallet hook return value
 * @param paymentId The payment ID to claim from
 * @returns Transaction ID
 */
export async function claimPaymentFunds(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  try {
    const apiUrl = '/api';
    const { confirm } = await runLifecycleAction<{
      claimableAmount: number;
      intervalsClaimable: number;
      wcTransaction: SerializedWcTransaction;
    }>({
      wallet,
      actionLabel: TX_NOTICES.paymentClaimed,
      syncedOutcome: 'claim',
      signContext: 'Payment claim signing failed',
      build: async (signerAddress) => {
        const response = await authFetch(`${apiUrl}/payments/${paymentId}/claim`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipientAddress: signerAddress,
            signerAddress,
          }),
        });

        const payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, payload);
        }

        const { claimableAmount, intervalsClaimable, wcTransaction } = payload;
        if (!Number.isFinite(claimableAmount) || claimableAmount <= 0) {
          throw flowFailure('NOTHING_TO_CLAIM', { details: `Claimable amount: ${String(claimableAmount)}` });
        }
        if (!wcTransaction) {
          throw nothingToSign('No WalletConnect-compatible claim transaction returned from backend');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: {
            claimableAmount,
            intervalsClaimable,
            wcTransaction: wcTransaction as SerializedWcTransaction,
          },
        };
      },
      confirm: ({ txHash, buildPayload }) => authFetch(`${apiUrl}/payments/${paymentId}/confirm-claim`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claimedAmount: buildPayload.claimableAmount,
          intervalsClaimed: buildPayload.intervalsClaimable,
          txHash,
        }),
      }),
    });

    return confirm.txHash;
  } catch (error) {
    throw actionFailure(error, 'Failed to claim payment');
  }
}

/**
 * Pause a recurring payment on-chain.
 */
export async function pausePaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.paymentPaused,
    syncedOutcome: 'paymentPaused',
    signContext: 'Payment pause signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/payments/${paymentId}/pause`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return pause transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash }) => authFetch(`${apiUrl}/payments/${paymentId}/confirm-pause`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Resume a recurring payment on-chain.
 */
export async function resumePaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.paymentResumed,
    signContext: 'Payment resume signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/payments/${paymentId}/resume`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return resume transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash }) => authFetch(`${apiUrl}/payments/${paymentId}/confirm-resume`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Cancel a recurring payment on-chain.
 */
export async function cancelPaymentOnChain(
  wallet: WalletInterface,
  paymentId: string
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.paymentCancelled,
    syncedOutcome: 'paymentCancelled',
    signContext: 'Payment cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/payments/${paymentId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash }) => authFetch(`${apiUrl}/payments/${paymentId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Cancel an airdrop campaign on-chain.
 */
export async function cancelAirdropOnChain(
  wallet: WalletInterface,
  airdropId: string,
  options?: { allowUnsafeRecovery?: boolean }
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.airdropCancelled,
    signContext: 'Airdrop cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/airdrops/${airdropId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({
          allowUnsafeRecovery: options?.allowUnsafeRecovery === true,
        }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/airdrops/${airdropId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Fund an airdrop contract with tokens
 * @param wallet The wallet hook return value
 * @param airdropId The airdrop campaign ID to fund
 * @returns Transaction ID
 */
export async function fundAirdropContract(
  wallet: WalletInterface,
  airdropId: string
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending'; detail?: string | null }> {
  let preparationTxId: string | null = null;
  try {
    if (!wallet.address) {
      throw flowFailure('NOT_CONNECTED');
    }

    const apiUrl = '/api';

    const fetchFundingInfo = async () => {
      const response = await authFetch(`${apiUrl}/airdrops/${airdropId}/funding-info`, {
        wallet,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw prepareFailed(response, await parseJsonSafe(response));
      }

      return response.json();
    };

    let data = await fetchFundingInfo();

    if (data.requiresPreparation && data.preparationTransaction) {
      console.log('[FlowGuard] Wallet needs consolidation for token creation, signing prep tx...');
      const prepOptions = {
        ...deserializeWcSignOptions(data.preparationTransaction),
        // Wallet-side broadcast can fail/hang on some BCH WC wallets.
        broadcast: false,
      };
      const prepResult = await wallet.signCashScriptTransaction!(prepOptions);
      preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed', wallet);
      console.log('[FlowGuard] Consolidation tx broadcast:', preparationTxId);
      publishTransactionNotice(preparationTxId, wallet, TX_NOTICES.walletReady, FIRST_OF_TWO);

      await new Promise(resolve => setTimeout(resolve, 8000));
      data = await fetchFundingInfo();
    }

    const { confirm } = await runLifecycleAction({
      wallet,
      actionLabel: TX_NOTICES.airdropFunded,
      syncedOutcome: 'airdropFunded',
      signContext: 'Airdrop funding signing failed',
      metadata: {
        txType: 'create',
        fromAddress: wallet.address || undefined,
      },
      build: async () => {
        const { wcTransaction } = data;
        if (!wcTransaction) {
          throw nothingToSign('Airdrop funding requires a CashScript-compatible wallet transaction object from backend.');
        }
        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: data,
        };
      },
      confirm: ({ txHash }) => authFetch(`${apiUrl}/airdrops/${airdropId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      }),
    });

    return {
      txHash: confirm.txHash,
      confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
      detail: confirm.message || null,
    };
  } catch (error) {
    throw afterPreparationFailure(error, preparationTxId, 'Failed to fund airdrop');
  }
}

/**
 * Claim from an airdrop with merkle proof
 * @param wallet The wallet hook return value
 * @param airdropId The airdrop campaign ID to claim from
 * @returns Transaction ID
 */
export async function claimAirdropFunds(
  wallet: WalletInterface,
  airdropId: string,
  claimerAddressOverride?: string
): Promise<string> {
  try {
    const apiUrl = '/api';
    const { confirm } = await runLifecycleAction<{
      claimAmount: number;
      claimerAddress: string;
      wcTransaction: SerializedWcTransaction;
    }>({
      wallet,
      actionLabel: TX_NOTICES.airdropClaimed,
      syncedOutcome: 'claim',
      signContext: 'Airdrop claim signing failed',
      build: async (signerAddress) => {
        const claimerAddress = claimerAddressOverride || signerAddress;
        const response = await authFetch(`${apiUrl}/airdrops/${airdropId}/claim`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-address': signerAddress,
          },
          body: JSON.stringify({
            claimerAddress,
            signerAddress,
          }),
        });

        const payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, payload, AIRDROP_CLAIM_PATTERNS);
        }

        const { claimAmount, wcTransaction } = payload;
        if (!Number.isFinite(claimAmount) || claimAmount <= 0) {
          throw nothingToSign(`The claim route returned claim amount ${String(claimAmount)}.`);
        }
        if (!wcTransaction) {
          throw nothingToSign('No WalletConnect-compatible claim transaction returned from backend');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: {
            claimAmount,
            claimerAddress,
            wcTransaction: wcTransaction as SerializedWcTransaction,
          },
        };
      },
      confirm: ({ txHash, buildPayload }) => authFetch(`${apiUrl}/airdrops/${airdropId}/confirm-claim`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          claimerAddress: buildPayload.claimerAddress,
          claimedAmount: buildPayload.claimAmount,
          txHash,
        }),
      }),
    });

    return confirm.txHash;
  } catch (error) {
    throw actionFailure(error, 'Failed to claim airdrop');
  }
}

/**
 * Fund a budget plan contract
 * @param wallet The wallet hook return value
 * @param budgetId The budget plan ID to fund
 * @returns Transaction ID
 */
export async function fundBudgetPlan(
  wallet: WalletInterface,
  budgetId: string
): Promise<string> {
  let preparationTxId: string | null = null;
  try {
    const apiUrl = '/api';
    const fetchBudgetFundingInfo = async () => {
      const response = await authFetch(`${apiUrl}/budget-plans/${budgetId}/funding-info`, {
        wallet,
        method: 'GET',
        headers: { 'Content-Type': 'application/json', 'x-user-address': wallet.address || '' },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) throw prepareFailed(response, payload);
      return payload;
    };
    // The plan's state token comes from a coin at output index 0. When the wallet has none,
    // the server returns a self-send that makes one, and funding waits until it's seen.
    let info = await fetchBudgetFundingInfo();
    if (info?.requiresPreparation && info?.preparationTransaction) {
      preparationTxId = await signAndBroadcastWcTransaction(
        wallet,
        info.preparationTransaction as SerializedWcTransaction,
        'Budget funding preparation',
        { txType: 'create', fromAddress: wallet.address || undefined },
        { label: TX_NOTICES.walletReady, step: FIRST_OF_TWO },
      );
      for (let attempt = 0; attempt < 15 && info?.requiresPreparation; attempt += 1) {
        await sleep(2500);
        info = await fetchBudgetFundingInfo();
      }
      if (info?.requiresPreparation) {
        throw flowFailure('STEP_PENDING', { txid: preparationTxId, details: 'The funding-info route still reports requiresPreparation.' });
      }
    }
    const { confirm } = await runLifecycleAction({
      wallet,
      actionLabel: TX_NOTICES.budgetFunded,
      syncedOutcome: 'budgetFunded',
      signContext: 'Budget funding signing failed',
      build: async (signerAddress) => {
        const response = await authFetch(`${apiUrl}/budget-plans/${budgetId}/funding-info`, {
          wallet,
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-user-address': signerAddress,
          },
        });
        const payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, payload);
        }
        if (!payload?.wcTransaction) {
          throw nothingToSign('Budget funding requires a CashScript-compatible wallet transaction object from backend.');
        }
        return {
          wcTransaction: payload.wcTransaction as SerializedWcTransaction,
          payload,
        };
      },
      confirm: ({ txHash }) => authFetch(`${apiUrl}/budget-plans/${budgetId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          txHash,
        }),
      }),
    });

    return confirm.txHash;
  } catch (error) {
    throw afterPreparationFailure(error, preparationTxId, 'Failed to fund budget plan');
  }
}

/**
 * Release milestone from budget plan
 * @param wallet The wallet hook return value
 * @param budgetId The budget plan ID to release from
 * @returns Transaction ID
 */
export async function releaseMilestone(
  wallet: WalletInterface,
  budgetId: string
): Promise<string> {
  try {
    const apiUrl = '/api';
    const { confirm } = await runLifecycleAction<{
      releasableAmount: number;
      wcTransaction: SerializedWcTransaction;
    }>({
      wallet,
      actionLabel: TX_NOTICES.budgetReleased,
      syncedOutcome: 'milestoneReleased',
      signContext: 'Budget release signing failed',
      build: async (signerAddress) => {
        const response = await authFetch(`${apiUrl}/budget-plans/${budgetId}/release`, {
          wallet,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipientAddress: signerAddress,
            signerAddress,
          }),
        });

        const payload = await parseJsonSafe(response);
        if (!response.ok) {
          throw prepareFailed(response, payload);
        }

        const { releasableAmount, wcTransaction } = payload;
        if (!Number.isFinite(releasableAmount) || releasableAmount <= 0) {
          throw flowFailure('MILESTONE_NOT_READY');
        }
        if (!wcTransaction) {
          throw nothingToSign('The release route returned no transaction to sign.');
        }

        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: {
            releasableAmount,
            wcTransaction: wcTransaction as SerializedWcTransaction,
          },
        };
      },
      confirm: ({ txHash, buildPayload }) => authFetch(`${apiUrl}/budget-plans/${budgetId}/confirm-release`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          releasedAmount: buildPayload.releasableAmount,
          txHash,
        }),
      }),
    });

    return confirm.txHash;
  } catch (error) {
    throw actionFailure(error, 'Failed to release milestone');
  }
}

/**
 * Cancel a budget plan on-chain.
 */
export async function cancelBudgetPlanOnChain(
  wallet: WalletInterface,
  budgetId: string,
  options?: { allowUnsafeRecovery?: boolean }
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.budgetCancelled,
    signContext: 'Budget cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/budget-plans/${budgetId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({
          allowUnsafeRecovery: options?.allowUnsafeRecovery === true,
        }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/budget-plans/${budgetId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

// ──────────────────────────────────────────────────────────────────────────────
// Reward lifecycle helpers
// Backend surface: /api/rewards/:id/{funding-info,confirm-funding,distribute,
// confirm-distribute,pause,confirm-pause,cancel,confirm-cancel}
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fund a reward campaign on-chain. Mirrors fundAirdropContract: GET funding-info
 * → wallet signs (broadcast=false) → backend broadcasts and confirms.
 */
export async function fundRewardContract(
  wallet: WalletInterface,
  rewardId: string,
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending'; detail?: string | null }> {
  if (!wallet.address) {
    throw flowFailure('NOT_CONNECTED');
  }

  const apiUrl = '/api';

  const fetchFundingInfo = async () => {
    const fundingInfoResponse = await authFetch(`${apiUrl}/rewards/${rewardId}/funding-info`, {
      wallet,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const payload = await parseJsonSafe(fundingInfoResponse);
    if (!fundingInfoResponse.ok) {
      throw prepareFailed(fundingInfoResponse, payload);
    }
    return payload;
  };

  let fundingInfo = await fetchFundingInfo();

  if (fundingInfo?.requiresPreparation && fundingInfo.preparationTransaction) {
    if (!wallet.signCashScriptTransaction) {
      throw flowFailure('WALLET_UNSUPPORTED');
    }
    const prepOptions = {
      ...deserializeWcSignOptions(fundingInfo.preparationTransaction as SerializedWcTransaction),
      // Wallet-side broadcast can fail/hang on some BCH WC wallets.
      broadcast: false,
    };
    const prepResult = await wallet.signCashScriptTransaction(prepOptions);
    const preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed', wallet);
    publishTransactionNotice(preparationTxId, wallet, TX_NOTICES.walletReady, FIRST_OF_TWO);

    await new Promise(resolve => setTimeout(resolve, 8000));
    fundingInfo = await fetchFundingInfo();
    if (fundingInfo?.requiresPreparation) {
      throw flowFailure('STEP_PENDING', { txid: preparationTxId, details: 'The funding-info route still reports requiresPreparation.' });
    }
  }
  if (!fundingInfo?.wcTransaction) {
    throw nothingToSign('Backend did not return reward funding transaction');
  }

  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.rewardFunded,
    signContext: 'Reward funding signing failed',
    metadata: { txType: 'create', fromAddress: wallet.address || undefined },
    build: async () => ({
      wcTransaction: fundingInfo.wcTransaction as SerializedWcTransaction,
      payload: fundingInfo,
    }),
    confirm: ({ txHash }) => authFetch(`${apiUrl}/rewards/${rewardId}/confirm-funding`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash }),
    }),
  });

  return {
    txHash: confirm.txHash,
    confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
    detail: confirm.message || null,
  };
}

/**
 * Distribute a single reward to a recipient. Caller must be the campaign creator.
 */
export async function distributeRewardOnChain(
  wallet: WalletInterface,
  rewardId: string,
  recipientAddress: string,
  amount: number,
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending' }> {
  const apiUrl = '/api';

  const { confirm } = await runLifecycleAction<{
    rewardAmount: number;
    wcTransaction: SerializedWcTransaction;
  }>({
    wallet,
    actionLabel: TX_NOTICES.rewardSent,
    syncedOutcome: 'payment',
    signContext: 'Reward send signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/rewards/${rewardId}/distribute`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({
          recipientAddress,
          amount,
          signerAddress,
        }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return distribute transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: {
          rewardAmount: Number(payload.rewardAmount ?? amount),
          wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        },
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/rewards/${rewardId}/confirm-distribute`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ recipientAddress, amount, txHash }),
    }),
  });

  return { txHash: confirm.txHash, confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending' };
}

/**
 * Cancel a reward campaign. Refunds remainingPool to the authority address.
 */
export async function cancelRewardOnChain(
  wallet: WalletInterface,
  rewardId: string,
): Promise<{
  txHash: string;
  confirmation: 'confirmed' | 'pending';
  warning?: string;
  cancelReturnAddress?: string;
  signerMatchesReturn?: boolean;
}> {
  const apiUrl = '/api';
  let warning: string | undefined;
  let cancelReturnAddress: string | undefined;
  let signerMatchesReturn: boolean | undefined;

  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.rewardCancelled,
    syncedOutcome: 'rewardCancelled',
    signContext: 'Reward cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/rewards/${rewardId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      warning = typeof payload.warning === 'string' ? payload.warning : undefined;
      cancelReturnAddress = typeof payload.cancelReturnAddress === 'string' ? payload.cancelReturnAddress : undefined;
      signerMatchesReturn = payload.signerMatchesReturn === true;
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/rewards/${rewardId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return {
    txHash: confirm.txHash,
    confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
    warning,
    cancelReturnAddress,
    signerMatchesReturn,
  };
}

/* ------------------------------------------------------------------ */
/*  Grants                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fund a deployed GrantCovenant. Wraps the canonical wallet-signs /
 * backend-broadcasts round-trip: GET funding-info → wallet sign with
 * `broadcast: false` → POST confirm-funding with the resulting txid.
 */
export async function fundGrantContract(
  wallet: WalletInterface,
  grantId: string,
): Promise<{ txHash: string; confirmation: 'confirmed' | 'pending'; detail?: string | null }> {
  let preparationTxId: string | null = null;
  try {
    if (!wallet.address) {
      throw flowFailure('NOT_CONNECTED');
    }

    const apiUrl = '/api';

    const fetchFundingInfo = async () => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/funding-info`, {
        wallet,
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      return payload;
    };

    let data = await fetchFundingInfo();

    if (data.requiresPreparation && data.preparationTransaction) {
      console.log('[FlowGuard] Wallet needs consolidation for grant token creation, signing prep tx...');
      const prepOptions = {
        ...deserializeWcSignOptions(data.preparationTransaction),
        broadcast: false,
      };
      const prepResult = await wallet.signCashScriptTransaction!(prepOptions);
      preparationTxId = await resolveTxHashFromSignResult(prepResult, prepOptions, 'Preparation signing failed', wallet);
      publishTransactionNotice(preparationTxId, wallet, TX_NOTICES.walletReady, FIRST_OF_TWO);

      await new Promise((resolve) => setTimeout(resolve, 8000));
      data = await fetchFundingInfo();
    }

    const { confirm } = await runLifecycleAction({
      wallet,
      actionLabel: TX_NOTICES.grantFunded,
      signContext: 'Grant funding signing failed',
      metadata: {
        txType: 'create',
        fromAddress: wallet.address || undefined,
      },
      build: async () => {
        const { wcTransaction } = data;
        if (!wcTransaction) {
          throw nothingToSign('Grant funding requires a CashScript-compatible wallet transaction object from backend.');
        }
        return {
          wcTransaction: wcTransaction as SerializedWcTransaction,
          payload: data,
        };
      },
      confirm: ({ txHash }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-funding`, {
        wallet,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txHash }),
      }),
    });

    return {
      txHash: confirm.txHash,
      confirmation: confirm.state === 'confirmed' ? 'confirmed' : 'pending',
      detail: confirm.message || null,
    };
  } catch (error) {
    throw afterPreparationFailure(error, preparationTxId, 'Failed to fund grant');
  }
}

/**
 * Release the next milestone tranche from a GrantCovenant. The signer must be
 * the grant creator; the backend co-signs with the claimAuthority key. The
 * `milestoneNumber` returned from the build step is forwarded into
 * confirm-release so the DB row matches the on-chain commitment update.
 */
export async function releaseGrantMilestone(
  wallet: WalletInterface,
  grantId: string,
): Promise<{ txHash: string; milestoneNumber: number; releaseAmount: number }> {
  const apiUrl = '/api';
  const { confirm, build } = await runLifecycleAction<{
    releaseAmount: number;
    milestoneNumber: number;
    wcTransaction: SerializedWcTransaction;
  }>({
    wallet,
    actionLabel: TX_NOTICES.grantMilestoneReleased,
    syncedOutcome: 'milestoneReleased',
    signContext: 'Grant release signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/release`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({}),
      });

      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }

      const releaseAmount = Number(payload?.releaseAmount);
      const milestoneNumber = Number(payload?.milestoneNumber);
      const { wcTransaction } = payload;
      if (!Number.isFinite(releaseAmount) || releaseAmount <= 0) {
        throw flowFailure('MILESTONE_NOT_READY');
      }
      if (!Number.isFinite(milestoneNumber) || milestoneNumber <= 0) {
        throw nothingToSign('Backend did not return a milestone number');
      }
      if (!wcTransaction) {
        throw nothingToSign('Backend did not return release transaction');
      }

      return {
        wcTransaction: wcTransaction as SerializedWcTransaction,
        payload: {
          releaseAmount,
          milestoneNumber,
          wcTransaction: wcTransaction as SerializedWcTransaction,
        },
      };
    },
    confirm: ({ txHash, buildPayload }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-release`, {
      wallet,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: buildPayload.releaseAmount,
        milestoneNumber: buildPayload.milestoneNumber,
        txHash,
      }),
    }),
  });

  return {
    txHash: confirm.txHash,
    milestoneNumber: build.payload.milestoneNumber,
    releaseAmount: build.payload.releaseAmount,
  };
}

export type PausableKind = 'airdrops' | 'bounties' | 'rewards' | 'budget-plans';

const PAUSE_NOTICES: Record<PausableKind, Record<'pause' | 'resume', string>> = {
  airdrops: { pause: TX_NOTICES.airdropPaused, resume: TX_NOTICES.airdropResumed },
  bounties: { pause: TX_NOTICES.bountyPaused, resume: TX_NOTICES.bountyResumed },
  rewards: { pause: TX_NOTICES.rewardPaused, resume: TX_NOTICES.rewardResumed },
  'budget-plans': { pause: TX_NOTICES.budgetPaused, resume: TX_NOTICES.budgetResumed },
};

/**
 * Pause an ACTIVE airdrop, bounty, reward program or budget plan, or resume a PAUSED one.
 * Creator only. The server builds it at POST /api/{kind}/:id/{action} and records it at
 * confirm-{action}.
 */
export async function setPausedOnChain(
  wallet: WalletInterface,
  kind: PausableKind,
  id: string,
  action: 'pause' | 'resume',
): Promise<string> {
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: PAUSE_NOTICES[kind][action],
    signContext: `${kind} ${action} signing failed`,
    build: async (signerAddress) => {
      const response = await authFetch(`/api/${kind}/${id}/${action}`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign(`Backend did not return ${action} transaction`);
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`/api/${kind}/${id}/confirm-${action}`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Pause an ACTIVE grant. Requires the creator wallet AND the `cancelable`
 * flag bit0 set in the original commitment.
 */
export async function pauseGrantOnChain(
  wallet: WalletInterface,
  grantId: string,
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.grantPaused,
    signContext: 'Grant pause signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/pause`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return pause transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-pause`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Resume a PAUSED grant. Creator only. The server builds the transaction at
 * POST /api/grants/:id/resume and records it at POST /api/grants/:id/confirm-resume.
 */
export async function resumeGrantOnChain(
  wallet: WalletInterface,
  grantId: string,
): Promise<string> {
  const apiUrl = '/api';
  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.grantResumed,
    signContext: 'Grant resume signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/resume`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return resume transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-resume`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return confirm.txHash;
}

/**
 * Cancel an ACTIVE or PAUSED grant. Refund is contract-enforced to the
 * authorityHash-derived P2PKH - the API surfaces a warning when the caller
 * does not match that refund target.
 */
export async function cancelGrantOnChain(
  wallet: WalletInterface,
  grantId: string,
): Promise<{
  txHash: string;
  warning?: string;
  cancelReturnAddress?: string;
  authorityReturnAddress?: string;
  signerMatchesReturn?: boolean;
}> {
  const apiUrl = '/api';
  let warning: string | undefined;
  let cancelReturnAddress: string | undefined;
  let authorityReturnAddress: string | undefined;
  let signerMatchesReturn: boolean | undefined;

  const { confirm } = await runLifecycleAction({
    wallet,
    actionLabel: TX_NOTICES.grantCancelled,
    signContext: 'Grant cancel signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/cancel`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({}),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return cancel transaction');
      }
      warning = typeof payload.warning === 'string' ? payload.warning : undefined;
      cancelReturnAddress = typeof payload.cancelReturnAddress === 'string' ? payload.cancelReturnAddress : undefined;
      authorityReturnAddress = typeof payload.authorityReturnAddress === 'string' ? payload.authorityReturnAddress : undefined;
      signerMatchesReturn = typeof payload.signerMatchesReturn === 'boolean' ? payload.signerMatchesReturn : undefined;
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload,
      };
    },
    confirm: ({ txHash, signerAddress }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-cancel`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash }),
    }),
  });

  return {
    txHash: confirm.txHash,
    warning,
    cancelReturnAddress,
    authorityReturnAddress,
    signerMatchesReturn,
  };
}

/**
 * Transfer a grant to a new recipient. Only the CURRENT recipient may sign,
 * and only when the `transferable` flag bit1 was set at create time.
 */
export async function transferGrantOnChain(
  wallet: WalletInterface,
  grantId: string,
  newRecipientAddress: string,
): Promise<{ txHash: string; newRecipientAddress: string }> {
  const apiUrl = '/api';
  const { confirm, build } = await runLifecycleAction<{ newRecipientAddress: string }>({
    wallet,
    actionLabel: TX_NOTICES.grantRecipientChanged,
    signContext: 'Grant recipient change signing failed',
    build: async (signerAddress) => {
      const response = await authFetch(`${apiUrl}/grants/${grantId}/transfer`, {
        wallet,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-address': signerAddress,
        },
        body: JSON.stringify({ newRecipientAddress }),
      });
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        throw prepareFailed(response, payload);
      }
      if (!payload?.wcTransaction) {
        throw nothingToSign('Backend did not return transfer transaction');
      }
      return {
        wcTransaction: payload.wcTransaction as SerializedWcTransaction,
        payload: { newRecipientAddress },
      };
    },
    confirm: ({ txHash, signerAddress, buildPayload }) => authFetch(`${apiUrl}/grants/${grantId}/confirm-transfer`, {
      wallet,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-address': signerAddress,
      },
      body: JSON.stringify({ txHash, newRecipientAddress: buildPayload.newRecipientAddress }),
    }),
  });

  return { txHash: confirm.txHash, newRecipientAddress: build.payload.newRecipientAddress };
}
