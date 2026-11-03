import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a native modal <dialog> in step with the `open` prop and returns focus to the
 * element that opened it. Escape is refused while `dismissible` is false, and if the browser
 * closes the dialog anyway (some engines let a repeated Escape through), it's reopened, so an
 * action in flight can't lose its sheet. A close made by the effect cleanup (StrictMode's dev
 * remount, or a real unmount) never counts as the person closing it, so a dialog that mounts open
 * stays open.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
  dismissible = true,
): RefObject<HTMLDialogElement> {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const dismissibleRef = useRef(dismissible);
  const onCloseRef = useRef(onClose);
  const openerRef = useRef<HTMLElement | null>(null);
  const closedByCleanupRef = useRef(false);

  useEffect(() => {
    openRef.current = open;
    dismissibleRef.current = dismissible;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      if (!dismissibleRef.current) event.preventDefault();
    };

    const handleClose = () => {
      if (closedByCleanupRef.current) {
        closedByCleanupRef.current = false;
        if (openRef.current && dialog.isConnected && !dialog.open) dialog.showModal();
        return;
      }
      if (dialog.open) return;
      if (openRef.current && !dismissibleRef.current) {
        dialog.showModal();
        return;
      }
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus();
      if (openRef.current) onCloseRef.current();
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('close', handleClose);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('close', handleClose);
      if (!dialog.open) return;
      closedByCleanupRef.current = true;
      dialog.close();
    };
  }, []);

  return ref;
}
