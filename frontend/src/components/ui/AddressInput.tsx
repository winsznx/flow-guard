import React, { useState } from 'react';
import { CircleCheck, ClipboardPaste, Icon } from './Icon';
import { IconButton } from './IconButton';
import { FIELD_CONTROL, FIELD_HEIGHT, Field, type FieldBase } from './Field';
import { cx } from './cx';
import { NETWORK_ADJECTIVE } from '../../copy/network';
import { checkAddress, type AddressAccept, type AddressCheck } from '../../utils/address';

export type AddressInputProps = FieldBase & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  network: 'mainnet' | 'chipnet';
  accept?: AddressAccept;
  helper?: string;
  error?: string;
  onValidChange?: (valid: boolean) => void;
  id?: string;
  className?: string;
};

export type CodeCheck = AddressCheck;

const COPY = {
  paste: 'Paste address',
  pasteFailed: "Couldn't paste. Paste with your keyboard instead.",
  valid: `Valid ${NETWORK_ADJECTIVE} address`,
} as const;

type CheckedCodeInputProps = FieldBase & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  check: (value: string) => CodeCheck;
  validLabel: string;
  pasteLabel: string;
  helper?: string;
  error?: string;
  onValidChange?: (valid: boolean) => void;
  id?: string;
  className?: string;
};

export function CheckedCodeInput({
  label,
  value,
  onChange,
  check,
  validLabel,
  pasteLabel,
  helper,
  error,
  onValidChange,
  name,
  disabled,
  required,
  onBlur,
  id,
  className,
}: CheckedCodeInputProps) {
  const [touched, setTouched] = useState(false);
  const [pasteProblem, setPasteProblem] = useState<string | null>(null);

  const result = value.trim() ? check(value) : null;
  const ownError = touched && result && !result.ok ? result.message : undefined;
  const shownError = error ?? pasteProblem ?? ownError;
  // Shown while typing, not on blur, so the form below doesn't move under a click on Continue.
  const validLine = !shownError && result?.ok ? result.display : null;

  const update = (next: string) => {
    setPasteProblem(null);
    onChange(next);
    onValidChange?.(next.trim() ? check(next).ok : false);
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      update(text.trim());
      setTouched(true);
    } catch (problem) {
      console.warn('Clipboard read failed', problem);
      setPasteProblem(COPY.pasteFailed);
    }
  };

  return (
    <Field label={label} helper={helper} error={shownError} id={id} className={className}>
      {({ id: fieldId, describedBy, invalid }) => (
        <>
          <div className="relative">
            <input
              id={fieldId}
              name={name}
              type="text"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              value={value}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => update(event.target.value)}
              onBlur={handleBlur}
              disabled={disabled}
              required={required}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cx(FIELD_CONTROL, FIELD_HEIGHT.regular, 'pr-12 font-mono text-mono')}
            />
            {disabled ? null : (
              <IconButton
                icon={ClipboardPaste}
                label={pasteLabel}
                size="sm"
                onClick={() => void paste()}
                className="absolute right-1.5 top-1/2 -translate-y-1/2"
              />
            )}
          </div>
          {validLine ? (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-small text-success-ink" aria-live="polite">
              <span className="inline-flex shrink-0 text-success-dot">
                <Icon icon={CircleCheck} size={16} />
              </span>
              <span>{validLabel}</span>
              <span className="font-mono text-mono text-ink-secondary">{validLine}</span>
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
}

export function AddressInput({ network, accept = 'address', ...rest }: AddressInputProps) {
  return (
    <CheckedCodeInput
      {...rest}
      check={(value) => checkAddress(value, network, accept)}
      validLabel={COPY.valid}
      pasteLabel={COPY.paste}
    />
  );
}
