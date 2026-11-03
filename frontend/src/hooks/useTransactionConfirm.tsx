import { useCallback, useState } from 'react';
import {
  TransactionConfirmHost,
  type TransactionConfirmSource,
  type TransactionDetails,
} from '../components/ui/TransactionConfirmModal';

type ConfirmSnapshot = { open: boolean; transaction: TransactionDetails | null };

type ConfirmStore = TransactionConfirmSource & {
  request: (details: TransactionDetails) => Promise<boolean>;
};

/**
 * The open state lives outside React state so the returned modal component keeps one identity
 * for the hook's lifetime. A new component type per render would remount the dialog and drop focus.
 */
function createConfirmStore(): ConfirmStore {
  let snapshot: ConfirmSnapshot = { open: false, transaction: null };
  let resolve: ((confirmed: boolean) => void) | null = null;
  const listeners = new Set<() => void>();

  const publish = (next: ConfirmSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const settle = (confirmed: boolean) => {
    const pending = resolve;
    resolve = null;
    if (pending) pending(confirmed);
    if (snapshot.open) publish({ ...snapshot, open: false });
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    request: (details) => {
      settle(false);
      return new Promise<boolean>((done) => {
        resolve = done;
        publish({ open: true, transaction: details });
      });
    },
    settle,
  };
}

export function useTransactionConfirm() {
  const [store] = useState(createConfirmStore);

  const confirmTransaction = useCallback(
    (details: TransactionDetails): Promise<boolean> => store.request(details),
    [store],
  );

  const Modal = useCallback(() => <TransactionConfirmHost source={store} />, [store]);

  return {
    confirmTransaction,
    TransactionConfirmModal: Modal,
  };
}
