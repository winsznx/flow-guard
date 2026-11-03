import React, { useState } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Notice } from './Notice';
import { asFlowError, type FlowError } from '../../copy/errors';

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  keepLabel: string;
  tone: 'danger' | 'primary';
  busyLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  renderError?: (e: FlowError) => React.ReactNode;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  keepLabel,
  tone,
  busyLabel,
  onConfirm,
  onClose,
  renderError,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FlowError | null>(null);

  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      onClose();
    } catch (caught) {
      setBusy(false);
      setError(asFlowError(caught));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {keepLabel}
          </Button>
          <Button variant={tone} onClick={() => void confirm()} busy={busy} busyLabel={busyLabel}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-body text-ink-secondary">{body}</div>
        {error ? (renderError ? renderError(error) : <Notice tone="danger" title={error.message} live="assertive" />) : null}
      </div>
    </Dialog>
  );
}
