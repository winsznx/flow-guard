import React from 'react';
import { ChevronDown, Icon } from './Icon';
import { FIELD_CHOICE_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';

export type SelectOption<V extends string> = { value: V; label: string };

export type SelectProps<V extends string> = FieldBase & {
  label: string;
  options: SelectOption<V>[];
  value: V;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  onValueChange?: (v: V) => void;
  helper?: string;
  error?: string;
  dense?: boolean;
  id?: string;
  className?: string;
};

type LegacySelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
};

type AnySelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onBlur'> & {
  label?: string;
  options: { value: string; label: string }[];
  onValueChange?: (v: string) => void;
  onBlur?: (() => void) | React.FocusEventHandler<HTMLSelectElement>;
  helper?: string;
  error?: string;
  dense?: boolean;
};

export function Select<V extends string>(props: SelectProps<V> | LegacySelectProps) {
  const {
    label,
    options,
    onChange,
    onValueChange,
    helper,
    error,
    dense,
    className,
    id,
    style,
    ...native
  }: AnySelectProps = props as AnySelectProps;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange?.(event);
    onValueChange?.(event.target.value);
  };

  const control = (fieldId: string | undefined, describedBy: string | undefined, invalid: boolean) => (
    <div className="relative">
      <select
        {...native}
        id={fieldId}
        style={style}
        onChange={handleChange}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className={cx(FIELD_CHOICE_CONTROL, FIELD_HEIGHT[dense ? 'dense' : 'regular'], 'appearance-none pr-9')}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 text-ink-muted">
        <Icon icon={ChevronDown} size={16} />
      </span>
    </div>
  );

  if (!label) {
    return <div className={cx('min-w-0', className)}>{control(id, undefined, Boolean(error))}</div>;
  }

  return (
    <Field label={label} helper={helper} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => control(fieldId, describedBy, invalid)}
    </Field>
  );
}
