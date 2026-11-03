import type { Tone } from '../components/ui/types';
import {
  BROADCAST_REASON_PATTERNS,
  RAW_ERROR_PATTERNS,
  SERVER_ERROR_CODES,
  SERVER_MESSAGE_PATTERNS,
  NETWORK_REFUSAL_PATTERN,
  WALLET_DECLINE_CODES,
  WALLET_DECLINE_PATTERN,
  WALLET_TIMEOUT_PATTERN,
  matchPatterns,
} from '../utils/walletErrorPatterns';
import { ACTIONS } from './common';
import { IS_TEST_BUILD } from './network';

export type ErrorCode =
  | 'WALLET_REJECTED'
  | 'SIGN_IN_REJECTED'
  | 'PAIRING_CANCELLED'
  | 'PAIRING_TIMEOUT'
  | 'WALLET_TIMEOUT'
  | 'WALLET_SESSION_ENDED'
  | 'RELAY_UNREACHABLE'
  | 'WALLET_NOT_INSTALLED'
  | 'WRONG_NETWORK'
  | 'NOT_CONNECTED'
  | 'WALLET_INCOMPLETE_SIGNATURE'
  | 'WALLET_UNSUPPORTED'
  | 'SIGN_IN_FAILED'
  | 'SERVER_PREPARE_FAILED'
  | 'BROADCAST_REJECTED'
  | 'BROADCAST_SPENT_INPUTS'
  | 'NOT_FINAL'
  | 'SENT_NOT_SYNCED'
  | 'SEND_UNCONFIRMED'
  | 'STEP_PENDING'
  | 'INSUFFICIENT_FUNDS'
  | 'NOTHING_TO_CLAIM'
  | 'MILESTONE_NOT_READY'
  | 'NOT_ELIGIBLE'
  | 'AIRDROP_ALREADY_CLAIMED'
  | 'AIRDROP_EMPTY'
  | 'AIRDROP_CLOSED'
  | 'PAYOUT_UNAVAILABLE'
  | 'SIGNERS_FIXED'
  | 'RATE_LIMITED'
  | 'MISCONFIGURED'
  | 'LOAD_FAILED'
  | 'NOT_FOUND'
  | 'NO_ACCESS'
  | 'OFFLINE'
  | 'UNKNOWN';

export type FlowError = { code: ErrorCode; message: string; details?: string; txid?: string };

export type SyncedOutcome =
  | 'payment'
  | 'claim'
  | 'deposit'
  | 'streamCancelled'
  | 'streamPaused'
  | 'milestoneReleased'
  | 'paymentCancelled'
  | 'paymentPaused'
  | 'airdropFunded'
  | 'budgetFunded'
  | 'bountyCancelled'
  | 'rewardCancelled';

const SYNCED_OUTCOME: Record<SyncedOutcome, string> = {
  payment: 'Your payment went through',
  claim: 'Your claim went through',
  deposit: 'Your deposit went through',
  streamCancelled: 'Your stream was cancelled',
  streamPaused: 'Your stream was paused',
  milestoneReleased: 'Your milestone was released',
  paymentCancelled: 'Your recurring payment was cancelled',
  paymentPaused: 'Your recurring payment was paused',
  airdropFunded: 'Your airdrop was funded',
  budgetFunded: 'Your budget plan was funded',
  bountyCancelled: 'Your bounty was cancelled',
  rewardCancelled: 'Your reward program was cancelled',
};

/** Values the messages name when they're known. Each message has a written fallback for a missing value. */
export type ErrorParams = {
  outcome?: SyncedOutcome;
  asset?: string;
  amount?: string;
  date?: string;
  things?: string;
};

export type ErrorEntry = {
  tone: Extract<Tone, 'neutral' | 'warning' | 'danger'> | null;
  action?: string;
  message: (params: ErrorParams) => string;
};

const WRONG_NETWORK_MESSAGE = IS_TEST_BUILD
  ? 'Your wallet is set to the main Bitcoin Cash network. This app uses the test network, where coins have no value. Switch your wallet to the test network and connect again.'
  : 'Your wallet is set to the test network. This app uses real BCH on the main Bitcoin Cash network. Switch your wallet to the main network and connect again.';

