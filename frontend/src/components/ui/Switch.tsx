import { useId } from 'react';
import type { Disableable } from './types';

export type SwitchProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
} & Disableable;

const STATE_WORD = { on: 'On', off: 'Off' } as const;

export function Switch({ label, description, checked, onChange, disabled = false, disabledReason }: SwitchProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descriptionId = `${id}-description`;
  const reasonId = `${id}-reason`;
  const showReason = disabled && Boolean(disabledReason);

  const toggle = () => {
    if (!disabled) onChange(!checked);
  };

  return (
    <div className="flex min-w-0 items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-label text-ink">
          {label}
        </span>
        <span id={descriptionId} className="text-small text-ink-secondary">
          {description}
        </span>
        {showReason ? (
          <span id={reasonId} className="text-small text-ink-secondary">
            {disabledReason}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={showReason ? `${descriptionId} ${reasonId}` : descriptionId}
        aria-disabled={disabled || undefined}
        onClick={toggle}
        className="group inline-flex shrink-0 items-center gap-2 rounded-pill aria-disabled:cursor-not-allowed"
      >
        <span className="relative inline-flex h-6 w-11 items-center rounded-pill border border-line-control bg-sunken transition-colors duration-(--duration-fast) ease-standard group-aria-checked:border-brand group-aria-checked:bg-brand group-aria-disabled:border-line group-aria-disabled:bg-sunken">
          <span className="ml-0.5 size-4 rounded-pill bg-line-control group-aria-checked:ml-6 group-aria-checked:bg-surface group-aria-disabled:bg-line-strong" />
        </span>
        <span aria-hidden="true" className="w-7 text-label text-ink-secondary group-aria-disabled:text-ink-muted">
          {checked ? STATE_WORD.on : STATE_WORD.off}
        </span>
      </button>
    </div>
  );
}
