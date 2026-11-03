import { Button } from '../ui/Button';
import { ButtonLink } from '../ui/ButtonLink';
import { Dialog } from '../ui/Dialog';
import { ACTIONS } from '../../copy/common';
import { SIGNERS_DIALOG } from '../../copy/vaults';

type AddSignerModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Signers are fixed when a vault is created (the server answers SIGNERS_FIXED to any
 * change), so this explains how to get a different set of signers instead of offering a form.
 */
export function AddSignerModal({ open, onClose }: AddSignerModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={SIGNERS_DIALOG.title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {ACTIONS.close}
          </Button>
          <ButtonLink to="/vaults/create" variant="primary">
            {SIGNERS_DIALOG.createVault}
          </ButtonLink>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body text-ink-secondary">
        <p>{SIGNERS_DIALOG.body}</p>
        <p>{SIGNERS_DIALOG.next}</p>
      </div>
    </Dialog>
  );
}
