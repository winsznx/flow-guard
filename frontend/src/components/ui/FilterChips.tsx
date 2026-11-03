import { LABELS } from '../../copy/common';
import { Check, Icon } from './Icon';

export type FilterChipsProps<V extends string> = {
  label: string;
  options: { value: V; label: string; count?: number }[];
  selected: V[];
  onChange: (v: V[]) => void;
  multiple?: boolean;
  /** Shows an "All" chip first, pressed while nothing is selected. Use it when an empty selection means everything. */
  showAll?: boolean;
};

const CHIP =
  'inline-flex h-control-sm shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-line bg-surface px-3 text-label text-ink-secondary transition-colors duration-(--duration-fast) ease-standard hover:border-line-strong hover:text-ink pointer-coarse:min-h-touch aria-pressed:border-brand aria-pressed:bg-brand-soft aria-pressed:text-brand-hover';

export function FilterChips<V extends string>({
  label,
  options,
  selected,
  onChange,
  multiple = false,
  showAll = false,
}: FilterChipsProps<V>) {
  const allPressed = selected.length === 0;
  const toggle = (value: V) => {
    const isOn = selected.includes(value);
    if (multiple) {
      onChange(isOn ? selected.filter((v) => v !== value) : [...selected, value]);
      return;
    }
    onChange(isOn ? [] : [value]);
  };

  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto sm:flex-wrap">
      {showAll ? (
        <button type="button" aria-pressed={allPressed} onClick={() => onChange([])} className={CHIP}>
          {allPressed ? <Icon icon={Check} size={16} /> : null}
          {LABELS.all}
        </button>
      ) : null}
      {options.map((option) => {
        const pressed = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => toggle(option.value)}
            className={CHIP}
          >
            {pressed ? <Icon icon={Check} size={16} /> : null}
            {option.label}
            {option.count !== undefined ? <span className="text-ink-muted">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