export const ERROR_CATALOG: Record<ErrorCode, ErrorEntry> = {
  WALLET_REJECTED: {
    tone: 'neutral',
    action: ACTIONS.tryAgain,
    message: () => 'You declined this in your wallet. Nothing was sent.',
  },
  SIGN_IN_REJECTED: {
    tone: 'neutral',
    action: ACTIONS.tryAgain,
    message: () => 'You declined the sign-in. Approve it in your wallet to continue.',
  },
  PAIRING_CANCELLED: {
    tone: null,
    message: () => '',
  },
  PAIRING_TIMEOUT: {
    tone: 'neutral',
    action: 'Show QR code again',
    message: () => "The QR code wasn't scanned in time. Nothing was sent.",
  },
  WALLET_TIMEOUT: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () => "Your wallet didn't respond in time. Nothing was sent. Open your wallet app and try again.",
  },
  WALLET_SESSION_ENDED: {
    tone: 'danger',
    action: ACTIONS.connectWallet,
    message: () => 'Your wallet disconnected. Connect it again to continue.',
  },
  RELAY_UNREACHABLE: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () =>
      "Couldn't reach the service that links your wallet to FlowGuard. Nothing was sent. Check your internet, pause any VPN or ad blocker for this site, and try again.",
  },
  WALLET_NOT_INSTALLED: {
    tone: 'danger',
    action: 'Get Paytaca',
    message: () => "Paytaca isn't installed in this browser. Install it, then try again.",
  },
  WRONG_NETWORK: {
    tone: 'danger',
    action: ACTIONS.connectAgain,
    message: () => WRONG_NETWORK_MESSAGE,
  },
  NOT_CONNECTED: {
    tone: 'neutral',
    action: ACTIONS.connectWallet,
    message: () => 'Connect your wallet to continue.',
  },
  WALLET_INCOMPLETE_SIGNATURE: {
    tone: 'danger',
    message: () => "Your wallet didn't fully approve this, so nothing was sent. Update your wallet app or try another wallet.",
  },
  WALLET_UNSUPPORTED: {
    tone: 'danger',
    action: 'Switch wallet',
    message: () => "This wallet can't do this yet. Connect Paytaca or Cashonize.",
  },
  SIGN_IN_FAILED: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () => "We couldn't sign you in. No money moved. Try again, or connect a different wallet.",
  },
  SERVER_PREPARE_FAILED: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () => "We couldn't prepare this. Nothing was sent. Try again in a moment.",
  },
  BROADCAST_REJECTED: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () => "The Bitcoin Cash network didn't accept this. Nothing was sent.",
  },
  BROADCAST_SPENT_INPUTS: {
    tone: 'danger',
    action: ACTIONS.refresh,
    message: () => 'Something in your wallet changed while this was being prepared. Nothing was sent. Refresh and try again.',
  },
  NOT_FINAL: {
    tone: 'warning',
    message: () => "The network won't accept this for a few more minutes. Nothing was sent. Try again in about 10 minutes.",
  },
  SENT_NOT_SYNCED: {
    tone: 'warning',
    action: ACTIONS.viewTransaction,
    message: ({ outcome }) =>
      `${outcome ? SYNCED_OUTCOME[outcome] : 'Your transaction went through'}. We're still updating your page.`,
  },
  SEND_UNCONFIRMED: {
    tone: 'warning',
    message: () => "Your wallet may have sent this. Check your wallet's activity before you try again.",
  },
  STEP_PENDING: {
    tone: 'warning',
    action: ACTIONS.continue,
    message: () => 'Step 1 of 2 is done. Wait about 30 seconds for your wallet to catch up, then continue.',
  },
  INSUFFICIENT_FUNDS: {
    tone: 'danger',
    message: ({ asset, amount }) =>
      asset && amount
        ? `Not enough ${asset} in your wallet. You need ${amount} plus a small network fee. Nothing was sent.`
        : `Not enough ${asset ?? 'money'} in your wallet to cover this and a small network fee. Nothing was sent.`,
  },
  NOTHING_TO_CLAIM: {
    tone: 'neutral',
    message: ({ amount, date }) => {
      if (amount && date) return `Nothing to claim yet. The next ${amount} is released on ${date}.`;
      if (date) return `Nothing to claim yet. The next release is on ${date}.`;
      return 'Nothing to claim yet.';
    },
  },
  MILESTONE_NOT_READY: {
    tone: 'neutral',
    message: ({ date }) =>
      date
        ? `No milestone is ready to release yet. The next one is ready on ${date}. Nothing was sent.`
        : 'No milestone is ready to release yet. Nothing was sent.',
  },
  NOT_ELIGIBLE: {
    tone: 'neutral',
    action: 'Switch wallet',
    message: () => "This wallet can't claim this. Check that you connected the wallet it was sent to.",
  },
  AIRDROP_ALREADY_CLAIMED: {
    tone: 'neutral',
    message: () => 'This wallet already claimed its share of this airdrop. Nothing was sent.',
  },
  AIRDROP_EMPTY: {
    tone: 'neutral',
    message: () => 'Every share of this airdrop has been claimed. Nothing was sent.',
  },
  AIRDROP_CLOSED: {
    tone: 'neutral',
    message: () => 'This airdrop is closed. Nothing was sent.',
  },
  PAYOUT_UNAVAILABLE: {
    tone: 'neutral',
    message: () => "This vault's server can't send payments right now. Nothing was sent. Try again later.",
  },
  SIGNERS_FIXED: {
    tone: 'neutral',
    message: () => "A vault's signers are set when you create it, so you can't add one now. Nothing changed.",
  },
  RATE_LIMITED: {
    tone: 'warning',
    action: ACTIONS.tryAgain,
    message: () => 'Too many requests at once. Nothing was sent. Wait a minute, then try again.',
  },
  MISCONFIGURED: {
    tone: 'danger',
    message: () => "Something's wrong on our side. Your money is safe. Try again later.",
  },
  LOAD_FAILED: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: ({ things }) =>
      `${things ? `${things} didn't load` : "This page didn't load"}. Check your connection and try again. Nothing in your wallet has changed.`,
  },
  NOT_FOUND: {
    tone: 'neutral',
    message: () => "We couldn't find this. It may have been removed, or the link is wrong.",
  },
  NO_ACCESS: {
    tone: 'neutral',
    action: ACTIONS.connectWallet,
    message: () => "This is private. Connect a wallet that's part of it to see it.",
  },
  OFFLINE: {
    tone: 'warning',
    message: () => "You're offline. Nothing was sent. Reconnect to keep going.",
  },
  UNKNOWN: {
    tone: 'danger',
    action: ACTIONS.tryAgain,
    message: () => 'Something went wrong. Nothing was sent. Try again.',
  },
};

