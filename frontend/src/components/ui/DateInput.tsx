import { FIELD_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';

export type DateInputProps = FieldBase & {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  helper?: string;
  error?: string;
  id?: string;
  className?: string;
};

export const TIME_ZONE_LINE = `Times are in your time zone, ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;

export function DateInput({
  label,
  optional,
  value,
  onChange,
  min,
  max,
  helper,
  error,
  name,
  disabled,
  required,
  onBlur,
  id,
  className,
}: DateInputProps) {
  return (
    <Field label={label} optional={optional} helper={helper ? `${helper} ${TIME_ZONE_LINE}.` : TIME_ZONE_LINE} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <input
          id={fieldId}
          type="date"
          name={name}
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cx(FIELD_CONTROL, FIELD_HEIGHT.regular)}
        />
      )}
    </Field>
  );
}
