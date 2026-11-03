import React, { useId } from 'react';
import { CARD_PADDING, CARD_SURFACE } from './Card';
import { cx } from './cx';

export type ChoiceOption<V extends string> = {
  value: V;
  title: string;
  description: string;
  preview?: React.ReactNode;
  /** Shows the choice but refuses it, with `disabledReason` saying why under the description. */
  disabled?: boolean;
  disabledReason?: string;
};

export type ChoiceCardGroupProps<V extends string> = {
  name: string;
  legend: string;
  options: ChoiceOption<V>[];
  value: V | null;
  onChange: (v: V) => void;
  columns?: 1 | 2 | 3;
};

const COLUMNS = {
  1: 'grid gap-3',
  2: 'grid gap-3 sm:grid-cols-2',
  3: 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
} as const;

export function ChoiceCardGroup<V extends string>({ name, legend, options, value, onChange, columns = 2 }: ChoiceCardGroupProps<V>) {
  const reasonPrefix = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-label text-ink">{legend}</legend>
      <div className={COLUMNS[columns]}>
        {options.map((option) => {
          const disabled = Boolean(option.disabled);
          const reasonId = disabled && option.disabledReason ? `${reasonPrefix}-${option.value}` : undefined;
          return (
            <label
              key={option.value}
              className={cx(
                disabled ? CARD_SURFACE.replace('bg-surface', 'bg-sunken') : CARD_SURFACE,
                CARD_PADDING,
                'flex items-start gap-3 transition-colors duration-(--duration-fast) ease-standard',
                disabled
                  ? 'cursor-not-allowed'
                  : 'cursor-pointer hover:border-line-strong has-checked:bg-brand-soft has-checked:border-brand',
              )}
            >
              <span className="relative mt-0.5 size-5 shrink-0">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={value === option.value}
                  disabled={disabled}
                  aria-describedby={reasonId}
                  onChange={() => onChange(option.value)}
                  className="peer absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-pill border border-line-control bg-surface transition-colors duration-(--duration-fast) checked:border-brand checked:bg-brand disabled:cursor-not-allowed disabled:border-line disabled:bg-sunken"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-1.5 rounded-pill bg-surface invisible peer-checked:visible"
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className={cx('text-title-item', disabled ? 'text-ink-muted' : 'text-ink')}>{option.title}</span>
                <span className="text-small text-ink-secondary">{option.description}</span>
                {reasonId ? (
                  <span id={reasonId} className="text-small text-ink-secondary">
                    {option.disabledReason}
                  </span>
                ) : null}
                {option.preview ? <span className="mt-2">{option.preview}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