export function errorMessage(code: ErrorCode, params: ErrorParams = {}): string {
  return ERROR_CATALOG[code].message(params);
}

/** A thrown error that already carries its catalog code. Its message is the catalog message. */
export class CodedError extends Error implements FlowError {
  readonly code: ErrorCode;
  readonly details?: string;
  readonly txid?: string;

  constructor(flow: FlowError) {
    super(flow.message);
    this.name = 'CodedError';
    this.code = flow.code;
    this.details = flow.details;
    this.txid = flow.txid;
  }
}

type FailureOptions = { params?: ErrorParams; cause?: unknown; details?: string; txid?: string };

/** Builds the error to throw for a catalog code. Raw text from `cause` or `details` goes to details. */
export function flowFailure(code: ErrorCode, options: FailureOptions = {}): CodedError {
  const flow = toFlowError(code, options);
  return new CodedError(options.details ? { ...flow, details: options.details } : flow);
}

/** The technical text behind an error, for the Details disclosure. A coded error offers only its details. */
export function rawErrorText(error: unknown): string | undefined {
  if (error instanceof CodedError) return error.details || undefined;
  if (error instanceof Error) return error.message || undefined;
  if (typeof error === 'string') return error || undefined;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message || undefined;
  }
  return undefined;
}
export function toFlowError(
  code: ErrorCode,
  options: { params?: ErrorParams; cause?: unknown; txid?: string } = {},
): FlowError {
  return {
    code,
    message: errorMessage(code, options.params),
    details: rawErrorText(options.cause),
    txid: options.txid,
  };
}

/** Keeps a thrown value that already carries a catalog code and message, otherwise classifies it. */
export function asFlowError(error: unknown): FlowError {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    isErrorCode(error.code) &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    const txid = 'txid' in error && typeof error.txid === 'string' ? error.txid : undefined;
    const details = 'details' in error && typeof error.details === 'string' ? error.details : undefined;
    return { code: error.code, message: error.message, details, txid };
  }
  return toFlowError(classifyWalletError(error), { cause: error });
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function hasErrorCode(value: unknown): value is { code: ErrorCode } {
  return Boolean(value && typeof value === 'object' && 'code' in value && isErrorCode(value.code));
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
}

function numericCode(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'number' ? error.code : null;
}

/**
 * Picks the catalog code for any thrown value. Coded errors keep their code. Anything
 * else is matched by its raw text against src/utils/walletErrorPatterns.ts.
 */
