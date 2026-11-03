import React, { useRef } from 'react';

export type SegmentedControlProps<V extends string> = {
  label: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
};

export function SegmentedControl<V extends string>({ label, options, value, onChange }: SegmentedControlProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const choose = (index: number) => {
    refs.current[index]?.focus();
    onChange(options[index].value);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const next: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    choose(next[event.key]);
  };

  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full overflow-x-auto rounded-pill bg-sunken p-1">
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => choose(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="inline-flex h-control-sm shrink-0 items-center whitespace-nowrap rounded-pill px-3 text-label text-ink-secondary transition-colors duration-(--duration-fast) ease-standard hover:text-ink pointer-coarse:min-h-touch aria-checked:bg-surface aria-checked:text-ink aria-checked:shadow-raised"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
