import type { WcTransactionObject } from 'cashscript';

const FINAL_SEQUENCE = 0xffffffff;

type SequenceCarrier = {
  sequenceNumber?: number;
};

function setFinalSequence(list: SequenceCarrier[] | undefined): void {
  if (!Array.isArray(list)) return;
  for (const item of list) {
    item.sequenceNumber = FINAL_SEQUENCE;
  }
}

function hasNonFinalSequence(list: SequenceCarrier[] | undefined): boolean {
  if (!Array.isArray(list)) return false;
  return list.some((item) => (item.sequenceNumber ?? FINAL_SEQUENCE) !== FINAL_SEQUENCE);
}

/**
 * Normalize every sequence to final to avoid mempool non-final rejections when locktime is used.
 */
export function finalizeWcTransactionSequences(wcTransaction: WcTransactionObject): WcTransactionObject {
  setFinalSequence(wcTransaction.transaction.inputs as SequenceCarrier[] | undefined);
  setFinalSequence(wcTransaction.sourceOutputs as SequenceCarrier[] | undefined);

  if (
    hasNonFinalSequence(wcTransaction.transaction.inputs as SequenceCarrier[] | undefined)
    || hasNonFinalSequence(wcTransaction.sourceOutputs as SequenceCarrier[] | undefined)
  ) {
    throw new Error('Transaction contains non-final input sequence numbers after finalization');
  }

  return wcTransaction;
}