export function classifyWalletError(error: unknown): ErrorCode {
  if (isOffline()) return 'OFFLINE';
  if (hasErrorCode(error)) return error.code;
  const name = errorName(error);
  if (name === 'NetworkMismatchError') return 'MISCONFIGURED';
  if (name === 'AbortError') return 'WALLET_TIMEOUT';
  const text = rawErrorText(error);
  if (!text) return 'UNKNOWN';
  return matchPatterns(text, RAW_ERROR_PATTERNS) ?? 'UNKNOWN';
}

/**
 * For an error that came straight back from a wallet request, where "cancelled" can
 * only mean the person declined, unless the wallet says the network refused it after
 * broadcasting. Sign-in requests get the sign-in codes.
 */
export function walletRequestFailure(error: unknown, request: 'transaction' | 'signIn'): CodedError {
  if (error instanceof CodedError) return error;
  const text = rawErrorText(error) ?? '';
  if (request === 'transaction') {
    const reason = matchPatterns(text, BROADCAST_REASON_PATTERNS);
    if (reason) return flowFailure(reason, { cause: error });
    if (NETWORK_REFUSAL_PATTERN.test(text)) return flowFailure('BROADCAST_REJECTED', { cause: error });
  }
  const declined = WALLET_DECLINE_CODES.has(numericCode(error) ?? -1) || WALLET_DECLINE_PATTERN.test(text);
  if (declined) return flowFailure(request === 'signIn' ? 'SIGN_IN_REJECTED' : 'WALLET_REJECTED', { cause: error });
  if (WALLET_TIMEOUT_PATTERN.test(text) || errorName(error) === 'AbortError') {
    return flowFailure('WALLET_TIMEOUT', { cause: error });
  }
  const code = classifyWalletError(error);
  if (request === 'signIn' && code === 'UNKNOWN') return flowFailure('SIGN_IN_FAILED', { cause: error });
  return flowFailure(code, { cause: error });
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** The server's own wording and reason, for the Details disclosure. */
export function apiErrorDetails(body: unknown, status?: number): string | undefined {
  const parts: string[] = [];
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const text = readString(record, 'userMessage') ?? readString(record, 'message') ?? readString(record, 'error');
    if (text) parts.push(text);
    const debug = record.debug;
    if (debug && typeof debug === 'object') {
      const reason = readString(debug as Record<string, unknown>, 'reason');
      if (reason && reason !== text) parts.push(reason);
    }
    const serverCode = readString(record, 'errorCode') ?? readString(record, 'code');
    if (serverCode) parts.push(serverCode);
  }
  if (status) parts.push(String(status));
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Picks the catalog code for a parsed API error body. Reads the server's code first,
 * then its wording (the route's own `messages` before the shared ones), then the
 * status, then a node rejection reason. `fallback` is the code for this call
 * when nothing more specific is known.
 */
export function readApiError(
  body: unknown,
  options: { status?: number; fallback?: ErrorCode; messages?: ReadonlyArray<readonly [RegExp, ErrorCode]> } = {},
): ErrorCode {
  if (isOffline()) return 'OFFLINE';
  const fallback = options.fallback ?? 'UNKNOWN';
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    for (const key of ['code', 'errorCode']) {
      const value = record[key];
      if (isErrorCode(value)) return value;
      if (typeof value === 'string' && SERVER_ERROR_CODES[value]) return SERVER_ERROR_CODES[value];
    }
  }
  const serverText = apiErrorDetails(body);
  const fromMessage = serverText
    ? matchPatterns(serverText, [...(options.messages ?? []), ...SERVER_MESSAGE_PATTERNS])
    : null;
  if (fromMessage) return fromMessage;
  if (options.status === 429) return 'RATE_LIMITED';
  if (options.status === 401) return 'SIGN_IN_FAILED';
  if (fallback === 'BROADCAST_REJECTED') {
    const fromReason = serverText ? matchPatterns(serverText, BROADCAST_REASON_PATTERNS) : null;
    if (fromReason) return fromReason;
  }
  return fallback;
}

/** The error to throw for a failed API response. */
export function apiFailure(
  body: unknown,
  status: number,
  fallback: ErrorCode,
  messages?: ReadonlyArray<readonly [RegExp, ErrorCode]>,
): CodedError {
  return flowFailure(readApiError(body, { status, fallback, messages }), { details: apiErrorDetails(body, status) });
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CATALOG, value);
}
