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
