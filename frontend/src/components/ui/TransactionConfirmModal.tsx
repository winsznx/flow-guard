import { useSyncExternalStore } from 'react';
import { Address } from './Address';
import { Amount } from './Amount';
import { Button } from './Button';
import { DetailList } from './DetailList';
import { Dialog } from './Dialog';
import { InsetBlock } from './InsetBlock';
import { ACTIONS, LABELS, MOMENTS, REVIEW } from '../../copy/common';
import { NETWORK_LABEL } from '../../copy/network';
import { normalizeWalletNetwork } from '../../utils/txNotice';

export interface TransactionDetails {
  amount: number;
  recipient: string;
  network: 'mainnet' | 'testnet' | 'chipnet';
  description?: string;
}

interface TransactionConfirmModalProps {
  isOpen: boolean;
  transaction: TransactionDetails | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const BCH = { kind: 'bch' } as const;

export function TransactionConfirmModal({ isOpen, transaction, onConfirm, onCancel }: TransactionConfirmModalProps) {
  const open = isOpen && transaction !== null;

  const items = transaction
    ? [
        {
          label: REVIEW.leavesWallet,
          value: (
            <span className="inline-flex flex-col items-end">
              <Amount value={transaction.amount} asset={BCH} />
              <span className="text-small text-ink-muted">{REVIEW.plusNetworkFee}</span>
            </span>
          ),
        },
        { label: REVIEW.goesTo, value: <Address value={transaction.recipient} variant="full" /> },
        { label: LABELS.network, value: NETWORK_LABEL[normalizeWalletNetwork(transaction.network)] },
        ...(transaction.description ? [{ label: LABELS.note, value: transaction.description }] : []),
      ]
    : [];

  const footer = (
    <>
      <Button variant="secondary" onClick={onCancel}>
        {ACTIONS.back}
      </Button>
      <Button variant="primary" onClick={onConfirm}>
        {ACTIONS.approveInWallet}
      </Button>
    </>
  );

  return (
    <Dialog open={open} onClose={onCancel} title={REVIEW.title} size="lg" footer={footer}>
      <div className="flex flex-col gap-4">
        <InsetBlock>
          <DetailList items={items} />
        </InsetBlock>
        <p className="text-small text-ink-secondary">{MOMENTS.walletWillOpen}</p>
      </div>
    </Dialog>
  );
}

export type TransactionConfirmSource = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => { open: boolean; transaction: TransactionDetails | null };
  settle: (confirmed: boolean) => void;
};

export function TransactionConfirmHost({ source }: { source: TransactionConfirmSource }) {
  const { open, transaction } = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return (
    <TransactionConfirmModal
      isOpen={open}
      transaction={transaction}
      onConfirm={() => source.settle(true)}
      onCancel={() => source.settle(false)}
    />
  );
}
