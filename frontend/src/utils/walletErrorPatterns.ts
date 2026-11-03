/**
 * Raw text that wallets, wallet SDKs, the Bitcoin Cash node and the browser put in
 * their errors. `classifyWalletError()` in copy/errors.ts matches against these to
 * pick a catalog code. They describe other people's wording, so they never reach a
 * screen and the copy lint skips this file.
 *
 * FlowGuard's own code throws coded errors and is never matched here.
 */

import type { ErrorCode } from '../copy/errors';

/**
 * A decline, as wallets word it. Only safe on an error that came straight back from
 * a wallet request, where nothing but the wallet could have said "cancelled".
 */
export const WALLET_DECLINE_PATTERN = /\b(?:rejected|cancell?ed|declined|denied|disapproved|refused)\b/i;

/** WalletConnect's reserved "user rejected" codes (5000 to 5002 in the SDK's error table). */
export const WALLET_DECLINE_CODES: ReadonlySet<number> = new Set([5000, 5001, 5002]);

export const WALLET_TIMEOUT_PATTERN = /\btimed?\s?out\b|\btimeout\b|\babort(?:ed|error)?\b/i;

/**
 * Ordered: the first match wins. Used on errors of unknown origin, so each pattern is
 * narrow enough that FlowGuard server text ("stream already cancelled") can't hit it.
 */
export const RAW_ERROR_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/\b(?:user|request) (?:rejected|denied|declined|cancell?ed)\b|\b(?:rejected|denied|declined|cancell?ed) by (?:the )?user\b|\buser disapproved\b/i, 'WALLET_REJECTED'],
  [/\bbad-txns-nonfinal\b|\bnon-?final\b/i, 'NOT_FINAL'],
  [/\bmissing-?inputs\b|\bmissingorspent\b|\bmempool-conflict\b|\binputs? (?:already )?spent\b/i, 'BROADCAST_SPENT_INPUTS'],
  [/\binsufficient (?:funds|balance)\b|\bnot enough (?:funds|balance|bch)\b/i, 'INSUFFICIENT_FUNDS'],
  [/\bwebsocket\b|\bsocket stalled\b|\brelay(?:er)? (?:closed|unreachable|disconnected|error)\b/i, 'RELAY_UNREACHABLE'],
  [/\bno matching key\b|\bsession (?:topic )?(?:not found|expired|doesn't exist|does not exist)\b|\brecord was recently deleted\b/i, 'WALLET_SESSION_ENDED'],
  [/\b(?:request|signing|connection) timed? ?out\b|\btimed out after\b/i, 'WALLET_TIMEOUT'],
  [/^failed to fetch$|\bnetworkerror\b|^load failed$/i, 'SERVER_PREPARE_FAILED'],
];

/** Node rejection reasons, checked on the reason a failed broadcast sends back. */
export const BROADCAST_REASON_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/\bnon-?final\b/i, 'NOT_FINAL'],
  [/\bmissing-?inputs\b|\bmissingorspent\b|\bmempool-conflict\b|\binputs? (?:already )?spent\b/i, 'BROADCAST_SPENT_INPUTS'],
  [/\binsufficient (?:fee|priority)\b|\bmin relay fee\b/i, 'BROADCAST_REJECTED'],
  [/\binsufficient (?:funds|balance)\b/i, 'INSUFFICIENT_FUNDS'],
];

/**
 * A wallet's own error that is really the node refusing the broadcast. Checked before
 * the decline pattern, so "transaction rejected by the network" isn't read as a decline.
 */
export const NETWORK_REFUSAL_PATTERN =
  /\b(?:rejected|refused) by (?:the )?(?:network|node|mempool)\b|\b(?:network|node|mempool) (?:rejected|refused)\b|\bbad-txns|\bnon-?mandatory-script\b/i;

/**
 * A wallet's step 2 failure that means it hasn't seen the coins step 1 created yet.
 * Older wallet builds word it as a bare "internal error".
 */
export const WALLET_STALE_COINS_PATTERN = /\binternal error\b/i;

/** FlowGuard server `errorCode` values that have their own catalog entry. */
export const SERVER_ERROR_CODES: Readonly<Record<string, ErrorCode>> = {
  EXECUTION_NOT_SUPPORTED: 'PAYOUT_UNAVAILABLE',
  SIGNERS_FIXED: 'SIGNERS_FIXED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMITED',
  MISSING_TX_ID: 'SERVER_PREPARE_FAILED',
  NO_CONTRACT: 'SERVER_PREPARE_FAILED',
};

/** Server messages that mean one catalog state and come with no `errorCode` of their own. */
export const SERVER_MESSAGE_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/\bonly the (?:stream|payment) recipient can claim\b/i, 'NOT_ELIGIBLE'],
];

/**
 * The airdrop claim route's refusals. Scoped to that route because other routes reuse
 * the same words ("Campaign is not active" also comes back from reward distribution).
 * The contract marks a campaign whose pool is used up with status 3.
 */
export const AIRDROP_CLAIM_PATTERNS: ReadonlyArray<readonly [RegExp, ErrorCode]> = [
  [/\baddress not eligible\b/i, 'NOT_ELIGIBLE'],
  [/\bclaim limit reached\b/i, 'AIRDROP_ALREADY_CLAIMED'],
  [/\bexceeds remaining campaign pool\b|\bnot active on-chain \(status=3\)/i, 'AIRDROP_EMPTY'],
  [/\bcampaign is not active\b/i, 'AIRDROP_CLOSED'],
];

export function matchPatterns(
  text: string,
  patterns: ReadonlyArray<readonly [RegExp, ErrorCode]>,
): ErrorCode | null {
  for (const [pattern, code] of patterns) {
    if (pattern.test(text)) return code;
  }
  return null;
}

/** The node's answer when a transaction ID doesn't exist, as opposed to a node that can't be reached. */
export const TRANSACTION_NOT_FOUND_PATTERN = /\bno such (?:mempool or blockchain )?transaction\b|\bnot found\b|\binvalid tx hash\b/i;
