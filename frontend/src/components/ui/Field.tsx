import React, { useId } from 'react';
import { CircleAlert, Icon } from './Icon';
import { cx } from './cx';
import { LABELS } from '../../copy/common';

export type FieldBase = { name?: string; disabled?: boolean; required?: boolean; onBlur?: () => void };

export type FieldIds = { id: string; describedBy?: string; invalid: boolean };

export type FieldProps = {
  label: string;
  optional?: boolean;
  helper?: string;
  error?: string;
  children: (ids: FieldIds) => React.ReactNode;
  id?: string;
  className?: string;
};

/** For select and button controls, which the browser always treats as read-only. */
export const FIELD_CHOICE_CONTROL =
  'w-full min-w-0 rounded-control border border-line-control bg-surface px-3 text-body text-ink placeholder:text-ink-muted transition-colors duration-(--duration-fast) ease-standard hover:border-ink-muted focus-visible:border-brand aria-invalid:border-danger-dot disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-secondary disabled:border-line';

export const FIELD_CONTROL = `${FIELD_CHOICE_CONTROL} read-only:bg-sunken read-only:text-ink-secondary read-only:border-line`;

export const FIELD_HEIGHT = {
  regular: 'h-touch',
  dense: 'h-control-md pointer-coarse:min-h-touch',
} as const;

export function Field({ label, optional, helper, error, children, id: givenId, className }: FieldProps) {
  const generatedId = useId();
  const id = givenId ?? generatedId;
  const helperId = `${id}-helper`;
  const errorId = `${id}-error`;
  const describedBy = [helper ? helperId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cx('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-label text-ink">
        {label}
        {optional ? <span className="text-ink-muted"> {LABELS.optional}</span> : null}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {helper ? (
        <p id={helperId} className="mt-1.5 text-small text-ink-secondary">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-small text-danger-ink">
          <span className="mt-0.5 inline-flex shrink-0">
            <Icon icon={CircleAlert} size={16} />
          </span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
