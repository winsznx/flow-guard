import { useId, type FormEvent, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { ACTIONS } from '../../copy/common';

type SampleEditDialogProps = {
  open: boolean;
  title: string;
  line: string;
  saveLabel: string;
  onSave: () => void;
  onClose: () => void;
  /** Opens the remove confirmation. Only shown when editing an existing row. */
  remove?: { label: string; onSelect: () => void };
  children: ReactNode;
};

/** The add and edit form for one row of Organization sample data. */
export function SampleEditDialog({
  open,
  title,
  line,
  saveLabel,
  onSave,
  onClose,
  remove,
  children,
}: SampleEditDialogProps) {
  const formId = useId();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          {remove ? (
            <Button variant="danger-quiet" onClick={remove.onSelect} className="sm:mr-auto">
              {remove.label}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {ACTIONS.close}
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={submit} className="flex flex-col gap-4 pt-2">
        <p className="text-small text-ink-secondary">{line}</p>
        {children}
      </form>
    </Dialog>
  );
}
