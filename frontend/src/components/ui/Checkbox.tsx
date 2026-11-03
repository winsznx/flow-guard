import { useId } from 'react';
import { Check, Icon } from './Icon';
import type { Disableable } from './types';

export type CheckboxProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  name?: string;
} & Disableable;

export function Checkbox({ label, description, checked, onChange, name, disabled = false, disabledReason }: CheckboxProps) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const reasonId = `${id}-reason`;
  const describedBy =
    [description ? descriptionId : undefined, disabled && disabledReason ? reasonId : undefined].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className="min-w-0">
      <label className="flex min-h-touch cursor-pointer items-start gap-3 py-2.5 has-disabled:cursor-not-allowed">
        <span className="relative mt-0.5 size-5 shrink-0">
          <input
            type="checkbox"
            name={name}
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby={describedBy}
            className="peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-inline border border-line-control bg-surface transition-colors duration-(--duration-fast) checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-on-brand invisible peer-checked:visible peer-disabled:text-ink-muted"
          >
            <Icon icon={Check} size={16} />
          </span>
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-label text-ink">{label}</span>
          {description ? (
            <span id={descriptionId} className="text-small text-ink-secondary">
              {description}
            </span>
          ) : null}
        </span>
      </label>
      {disabled && disabledReason ? (
        <p id={reasonId} className="pl-8 text-small text-ink-secondary">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
