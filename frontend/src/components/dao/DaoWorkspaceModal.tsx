import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';

interface DaoWorkspaceModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  onDelete?: () => void;
  deleteLabel?: string;
}

export function DaoWorkspaceModal({
  isOpen,
  title,
  description,
  children,
  onClose,
  onSubmit,
  submitLabel = 'Save changes',
  submitDisabled = false,
  onDelete,
  deleteLabel = 'Delete',
}: DaoWorkspaceModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-textPrimary/60 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 py-5">
          <div>
            <h2 className="font-display text-2xl text-textPrimary">{title}</h2>
            {description && <p className="mt-2 text-sm leading-6 text-textSecondary">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-textMuted transition-colors hover:bg-surfaceAlt hover:text-textPrimary"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-160px)] overflow-y-auto px-6 py-5">{children}</div>

        <div className="flex flex-col gap-3 border-t border-border/70 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {onDelete && (
              <Button variant="ghost" onClick={onDelete} className="justify-start text-textMuted hover:text-primary">
                {deleteLabel}
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {onSubmit && (
              <Button onClick={onSubmit} disabled={submitDisabled}>
                {submitLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
