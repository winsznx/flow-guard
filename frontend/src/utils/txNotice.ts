export type TransactionNoticeNetwork = 'chipnet' | 'mainnet';

export interface TransactionNotice {
  txHash: string;
  network: TransactionNoticeNetwork;
  label?: string;
  /** Set on the first transaction of a multi-step action, so the notice asks for the next approval. */
  step?: { index: number; of: number };
}

export interface TransactionNoticeDetail extends TransactionNotice {
  timestamp: number;
}

export const TX_NOTICE_EVENT = 'flowguard:tx-notice';

export function normalizeWalletNetwork(network?: string | null): TransactionNoticeNetwork {
  if (network === 'mainnet') {
    return 'mainnet';
  }
  return 'chipnet';
}

let heldBySheets = 0;

/**
 * A review sheet that runs a transaction reports its own outcome, so while one is running the
 * toast for the same transaction would say it twice. Returns the release; call it when the run settles.
 */
export function holdTransactionNotices(): () => void {
  heldBySheets += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    heldBySheets -= 1;
  };
}

export function emitTransactionNotice(notice: TransactionNotice): void {
  if (typeof window === 'undefined' || heldBySheets > 0) {
    return;
  }

  const detail: TransactionNoticeDetail = {
    ...notice,
    timestamp: Date.now(),
  };

  window.dispatchEvent(new CustomEvent<TransactionNoticeDetail>(TX_NOTICE_EVENT, { detail }));
}
