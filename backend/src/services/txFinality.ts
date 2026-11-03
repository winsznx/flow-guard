import type { WcTransactionObject } from 'cashscript';

/**
 * Preserve the input sequences the tx builders set.
 *
 * Covenant spends that use `tx.time` compile to OP_CHECKLOCKTIMEVERIFY, which
 * REQUIRES the spending input to be non-final (sequence < 0xffffffff). The
 * builders set the covenant input to 0xfffffffe for exactly this reason.
 *
 * The previous implementation forced every sequence to final (0xffffffff) "to
 * avoid mempool non-final rejections" — but that is backwards: a final sequence
 * disables nLockTime enforcement, so CLTV fails and every time-gated spend
 * (claim / complete / cancel / execute / period-spend) was rejected at
 * broadcast. The correct way to keep a locktimed tx immediately mineable is to
 * set its locktime at or below the chain's median-time-past, which the builders
 * handle — not to finalize the sequence.
 *
 * Retained as a pass-through so existing call sites need no change.
 */
export function finalizeWcTransactionSequences(wcTransaction: WcTransactionObject): WcTransactionObject {
  return wcTransaction;
}

/**
 * Median-time-past trails wall time by up to about an hour, and a transaction whose
 * nLockTime is ahead of it is rejected as non-final. Every builder that writes
 * `tx.locktime` (and any state derived from it) uses this value instead of the raw clock.
 */
export const MEDIAN_TIME_PAST_BUFFER_SECONDS = 7200;

export function mineableLocktime(nowSeconds: number): number {
  return Math.max(0, nowSeconds - MEDIAN_TIME_PAST_BUFFER_SECONDS);
}

/**
 * Token covenants measure vesting from `tx.locktime`, so a cancel can only be built once
 * the mineable lock time has passed the stream's start.
 */
export const TOKEN_CANCEL_TOO_EARLY = 'A token stream can be cancelled about 2 hours after it starts. Try again later.';
