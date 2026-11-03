import React, { useId } from 'react';
import { Heading } from './Heading';
import { IconButton } from './IconButton';
import { X } from './Icon';
import { DIALOG_BOTTOM_SHEET, DIALOG_HEADER, DIALOG_SIZES, DIALOG_SURFACE } from './classes';
import { cx } from './cx';
import type { Size } from './types';
import { useModalDialog } from './useModalDialog';
import { ACTIONS } from '../../copy/common';

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: Size;
  dismissible?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
};


export function Dialog({ open, onClose, title, size = 'md', dismissible = true, footer, children }: DialogProps) {
  const titleId = useId();
  const ref = useModalDialog(open, onClose, dismissible);

  return (
    <dialog ref={ref} aria-labelledby={titleId} className={cx(DIALOG_SURFACE, DIALOG_SIZES[size], DIALOG_BOTTOM_SHEET)}>
      <div className={DIALOG_HEADER}>
        <Heading level="section" as="h2" id={titleId} className="min-w-0">
          {title}
        </Heading>
        {dismissible ? <IconButton icon={X} label={ACTIONS.close} size="sm" onClick={onClose} className="-mr-2 -mt-1" /> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{open ? children : null}</div>
      {footer ? (
        <div className="flex shrink-0 flex-col-reverse gap-3 pb-(--safe-bottom) sm:flex-row sm:justify-end max-sm:*:w-full">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
