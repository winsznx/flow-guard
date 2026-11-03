import React, { useId } from 'react';
import { CircleAlert, Icon } from './Icon';
import { FIELD_CONTROL, FIELD_HEIGHT, Field } from './Field';
import { cx } from './cx';

type NativeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'className' | 'style'>;

export type InputProps = NativeInputProps & {
  label: string;
  optional?: boolean;
  helper?: string;
  error?: string;
  dense?: boolean;
  className?: string;
};

type LegacyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  error?: string;
  helpText?: string;
};

type AnyInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  label?: string;
  optional?: boolean;
  helper?: string;
  helpText?: string;
  error?: string;
  dense?: boolean;
};

export function Input(props: InputProps | LegacyInputProps) {
  const { label, optional, helper, helpText, error, dense, className, id, ...native }: AnyInputProps = props;
  const controlClass = cx(FIELD_CONTROL, FIELD_HEIGHT[dense ? 'dense' : 'regular']);
  const helperText = helper ?? helpText;

  if (!label) {
    return (
      <UnlabeledInput
        native={native}
        id={id}
        className={cx(controlClass, className)}
        helper={helperText}
        error={error}
      />
    );
  }

  return (
    <Field label={label} optional={optional} helper={helperText} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <input
          {...native}
          id={fieldId}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={controlClass}
        />
      )}
    </Field>
  );
}

function UnlabeledInput({
  native,
  id,
  className,
  helper,
  error,
}: {
  native: NativeInputProps;
  id?: string;
  className: string;
  helper?: string;
  error?: string;
}) {
  const generatedId = useId();
  const baseId = id ?? generatedId;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const describedBy = [helper ? helperId : undefined, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <div className="min-w-0">
      <input
        {...native}
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={className}
      />
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
