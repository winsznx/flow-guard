import { useId } from 'react';

export type ProgressMeterProps = { label: string; value: number; max: number };

export function ProgressMeter({ label, value, max }: ProgressMeterProps) {
  const labelId = useId();
  const safeMax = Math.max(0, max);
  const safeValue = Math.min(Math.max(0, value), safeMax);
  const percent = safeMax > 0 ? (safeValue / safeMax) * 100 : 0;

  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label text-ink">
        {label}
      </span>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-valuetext={label}
        className="h-2 overflow-hidden rounded-pill bg-sunken"
      >
        <span className="block h-full rounded-pill bg-brand" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
