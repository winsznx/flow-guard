import { useId } from 'react';
import { CircleAlert, Icon } from './Icon';
import type { Disableable } from './types';

export type RadioOption<V extends string> = { value: V; label: string; description?: string };

export type RadioGroupProps<V extends string> = {
  legend: string;
  name: string;
  options: RadioOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  error?: string;
} & Disableable;

export function RadioGroup<V extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  disabled = false,
  disabledReason,
}: RadioGroupProps<V>) {
  const id = useId();
  const errorId = `${id}-error`;
  const reasonId = `${id}-reason`;
  const describedBy =
    [error ? errorId : undefined, disabled && disabledReason ? reasonId : undefined].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset className="min-w-0" aria-describedby={describedBy} disabled={disabled}>
      <legend className="mb-1.5 text-label text-ink">{legend}</legend>
      <div className="flex flex-col">
        {options.map((option) => {
          const descriptionId = `${id}-${option.value}`;
          return (
            <label
              key={option.value}
              className="flex min-h-touch cursor-pointer items-start gap-3 py-2.5 has-disabled:cursor-not-allowed"
            >
              <span className="relative mt-0.5 size-5 shrink-0">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={option.description ? descriptionId : undefined}
                  className="peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-pill border border-line-control bg-surface transition-colors duration-(--duration-fast) checked:border-brand checked:bg-brand aria-invalid:border-danger-dot disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-1.5 rounded-pill bg-surface invisible peer-checked:visible peer-disabled:bg-ink-muted"
                />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-label text-ink">{option.label}</span>
                {option.description ? (
                  <span id={descriptionId} className="text-small text-ink-secondary">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-small text-danger-ink">
          <span className="mt-0.5 inline-flex shrink-0">
            <Icon icon={CircleAlert} size={16} />
          </span>
          <span>{error}</span>
        </p>
      ) : null}
      {disabled && disabledReason ? (
        <p id={reasonId} className="mt-1.5 text-small text-ink-secondary">
          {disabledReason}
        </p>
      ) : null}
    </fieldset>
  );
}
