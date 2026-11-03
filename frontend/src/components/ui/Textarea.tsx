import React from 'react';
import { FIELD_CONTROL, Field } from './Field';
import { cx } from './cx';

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'style'> & {
  label: string;
  optional?: boolean;
  helper?: string;
  error?: string;
  maxLength?: number;
  className?: string;
};

type LegacyTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  helpText?: string;
};

type AnyTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  optional?: boolean;
  helper?: string;
  helpText?: string;
  error?: string;
};

const CONTROL = cx(FIELD_CONTROL, 'block min-h-24 py-2.5');

function lengthOf(value: AnyTextareaProps['value']): number {
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number') return String(value).length;
  return 0;
}

export function Textarea(props: TextareaProps | LegacyTextareaProps) {
  const { label, optional, helper, helpText, error, className, id, style, maxLength, ...native }: AnyTextareaProps = props;
  const helperText = helper ?? helpText;
  const count = maxLength !== undefined ? `${lengthOf(native.value)} of ${maxLength} characters` : null;

  return (
    <Field label={label ?? ''} optional={optional} helper={helperText} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <>
          <textarea
            {...native}
            id={fieldId}
            maxLength={maxLength}
            style={style}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={CONTROL}
          />
          {count ? <p className="mt-1.5 text-right text-caption text-ink-muted">{count}</p> : null}
        </>
      )}
    </Field>
  );
}
