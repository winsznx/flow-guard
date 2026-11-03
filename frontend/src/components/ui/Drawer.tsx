import React from 'react';
import { IconButton } from './IconButton';
import { X } from './Icon';
import { cx } from './cx';
import { useModalDialog } from './useModalDialog';
import { ACTIONS } from '../../copy/common';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right' | 'full';
  label: string;
  id?: string;
  children: React.ReactNode;
};

const SURFACE =
  'on-surface m-0 h-dvh max-h-none w-full bg-canvas text-ink shadow-dialog flex-col open:flex transition-opacity duration-(--duration-slow) ease-standard starting:open:opacity-0';

const SIDE: Record<DrawerProps['side'], string> = {
  left: 'mr-auto max-w-drawer',
  right: 'ml-auto max-w-dialog-md',
  full: 'max-w-none',
};

function isBackdropClick(dialog: HTMLDialogElement, event: React.MouseEvent<HTMLDialogElement>): boolean {
  if (event.target !== dialog) return false;
  const box = dialog.getBoundingClientRect();
  return (
    event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom
  );
}

export function Drawer({ open, onClose, side, label, id, children }: DrawerProps) {
  const ref = useModalDialog(open, onClose);

  const handleClick = (event: React.MouseEvent<HTMLDialogElement>) => {
    if (ref.current && isBackdropClick(ref.current, event)) onClose();
  };

  return (
    <dialog ref={ref} id={id} aria-label={label} onClick={handleClick} className={cx(SURFACE, SIDE[side])}>
      <div className="flex shrink-0 justify-end px-4 pt-4">
        <IconButton icon={X} label={ACTIONS.close} onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-(--safe-bottom)">{open ? children : null}</div>
    </dialog>
  );
}
