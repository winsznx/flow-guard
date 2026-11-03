import { TIME_ZONE_LINE } from './DateInput';
import { FIELD_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';

export type TimeInputProps = FieldBase & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: number;
  helper?: string;
  error?: string;
  id?: string;
  className?: string;
};

export function TimeInput({
  label,
  value,
  onChange,
  step,
  helper,
  error,
  name,
  disabled,
  required,
  onBlur,
  id,
  className,
}: TimeInputProps) {
  return (
    <Field label={label} helper={helper ? `${helper} ${TIME_ZONE_LINE}.` : TIME_ZONE_LINE} error={error} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <input
          id={fieldId}
          type="time"
          name={name}
          value={value}
          step={step}
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
